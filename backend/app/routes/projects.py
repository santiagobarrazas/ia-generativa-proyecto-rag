from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import rag
from ..db import CHAT_TABLE, pool, q, require_project
from ..security import current_user

router = APIRouter(prefix="/api/projects")


class ProjectBody(BaseModel):
    name: str
    description: str = ""


class LinkBody(BaseModel):
    target_id: UUID
    share_documents: bool
    share_memories: bool
    reciprocal: bool = False


@router.get("")
def list_projects(user_id: str = Depends(current_user)):
    return q(
        """SELECT p.id::text, p.name, p.description, p.created_at,
                  (SELECT count(*) FROM documents d WHERE d.project_id = p.id) AS documents,
                  (SELECT count(*) FROM memories m WHERE m.project_id = p.id) AS memories,
                  (SELECT count(*) FROM project_links l WHERE l.source_id = p.id) AS links
           FROM projects p WHERE p.user_id = %s ORDER BY p.created_at DESC""",
        (user_id,),
    )


def _clean(body: ProjectBody) -> tuple[str, str]:
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Ponle un nombre al proyecto")
    return name[:120], body.description.strip()[:500]


@router.post("", status_code=201)
def create_project(body: ProjectBody, user_id: str = Depends(current_user)):
    return q(
        "INSERT INTO projects (user_id, name, description) VALUES (%s, %s, %s) RETURNING id::text, name, description, created_at",
        (user_id, *_clean(body)),
        one=True,
    )


@router.get("/{project_id}")
def get_project(project_id: UUID, user_id: str = Depends(current_user)):
    return require_project(user_id, project_id)


@router.patch("/{project_id}")
def update_project(project_id: UUID, body: ProjectBody, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    return q(
        "UPDATE projects SET name = %s, description = %s WHERE id = %s RETURNING id::text, name, description, created_at",
        (*_clean(body), project_id),
        one=True,
    )


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: UUID, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    pid = str(project_id)
    rag.delete_points(rag.DOCS, "project_id", pid)
    rag.delete_points(rag.MEMS, "project_id", pid)
    q(f"DELETE FROM {CHAT_TABLE} WHERE session_id = %s", (project_id,))
    q("DELETE FROM projects WHERE id = %s", (project_id,))  # cascada: documentos, memorias y conexiones


# ---- Conexiones entre proyectos (dirigidas: A -> B da a A acceso a lo que B comparte) ----


@router.get("/{project_id}/links")
def list_links(project_id: UUID, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    outgoing = q(
        """SELECT l.target_id::text AS project_id, p.name, l.share_documents, l.share_memories, l.created_at,
                  EXISTS (SELECT 1 FROM project_links r WHERE r.source_id = l.target_id AND r.target_id = l.source_id) AS mutual
           FROM project_links l JOIN projects p ON p.id = l.target_id
           WHERE l.source_id = %s ORDER BY p.name""",
        (project_id,),
    )
    incoming = q(
        """SELECT l.source_id::text AS project_id, p.name, l.share_documents, l.share_memories, l.created_at
           FROM project_links l JOIN projects p ON p.id = l.source_id
           WHERE l.target_id = %s ORDER BY p.name""",
        (project_id,),
    )
    return {"outgoing": outgoing, "incoming": incoming}


def _upsert_link(conn, source, target, docs: bool, mems: bool) -> None:
    conn.execute(
        """INSERT INTO project_links (source_id, target_id, share_documents, share_memories)
           VALUES (%s, %s, %s, %s)
           ON CONFLICT (source_id, target_id)
           DO UPDATE SET share_documents = EXCLUDED.share_documents, share_memories = EXCLUDED.share_memories""",
        (source, target, docs, mems),
    )


@router.put("/{project_id}/links")
def connect(project_id: UUID, body: LinkBody, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    require_project(user_id, body.target_id)
    if body.target_id == project_id:
        raise HTTPException(422, "Un proyecto no se puede conectar consigo mismo")
    if not (body.share_documents or body.share_memories):
        raise HTTPException(422, "Elige al menos documentos o memorias para conectar")
    with pool.connection() as conn, conn.transaction():
        _upsert_link(conn, project_id, body.target_id, body.share_documents, body.share_memories)
        if body.reciprocal:
            _upsert_link(conn, body.target_id, project_id, body.share_documents, body.share_memories)
    return list_links(project_id, user_id)


@router.delete("/{project_id}/links/{target_id}")
def disconnect(project_id: UUID, target_id: UUID, reciprocal: bool = False, user_id: str = Depends(current_user)):
    require_project(user_id, project_id)
    require_project(user_id, target_id)
    with pool.connection() as conn, conn.transaction():
        deleted = conn.execute(
            "DELETE FROM project_links WHERE source_id = %s AND target_id = %s", (project_id, target_id)
        ).rowcount
        if not deleted:
            raise HTTPException(404, "Esos proyectos no están conectados")
        if reciprocal:
            conn.execute("DELETE FROM project_links WHERE source_id = %s AND target_id = %s", (target_id, project_id))
    return list_links(project_id, user_id)


def project_scope(project_id: str) -> tuple[list[str], list[str], dict[str, str]]:
    """IDs de proyecto donde buscar documentos y memorias: el propio más los conectados."""
    own = q("SELECT name FROM projects WHERE id = %s", (project_id,), one=True)
    names = {project_id: own["name"]}
    doc_ids, mem_ids = [project_id], [project_id]
    for link in q(
        """SELECT l.target_id::text AS id, p.name, l.share_documents, l.share_memories
           FROM project_links l JOIN projects p ON p.id = l.target_id WHERE l.source_id = %s""",
        (project_id,),
    ):
        names[link["id"]] = link["name"]
        if link["share_documents"]:
            doc_ids.append(link["id"])
        if link["share_memories"]:
            mem_ids.append(link["id"])
    return doc_ids, mem_ids, names
