from typing import Any

from fastapi import HTTPException
from langchain_postgres import PostgresChatMessageHistory
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import DATABASE_URL

CHAT_TABLE = "chat_history"

pool = ConnectionPool(DATABASE_URL, open=False, min_size=1, max_size=10)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  model text NOT NULL,
  base_url text NOT NULL,
  key_hint text NOT NULL,
  key_ciphertext bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename text NOT NULL,
  size_bytes bigint NOT NULL,
  chunk_count int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_links (
  source_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  share_documents boolean NOT NULL,
  share_memories boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, target_id),
  CHECK (source_id <> target_id),
  CHECK (share_documents OR share_memories)
);
"""


def init_db() -> None:
    pool.open(wait=True, timeout=60)
    with pool.connection() as conn:
        conn.execute(SCHEMA)
        PostgresChatMessageHistory.create_tables(conn, CHAT_TABLE)


def q(sql: str, params: Any = (), one: bool = False):
    """Ejecuta una consulta y devuelve filas como dicts (o una sola fila con one=True)."""
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        if cur.description is None:
            return None
        return cur.fetchone() if one else cur.fetchall()


def require_project(user_id: str, project_id: str) -> dict:
    row = q(
        "SELECT id::text, name, description, created_at FROM projects WHERE id = %s AND user_id = %s",
        (project_id, user_id),
        one=True,
    )
    if not row:
        raise HTTPException(404, "Proyecto no encontrado")
    return row
