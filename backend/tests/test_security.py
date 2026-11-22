import os

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-0123456789abcdef0123456789")
os.environ.setdefault("BYOK_KEY", "test-byok-secret-0123456789abcdef0123456789")

from datetime import datetime, timedelta, timezone  # noqa: E402

import jwt  # noqa: E402
import pytest  # noqa: E402
from cryptography.exceptions import InvalidTag  # noqa: E402

from app.security import (  # noqa: E402
    check_password,
    decrypt_api_key,
    encrypt_api_key,
    hash_password,
    make_token,
    read_token,
)


def test_api_key_roundtrip_and_binding_to_user():
    blob = encrypt_api_key("sk-secret-1234", "user-a")
    assert b"sk-secret" not in blob
    assert decrypt_api_key(blob, "user-a") == "sk-secret-1234"
    with pytest.raises(InvalidTag):
        decrypt_api_key(blob, "user-b")
    tampered = blob[:-1] + bytes([blob[-1] ^ 1])
    with pytest.raises(InvalidTag):
        decrypt_api_key(tampered, "user-a")


def test_same_key_encrypts_differently_each_time():
    assert encrypt_api_key("sk-x-12345678", "u") != encrypt_api_key("sk-x-12345678", "u")


def test_password_hashing():
    h = hash_password("correct horse")
    assert check_password("correct horse", h)
    assert not check_password("wrong horse", h)


def test_jwt_roundtrip_and_rejections():
    assert read_token(make_token("user-123")) == "user-123"
    expired = jwt.encode(
        {"sub": "u", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, os.environ["JWT_SECRET"], "HS256"
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        read_token(expired)
    forged = jwt.encode({"sub": "u", "exp": datetime.now(timezone.utc) + timedelta(days=1)}, "x" * 40, "HS256")
    with pytest.raises(jwt.InvalidSignatureError):
        read_token(forged)
    unsigned = jwt.encode({"sub": "u", "exp": datetime.now(timezone.utc) + timedelta(days=1)}, None, "none")
    with pytest.raises(jwt.InvalidAlgorithmError):
        read_token(unsigned)
