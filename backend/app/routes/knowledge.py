import shutil
import tempfile
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from .. import rag
from ..config import MAX_UPLOAD_BYTES
from ..db import q, require_project
from ..security import current_user

router = APIRouter(prefix="/api/projects/{project_id}")

DOC_COLUMNS = "id::text, filename, size_bytes, chunk_count, created_at"
MEM_COLUMNS = "id::text, title, content, created_at"


# ---- Base de conocimiento: documentos subidos por el usuario ----


@router.get("/documents")
def list_documents(project_id: UUID, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    return q(f"SELECT {DOC_COLUMNS} FROM documents WHERE project_id = %s ORDER BY created_at DESC", (project_id,))


@router.post("/documents", status_code=201)
def upload_document(
    project_id: UUID,
    file: UploadFile = File(...),
    key_id: UUID = Form(...),
    user_id: str = Depends(current_user),
):
    require_project(user_id, project_id)
    key = rag.load_key(user_id, key_id)
    filename = Path(file.filename or "archivo").name
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "El archivo supera el límite de 25 MB")

    document_id = str(uuid.uuid4())
    with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp.flush()
        size = tmp.tell()
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "El archivo supera el límite de 25 MB")
        pages = rag.load_file(Path(tmp.name), filename)
    if not pages:
        raise HTTPException(422, "No encontramos texto en el archivo. Si es un PDF escaneado, conviértelo a texto primero")

    try:
        chunks = rag.index_document(key, str(project_id), document_id, filename, pages)
        return q(
            f"""INSERT INTO documents (id, project_id, filename, size_bytes, chunk_count)
                VALUES (%s, %s, %s, %s, %s) RETURNING {DOC_COLUMNS}""",
            (document_id, project_id, filename, size, chunks),
            one=True,
        )
    except Exception:
        rag.delete_points(rag.DOCS, "document_id", document_id)  # no dejar vectores huérfanos
        raise


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(project_id: UUID, document_id: UUID, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    if not q("DELETE FROM documents WHERE id = %s AND project_id = %s RETURNING id", (document_id, project_id), one=True):
        raise HTTPException(404, "El documento no existe")
    rag.delete_points(rag.DOCS, "document_id", str(document_id))


# ---- Memorias: conclusiones en Markdown que genera el modelo ----


@router.get("/memories")
def list_memories(project_id: UUID, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    return q(f"SELECT {MEM_COLUMNS} FROM memories WHERE project_id = %s ORDER BY created_at DESC", (project_id,))


@router.delete("/memories/{memory_id}", status_code=204)
def delete_memory(project_id: UUID, memory_id: UUID, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    if not q("DELETE FROM memories WHERE id = %s AND project_id = %s RETURNING id", (memory_id, project_id), one=True):
        raise HTTPException(404, "La memoria no existe")
    rag.delete_points(rag.MEMS, "memory_id", str(memory_id))


def save_memory(key: rag.Key, project_id: str, title: str, content: str) -> dict:
    title, content = title.strip()[:200] or "Memoria sin título", content.strip()
    memory_id = str(uuid.uuid4())
    rag.index_memory(key, project_id, memory_id, title, content)
    try:
        return q(
            f"INSERT INTO memories (id, project_id, title, content) VALUES (%s, %s, %s, %s) RETURNING {MEM_COLUMNS}",
            (memory_id, project_id, title, content),
            one=True,
        )
    except Exception:
        rag.delete_points(rag.MEMS, "memory_id", memory_id)
        raise
