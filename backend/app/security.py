import hashlib
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Cookie, HTTPException

from .config import BYOK_KEY, JWT_SECRET, SESSION_DAYS

COOKIE_NAME = "session"

# SHA-256 convierte un secreto de cualquier longitud en una clave AES-256 de 32 bytes.
_aes = AESGCM(hashlib.sha256(BYOK_KEY.encode()).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()


def check_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


# Se compara contra este hash cuando el correo no existe, para que el tiempo de respuesta no lo delate.
DUMMY_HASH = hash_password("timing-equalizer-not-a-real-password")


def encrypt_api_key(plain: str, user_id: str) -> bytes:
    nonce = os.urandom(12)
    # El user_id va como dato asociado: un ciphertext copiado a otro usuario no se puede descifrar.
    return nonce + _aes.encrypt(nonce, plain.encode(), user_id.encode())


def decrypt_api_key(blob: bytes, user_id: str) -> str:
    blob = bytes(blob)
    return _aes.decrypt(blob[:12], blob[12:], user_id.encode()).decode()


def make_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(days=SESSION_DAYS)},
        JWT_SECRET,
        algorithm="HS256",
    )


def read_token(token: str) -> str:
    payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"require": ["sub", "exp"]})
    return payload["sub"]


def current_user(session: str | None = Cookie(default=None)) -> str:
    if not session:
        raise HTTPException(401, "Inicia sesión para continuar")
    try:
        return read_token(session)
    except jwt.PyJWTError:
        raise HTTPException(401, "Tu sesión expiró, vuelve a iniciar sesión")
