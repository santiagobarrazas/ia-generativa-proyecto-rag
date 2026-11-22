import os


def _secret(name: str) -> str:
    value = os.environ.get(name, "")
    if len(value) < 32:
        raise RuntimeError(f"La variable de entorno {name} debe tener al menos 32 caracteres")
    return value


JWT_SECRET = _secret("JWT_SECRET")
BYOK_KEY = _secret("BYOK_KEY")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant:6333")

# Todos los vectores de una colección deben venir del mismo modelo, por eso es global y no por key.
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", "1536"))

COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
SESSION_DAYS = 7
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
