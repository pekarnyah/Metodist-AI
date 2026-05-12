import os
import secrets
import bcrypt
import shutil
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr, constr
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from db.database import get_db
from db.models import User, UserOTP
from core.mail import send_otp_email

router = APIRouter(tags=["Auth"])

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"

ENV = os.getenv("ENV", "development").lower()
COOKIE_SECURE = os.getenv("COOKIE_SECURE")
if COOKIE_SECURE is None:
    COOKIE_SECURE = ENV == "production"
else:
    COOKIE_SECURE = COOKIE_SECURE.lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN") or None

ACCESS_TOKEN_TTL_MINUTES = int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "15"))
REFRESH_TOKEN_TTL_DAYS = int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "7"))
CSRF_TTL_HOURS = int(os.getenv("CSRF_TTL_HOURS", "8"))

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"
PRIV_ROLES = {"Owner", "Administrator", "Support"}
DAILY_GENERATION_LIMITS = {
    "Free": 1,
    "Pro": 3,
    "VIP": 10,
}


def is_privileged(user: User) -> bool:
    return user.role in PRIV_ROLES


class UserCreate(BaseModel):
    email: EmailStr
    password: constr(min_length=6, max_length=128)


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    code: constr(strip_whitespace=True, min_length=6, max_length=6, pattern=r"^\d{6}$")


class GoogleAuth(BaseModel):
    token: constr(min_length=10)


def _require_secret():
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is not set")


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _create_token(subject: str, expires_delta: timedelta, token_type: str) -> str:
    _require_secret()
    to_encode = {"sub": subject, "typ": token_type, "exp": datetime.utcnow() + expires_delta}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(subject: str) -> str:
    return _create_token(subject, timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES), "access")


def create_refresh_token(subject: str) -> str:
    return _create_token(subject, timedelta(days=REFRESH_TOKEN_TTL_DAYS), "refresh")


def _decode_token(token: str, expected_type: str) -> dict:
    _require_secret()
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("typ") != expected_type:
        raise HTTPException(status_code=401)
    return payload


def _cookie_args(max_age: int, http_only: bool) -> dict:
    args = {
        "max_age": max_age,
        "httponly": http_only,
        "secure": COOKIE_SECURE,
        "samesite": COOKIE_SAMESITE,
        "path": "/",
    }
    if COOKIE_DOMAIN:
        args["domain"] = COOKIE_DOMAIN
    return args


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        **_cookie_args(ACCESS_TOKEN_TTL_MINUTES * 60, http_only=True),
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        **_cookie_args(REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60, http_only=True),
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=COOKIE_DOMAIN)
    response.delete_cookie(REFRESH_COOKIE, path="/", domain=COOKIE_DOMAIN)
    response.delete_cookie(CSRF_COOKIE, path="/", domain=COOKIE_DOMAIN)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_csrf_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        CSRF_COOKIE,
        token,
        **_cookie_args(CSRF_TTL_HOURS * 60 * 60, http_only=False),
    )


def _get_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _get_bearer_token(request) or request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(status_code=401)

    try:
        payload = _decode_token(token, "access")
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=401)
        user = db.query(User).filter(User.email == sub).first()
        if not user:
            raise HTTPException(status_code=401)
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account inactive")
        if user.is_banned:
            raise HTTPException(status_code=403, detail="Account banned")

        now = datetime.utcnow()
        changed = False

        # Перевірка кінця підписки
        if user.subscription != "Free" and user.subscription_ends_at and now >= user.subscription_ends_at:
            user.subscription = "Free"
            user.subscription_ends_at = None
            user.free_generations = max(user.free_generations or 0, DAILY_GENERATION_LIMITS["Free"])
            changed = True

        # Щоденне оновлення кредитів
        if not user.tokens_reset_at:
            user.tokens_reset_at = now + timedelta(hours=24)
            changed = True
        elif now >= user.tokens_reset_at:
            baseline = DAILY_GENERATION_LIMITS.get(user.subscription, DAILY_GENERATION_LIMITS["Free"])
            if (user.free_generations or 0) < baseline:
                user.free_generations = baseline
            user.tokens_reset_at = now + timedelta(hours=24)
            changed = True

        if changed:
            db.commit()

        return user
    except JWTError:
        raise HTTPException(status_code=401)


async def get_current_admin(u: User = Depends(get_current_user)) -> User:
    if not is_privileged(u):
        raise HTTPException(status_code=403)
    return u


async def csrf_protect(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    if _get_bearer_token(request):
        return
    cookie_token = request.cookies.get(CSRF_COOKIE)
    header_token = request.headers.get("X-CSRF-Token")
    if not cookie_token or not header_token:
        raise HTTPException(status_code=403, detail="CSRF token missing")
    if not secrets.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=403, detail="CSRF token invalid")


@router.get("/auth/csrf")
async def get_csrf(response: Response):
    token = generate_csrf_token()
    set_csrf_cookie(response, token)
    return {"status": "ok"}


@router.post("/auth/refresh", dependencies=[Depends(csrf_protect)])
async def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401)
    try:
        payload = _decode_token(token, "refresh")
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=401)
        user = db.query(User).filter(User.email == sub).first()
        if not user:
            raise HTTPException(status_code=401)
        if not user.is_active or user.is_banned:
            raise HTTPException(status_code=403)

        access = create_access_token(user.email)
        refresh = create_refresh_token(user.email)
        set_auth_cookies(response, access, refresh)
        set_csrf_cookie(response, generate_csrf_token())
        return {"access_token": access, "token_type": "bearer"}
    except JWTError:
        raise HTTPException(status_code=401)


@router.post("/auth/logout", dependencies=[Depends(csrf_protect)])
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"status": "ok"}


@router.post("/register")
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=400, detail="Email вже зайнятий")
        db.delete(existing)
        db.commit()
    new_user = User(email=user_data.email, hashed_password=get_password_hash(user_data.password), is_active=False)
    db.add(new_user)
    db.commit()
    otp = "".join(secrets.choice("0123456789") for _ in range(6))
    db.add(UserOTP(email=user_data.email, code=otp, expires_at=datetime.utcnow() + timedelta(minutes=15)))
    db.commit()
    sent = await send_otp_email(user_data.email, otp)
    if not sent and ENV == "production":
        raise HTTPException(status_code=502, detail="Не вдалося надіслати код підтвердження")

    payload = {"message": "Код надіслано"}
    if not sent or LOG_OTP or ENV != "production":
        payload["dev_code"] = otp
    return payload


@router.post("/auth/verify-registration")
async def verify_reg(data: VerifyOTPRequest, response: Response, db: Session = Depends(get_db)):
    otp = db.query(UserOTP).filter(UserOTP.email == data.email, UserOTP.code == data.code).first()
    if not otp or otp.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Невірний код")
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        user.is_active = True
        db.delete(otp)
        db.commit()
        access = create_access_token(user.email)
        refresh = create_refresh_token(user.email)
        set_auth_cookies(response, access, refresh)
        set_csrf_cookie(response, generate_csrf_token())
        return {"access_token": access, "token_type": "bearer"}
    raise HTTPException(status_code=404)


@router.post("/login")
async def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Акаунт не активовано")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Акаунт заблоковано")
    access = create_access_token(user.email)
    refresh = create_refresh_token(user.email)
    set_auth_cookies(response, access, refresh)
    set_csrf_cookie(response, generate_csrf_token())
    return {"access_token": access, "token_type": "bearer"}


@router.post("/auth/google")
async def google_auth(data: GoogleAuth, response: Response, db: Session = Depends(get_db)):
    try:
        info = id_token.verify_oauth2_token(
            data.token, google_requests.Request(), os.getenv("GOOGLE_CLIENT_ID")
        )
        user = db.query(User).filter(User.email == info["email"]).first()
        if not user:
            user = User(
                email=info["email"],
                hashed_password=get_password_hash(secrets.token_hex(8)),
                name=info.get("name", ""),
                avatar_url=info.get("picture", ""),
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        if user.is_banned:
            raise HTTPException(status_code=403, detail="Акаунт заблоковано")
        access = create_access_token(user.email)
        refresh = create_refresh_token(user.email)
        set_auth_cookies(response, access, refresh)
        set_csrf_cookie(response, generate_csrf_token())
        return {"access_token": access, "token_type": "bearer"}
    except Exception:
        raise HTTPException(status_code=400)


@router.get("/me")
async def get_me(u: User = Depends(get_current_user)):
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "avatar_url": u.avatar_url,
        "subscription": u.subscription,
        "freeGens": u.free_generations,
        "is_admin": u.is_admin,
        "telegram_linked": bool(u.telegram_user_id),
        "telegram_username": u.telegram_username,
        "telegram_first_name": u.telegram_first_name,
        "telegram_notifications_enabled": bool(u.telegram_notifications_enabled),
    }


@router.post("/profile", dependencies=[Depends(csrf_protect)])
async def update_profile(
    name: str = Form(None, max_length=60),
    avatar: UploadFile = File(None),
    u: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if name is not None:
        clean = name.strip()
        if clean:
            if len(clean) < 2:
                raise HTTPException(status_code=400, detail="Ім'я надто коротке")
            u.name = clean
    if avatar:
        allowed_types = {"image/jpeg", "image/png", "image/webp"}
        if avatar.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Невірний формат аватара")
        ext = (avatar.filename or "").split(".")[-1].lower()
        if ext not in {"jpg", "jpeg", "png", "webp"}:
            raise HTTPException(status_code=400, detail="Невірне розширення файлу")
        os.makedirs("storage/avatars", exist_ok=True)
        fname = f"avatar_{u.id}_{secrets.token_hex(4)}.{ext}"
        with open(f"storage/avatars/{fname}", "wb") as f:
            shutil.copyfileobj(avatar.file, f)
        u.avatar_url = f"/api/avatars/{fname}"
    db.commit()
    return {"avatar_url": u.avatar_url}
