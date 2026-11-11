import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional
import secrets
import jwt
from passlib.context import CryptContext

from core.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS


# Codes avoid characters that are easy to confuse when they are read aloud or
# copied by hand: I, O, 0 and 1.
GALLERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_gallery_code(length: int = 12) -> str:
    """Create a one-time gallery code such as ``K7M4-P9QX-2RTF``."""
    raw = "".join(
        secrets.choice(GALLERY_CODE_ALPHABET) for _ in range(length)
    )
    return "-".join(raw[index : index + 4] for index in range(0, length, 4))


def normalize_gallery_code(code: str) -> str:
    """Drop separators and characters that are not part of a code."""
    return "".join(
        character
        for character in code.upper()
        if character in GALLERY_CODE_ALPHABET
    )


def hash_gallery_code(code: str) -> str:
    """Hash a code with the server secret so the database never stores it."""
    normalized = normalize_gallery_code(code)
    return hmac.new(
        SECRET_KEY.encode(),
        normalized.encode(),
        hashlib.sha256,
    ).hexdigest()


def hash_gallery_token(token: str) -> str:
    """Hash an opaque browser session token before storing it."""
    return hashlib.sha256(token.encode()).hexdigest()


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password):
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)



def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Invalid token type")
    return payload


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        # Make every rotated token unique even when two refreshes happen in
        # the same second. Without this, identical JWT payloads produce the
        # same token and rotation does not actually change the cookie value.
        "jti": secrets.token_hex(4),
    })
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_refresh_token(token: str):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "refresh":
        raise jwt.InvalidTokenError("Invalid token type")
    return payload
