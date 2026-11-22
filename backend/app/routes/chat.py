import json
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_postgres import PostgresChatMessageHistory
from pydantic import BaseModel

from .. import rag
from ..db import CHAT_TABLE, pool, q, require_project
from ..security import current_user
from .knowledge import save_memory
from .projects import project_scope

router = APIRouter(prefix="/api/projects/{project_id}")

DOCS_K, MEMS_K = 6, 4
# shortcut: solo se envían los últimos 40 mensajes del chat; si los chats crecen mucho, resumir los antiguos.
HISTORY_LIMIT = 40

SAVE_MEMORY_TOOL = {
    "type": "function",
    "function": {
        "name": "save_memory",
        "description": (
            "Guarda una memoria permanente del proyecto en Markdown. Úsala SOLO cuando el usuario pida "
            "explícitamente generar, crear o guardar una memoria."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Título corto y específico de la memoria"},
                "content": {
                    "type": "string",
                    "description": (
                        "Markdown autocontenido: contexto, la conclusión a la que se llegó y los detalles "
                        "necesarios para entenderla sin leer el chat."
                    ),
                },
            },
            "required": ["title", "content"],
        },
    },
}

SYSTEM = """Eres el asistente del proyecto «{project}».

Cómo responder:
- Usa el contexto recuperado cuando sea relevante y cita la fuente en línea con su etiqueta, por ejemplo [D2] o [M1]. Nunca inventes etiquetas.
- [D#] son fragmentos de documentos que subió el usuario. [M#] son memorias: conclusiones guardadas en conversaciones anteriores.
- Si el contexto no alcanza para responder, dilo y, si respondes con conocimiento general, acláralo.
- Cuando el usuario pida generar o guardar una memoria, llama a la herramienta save_memory. Escribe el contenido en Markdown y resume la conclusión de esta conversación. Después confirma en una frase qué guardaste.
- Responde en el idioma del usuario y usa Markdown.

## Documentos recuperados
{documents}

## Memorias recuperadas
{memories}
"""


class ChatBody(BaseModel):
    message: str
    key_id: UUID


def _history(conn, project_id: UUID) -> PostgresChatMessageHistory:
    return PostgresChatMessageHistory(CHAT_TABLE, str(project_id), sync_connection=conn)


@router.get("/messages")
def list_messages(project_id: UUID, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    rows = q(f"SELECT id, message, created_at FROM {CHAT_TABLE} WHERE session_id = %s ORDER BY id", (project_id,))
    return [
        {
            "id": r["id"],
            "role": "user" if r["message"]["type"] == "human" else "assistant",
            "content": r["message"]["data"]["content"],
            "sources": r["message"]["data"].get("additional_kwargs", {}).get("sources", []),
            "memories": r["message"]["data"].get("additional_kwargs", {}).get("memories", []),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@router.delete("/messages", status_code=204)
def clear_messages(project_id: UUID, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    with pool.connection() as conn:
        _history(conn, project_id).clear()


def _retrieve(key: rag.Key, project_id: str, question: str):
    """Doble RAG: primero la base de conocimiento, luego las memorias, con el mismo vector de consulta."""
    doc_ids, mem_ids, names = project_scope(project_id)
    has_docs = q("SELECT 1 FROM documents WHERE project_id = ANY(%s::uuid[]) LIMIT 1", (doc_ids,), one=True)
    has_mems = q("SELECT 1 FROM memories WHERE project_id = ANY(%s::uuid[]) LIMIT 1", (mem_ids,), one=True)
    if not (has_docs or has_mems):
        return [], "(sin documentos)", "(sin memorias)"

    vector = rag.embeddings_for(key).embed_query(question)
    sources, blocks = [], {"D": [], "M": []}
    for prefix, kind, collection, ids, k, present in (
        ("D", "document", rag.DOCS, doc_ids, DOCS_K, has_docs),
        ("M", "memory", rag.MEMS, mem_ids, MEMS_K, has_mems),
    ):
        hits = rag.search(collection, key, vector, ids, k) if present else []
        for i, (doc, score) in enumerate(hits, 1):
            ref, meta = f"{prefix}{i}", doc.metadata
            origin = meta["project_id"]
            label = meta["source"] + (f", p. {meta['page']}" if meta.get("page") else "")
            if origin != project_id:
                label += f" · proyecto «{names.get(origin, '?')}»"
            blocks[prefix].append(f"[{ref}] ({label})\n{doc.page_content}")
            sources.append(
                {
                    "ref": ref,
                    "kind": kind,
                    "title": meta["source"],
                    "page": meta.get("page"),
                    "project_id": origin,
                    "project_name": names.get(origin),
                    "external": origin != project_id,
                    "snippet": doc.page_content[:400],
                    "score": round(score, 3),
                }
            )
    return sources, "\n\n".join(blocks["D"]) or "(sin resultados)", "\n\n".join(blocks["M"]) or "(sin resultados)"


@router.post("/chat")
def chat(project_id: UUID, body: ChatBody, user_id: str = Depends(current_user)):
    project = require_project(user_id, project_id)
    question = body.message.strip()
    if not question:
        raise HTTPException(422, "Escribe un mensaje")
    key = rag.load_key(user_id, body.key_id)
    pid = str(project_id)

    sources, documents, memories = _retrieve(key, pid, question)

    with pool.connection() as conn:
        past = _history(conn, project_id).get_messages()[-HISTORY_LIMIT:]
    # Solo texto: los metadatos guardados (fuentes) no deben volver al modelo.
    history = [HumanMessage(m.content) if m.type == "human" else AIMessage(m.content) for m in past]

    messages = [
        SystemMessage(SYSTEM.format(project=project["name"], documents=documents, memories=memories)),
        *history,
        HumanMessage(question),
    ]
    llm = rag.chat_model(key).bind_tools([SAVE_MEMORY_TOOL])
    created = []
    for _ in range(3):
        reply = llm.invoke(messages)
        if not reply.tool_calls:
            break
        messages.append(reply)
        for call in reply.tool_calls:
            if call["name"] == "save_memory":
                args = call["args"]
                memory = save_memory(key, pid, str(args.get("title", "")), str(args.get("content", "")))
                created.append({"id": memory["id"], "title": memory["title"]})
                result = json.dumps({"saved": True, "title": memory["title"]}, ensure_ascii=False)
            else:
                result = json.dumps({"error": f"Herramienta desconocida: {call['name']}"})
            messages.append(ToolMessage(result, tool_call_id=call["id"]))

    answer = reply.text.strip() or (
        "Guardé la memoria «" + created[-1]["title"] + "»." if created else "El modelo no devolvió texto."
    )
    cited = set(re.findall(r"\[([DM]\d+)\]", answer))
    for s in sources:
        s["cited"] = s["ref"] in cited

    with pool.connection() as conn:
        _history(conn, project_id).add_messages(
            [HumanMessage(question), AIMessage(answer, additional_kwargs={"sources": sources, "memories": created})]
        )
    return {"answer": answer, "sources": sources, "memories": created}
