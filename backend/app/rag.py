"""Todo lo que toca LangChain + Qdrant: carga de archivos, chunking, embeddings y búsqueda."""

import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException
from langchain_community.document_loaders import BSHTMLLoader, CSVLoader, PyPDFLoader, TextLoader
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient, models

from .config import EMBEDDING_DIM, EMBEDDING_MODEL, QDRANT_URL
from .db import q
from .security import decrypt_api_key

DOCS = "documents"
MEMS = "memories"

qdrant = QdrantClient(url=QDRANT_URL)
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)

SUPPORTED = {".pdf", ".txt", ".md", ".markdown", ".csv", ".html", ".htm"}


def init_qdrant() -> None:
    for name, id_field in ((DOCS, "document_id"), (MEMS, "memory_id")):
        if qdrant.collection_exists(name):
            continue
        qdrant.create_collection(
            name,
            vectors_config=models.VectorParams(size=EMBEDDING_DIM, distance=models.Distance.COSINE),
        )
        # project_id es el "tenant": Qdrant agrupa los puntos por proyecto y filtra rápido.
        qdrant.create_payload_index(
            name,
            "metadata.project_id",
            models.KeywordIndexParams(type=models.KeywordIndexType.KEYWORD, is_tenant=True),
        )
        qdrant.create_payload_index(name, f"metadata.{id_field}", models.PayloadSchemaType.KEYWORD)


@dataclass
class Key:
    api_key: str
    base_url: str
    model: str


def load_key(user_id: str, key_id: str | None) -> Key:
    if not key_id:
        raise HTTPException(400, "Selecciona una API key antes de continuar")
    row = q(
        "SELECT key_ciphertext, base_url, model FROM api_keys WHERE id = %s AND user_id = %s",
        (key_id, user_id),
        one=True,
    )
    if not row:
        raise HTTPException(404, "La API key seleccionada no existe")
    return Key(decrypt_api_key(row["key_ciphertext"], user_id), row["base_url"], row["model"])


def embeddings_for(key: Key) -> OpenAIEmbeddings:
    # Los chunks miden ~1000 caracteres, así que no hace falta tokenizar con tiktoken antes de enviar.
    return OpenAIEmbeddings(
        model=EMBEDDING_MODEL, api_key=key.api_key, base_url=key.base_url, check_embedding_ctx_length=False
    )


def chat_model(key: Key) -> ChatOpenAI:
    return ChatOpenAI(model=key.model, api_key=key.api_key, base_url=key.base_url, max_retries=1, timeout=120)


def store(collection: str, key: Key) -> QdrantVectorStore:
    return QdrantVectorStore(qdrant, collection, embeddings_for(key), validate_collection_config=False)


def load_file(path: Path, filename: str) -> list[Document]:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        loader = PyPDFLoader(str(path))
    elif ext == ".csv":
        loader = CSVLoader(str(path), encoding="utf-8")
    elif ext in (".html", ".htm"):
        loader = BSHTMLLoader(str(path))
    elif ext in SUPPORTED:
        loader = TextLoader(str(path), encoding="utf-8", autodetect_encoding=True)
    else:
        raise HTTPException(415, f"Formato {ext or 'sin extensión'} no soportado. Usa PDF, TXT, MD, CSV o HTML")
    return [d for d in loader.load() if d.page_content.strip()]


def index_document(key: Key, project_id: str, document_id: str, filename: str, pages: list[Document]) -> int:
    chunks = splitter.split_documents(pages)
    for i, chunk in enumerate(chunks):
        page = chunk.metadata.get("page")
        chunk.metadata = {
            "project_id": project_id,
            "document_id": document_id,
            "source": filename,
            "page": page + 1 if isinstance(page, int) else None,
            "chunk": i,
        }
    store(DOCS, key).add_documents(chunks, ids=[str(uuid.uuid4()) for _ in chunks])
    return len(chunks)


def index_memory(key: Key, project_id: str, memory_id: str, title: str, content: str) -> None:
    chunks = splitter.create_documents(
        [content], metadatas=[{"project_id": project_id, "memory_id": memory_id, "source": title}]
    )
    store(MEMS, key).add_documents(chunks, ids=[str(uuid.uuid4()) for _ in chunks])


def search(collection: str, key: Key, vector: list[float], project_ids: list[str], k: int):
    if not project_ids:
        return []
    flt = models.Filter(
        must=[models.FieldCondition(key="metadata.project_id", match=models.MatchAny(any=project_ids))]
    )
    return store(collection, key).similarity_search_with_score_by_vector(vector, k=k, filter=flt)


def delete_points(collection: str, field: str, value: str) -> None:
    qdrant.delete(
        collection,
        points_selector=models.FilterSelector(
            filter=models.Filter(must=[models.FieldCondition(key=f"metadata.{field}", match=models.MatchValue(value=value))])
        ),
    )
