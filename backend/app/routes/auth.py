import psycopg
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from ..config import COOKIE_SECURE, SESSION_DAYS
from ..db import q
from ..security import COOKIE_NAME, DUMMY_HASH, check_password, current_user, hash_password, make_token

router = APIRouter(prefix="/api/auth")


class Register(BaseModel):
    name: str
    email: str
    password: str


class Login(BaseModel):
    email: str
    password: str


def _set_session(response: Response, user_id: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        make_token(user_id),
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )


@router.post("/register", status_code=201)
def register(body: Register, response: Response):
    name, email = body.name.strip(), body.email.strip().lower()
    if not name:
        raise HTTPException(422, "Escribe tu nombre")
    local, _, domain = email.partition("@")
    if not local or "." not in domain:
        raise HTTPException(422, "Escribe un correo válido, por ejemplo ana@universidad.edu")
    if len(body.password) < 8:
        raise HTTPException(422, "La contraseña debe tener al menos 8 caracteres")
    if len(body.password.encode()) > 72:
        raise HTTPException(422, "La contraseña puede tener como máximo 72 bytes")
    try:
        user = q(
            "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s) RETURNING id::text, name, email",
            (name, email, hash_password(body.password)),
            one=True,
        )
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "Ya existe una cuenta con ese correo. Inicia sesión")
    _set_session(response, user["id"])
    return user


@router.post("/login")
def login(body: Login, response: Response):
    user = q(
        "SELECT id::text, name, email, password_hash FROM users WHERE email = %s",
        (body.email.strip().lower(),),
        one=True,
    )
    too_long = len(body.password.encode()) > 72  # bcrypt rechaza más de 72 bytes; nunca coincidiría
    password = "x" if too_long else body.password
    if not check_password(password, user["password_hash"] if user else DUMMY_HASH) or not user or too_long:
        raise HTTPException(401, "El correo o la contraseña no coinciden")
    _set_session(response, user["id"])
    return {"id": user["id"], "name": user["name"], "email": user["email"]}


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me")
def me(user_id: str = Depends(current_user)):
    user = q("SELECT id::text, name, email FROM users WHERE id = %s", (user_id,), one=True)
    if not user:
        raise HTTPException(401, "Inicia sesión para continuar")
    return user
