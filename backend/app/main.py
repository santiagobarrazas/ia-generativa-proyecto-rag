from contextlib import asynccontextmanager

import openai
from cryptography.exceptions import InvalidTag
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import rag
from .db import init_db, pool
from .routes import auth, chat, keys, knowledge, projects


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    rag.init_qdrant()
    yield
    pool.close()


app = FastAPI(title="Proyecto RAG", lifespan=lifespan)
for module in (auth, keys, projects, knowledge, chat):
    app.include_router(module.router)


@app.get("/api/health")
def health():
    return {"ok": True}


def _error(status: int, detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=status)


@app.exception_handler(openai.APIStatusError)
def provider_status_error(_: Request, exc: openai.APIStatusError):
    messages = {
        401: "El proveedor rechazó la API key (401). Revísala en la sección de API keys",
        403: "La API key no tiene permiso para este modelo (403)",
        404: f"El proveedor no encontró el modelo o la ruta (404): {exc.message}",
        429: "El proveedor limitó la solicitud (429): límite de uso o saldo agotado",
    }
    return _error(502, messages.get(exc.status_code, f"Error del proveedor ({exc.status_code}): {exc.message}"))


@app.exception_handler(openai.APIConnectionError)
def provider_connection_error(_: Request, exc: openai.APIConnectionError):
    return _error(502, "No se pudo conectar con el proveedor del modelo. Revisa la URL base de la key")


@app.exception_handler(InvalidTag)
def key_decrypt_error(_: Request, exc: InvalidTag):
    return _error(409, "No se pudo descifrar la API key porque BYOK_KEY cambió en el servidor. Vuelve a registrarla")
