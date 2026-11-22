from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import q
from ..security import current_user, encrypt_api_key

router = APIRouter(prefix="/api/keys")

COLUMNS = "id::text, label, model, base_url, key_hint, created_at"


class NewKey(BaseModel):
    label: str
    api_key: str
    model: str = "gpt-6-luna"
    base_url: str = "https://api.openai.com/v1"


@router.get("")
def list_keys(user_id: str = Depends(current_user)):
    return q(f"SELECT {COLUMNS} FROM api_keys WHERE user_id = %s ORDER BY created_at", (user_id,))


@router.post("", status_code=201)
def create_key(body: NewKey, user_id: str = Depends(current_user)):
    label, api_key, model = body.label.strip(), body.api_key.strip(), body.model.strip()
    base_url = body.base_url.strip().rstrip("/")
    if not label or not model:
        raise HTTPException(422, "Ponle un nombre a la key y escribe el modelo")
    if len(api_key) < 8:
        raise HTTPException(422, "La API key parece incompleta")
    url = urlparse(base_url)
    if url.scheme not in ("http", "https") or not url.netloc:
        raise HTTPException(422, "La URL base debe empezar con http:// o https://")
    return q(
        f"""INSERT INTO api_keys (user_id, label, model, base_url, key_hint, key_ciphertext)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING {COLUMNS}""",
        (user_id, label, model, base_url, api_key[-4:], encrypt_api_key(api_key, user_id)),
        one=True,
    )


@router.delete("/{key_id}", status_code=204)
def delete_key(key_id: UUID, user_id: str = Depends(current_user)):
    if not q("DELETE FROM api_keys WHERE id = %s AND user_id = %s RETURNING id", (key_id, user_id), one=True):
        raise HTTPException(404, "La API key no existe")
