import os
import secrets
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import TelegramLinkCode, TelegramNotification, Ticket, User, UserLesson
from .auth import DAILY_GENERATION_LIMITS, csrf_protect, get_current_user
from .internal import require_internal_token

router = APIRouter(tags=["Telegram"])
logger = logging.getLogger(__name__)

TELEGRAM_USER_BOT_USERNAME = os.getenv("TELEGRAM_USER_BOT_USERNAME", "").strip().lstrip("@")
TELEGRAM_LINK_TTL_MINUTES = int(os.getenv("TELEGRAM_LINK_TTL_MINUTES", "20"))
SITE_BASE_URL = os.getenv("SITE_BASE_URL", "https://metodist.co.ua").rstrip("/")
MONTHLY_GENERATION_LIMITS = {
    "Free": 15,
    "Pro": 50,
    "VIP": 150,
}


class TelegramNotificationsPayload(BaseModel):
    enabled: bool


class TelegramCompleteLinkPayload(BaseModel):
    code: str = Field(min_length=8, max_length=128)
    telegram_user_id: str = Field(min_length=1, max_length=64)
    telegram_username: str | None = None
    telegram_first_name: str | None = None


class TelegramNotificationAckPayload(BaseModel):
    sent: bool = True


def _build_deep_link(code: str) -> str | None:
    if not TELEGRAM_USER_BOT_USERNAME:
        return None
    return f"https://t.me/{TELEGRAM_USER_BOT_USERNAME}?start=link_{code}"


def _serialize_pending_link(link: TelegramLinkCode | None) -> dict | None:
    if not link:
        return None
    return {
        "code": link.code,
        "expires_at": link.expires_at.isoformat(),
        "deep_link": _build_deep_link(link.code),
    }


def _get_pending_link(user_id: int, db: Session) -> TelegramLinkCode | None:
    now = datetime.utcnow()
    return (
        db.query(TelegramLinkCode)
        .filter(
            TelegramLinkCode.user_id == user_id,
            TelegramLinkCode.consumed_at.is_(None),
            TelegramLinkCode.expires_at > now,
        )
        .order_by(TelegramLinkCode.created_at.desc())
        .first()
    )


def _build_monthly_limits(user: User, db: Session) -> dict:
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_limit = MONTHLY_GENERATION_LIMITS.get(user.subscription, MONTHLY_GENERATION_LIMITS["Free"])
    monthly_used = (
        db.query(UserLesson)
        .filter(UserLesson.user_email == user.email, UserLesson.created_at >= month_start)
        .count()
    )
    daily_limit = DAILY_GENERATION_LIMITS.get(user.subscription, DAILY_GENERATION_LIMITS["Free"])
    return {
        "daily_remaining": int(user.free_generations or 0),
        "daily_limit": daily_limit,
        "monthly_used": monthly_used,
        "monthly_limit": monthly_limit,
        "monthly_remaining": max(0, monthly_limit - monthly_used),
    }


def _serialize_recent_lessons(user: User, db: Session, limit: int = 5) -> list[dict]:
    safe_limit = min(max(limit, 1), 20)
    lessons = (
        db.query(UserLesson)
        .filter(UserLesson.user_email == user.email)
        .order_by(UserLesson.created_at.desc())
        .limit(safe_limit)
        .all()
    )
    rows: list[dict] = []
    for lesson in lessons:
        file_path = Path(lesson.file_path or "")
        rows.append(
            {
                "id": lesson.id,
                "topic": lesson.topic,
                "grade": lesson.grade,
                "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
                "filename": file_path.name or f"lesson_{lesson.id}.docx",
                "file_path": str(file_path) if file_path else None,
                "history_url": f"{SITE_BASE_URL}/?tab=history",
            }
        )
    return rows


def _serialize_recent_tickets(user: User, db: Session, limit: int = 3) -> list[dict]:
    safe_limit = min(max(limit, 1), 10)
    rows = (
        db.query(Ticket)
        .filter(Ticket.user_id == user.id)
        .order_by(Ticket.created_at.desc(), Ticket.id.desc())
        .limit(safe_limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "subject": row.subject,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


def _serialize_notification(row: TelegramNotification, user: User) -> dict:
    meta = {}
    if row.meta_json:
        try:
            meta = json.loads(row.meta_json)
        except json.JSONDecodeError:
            meta = {}
    return {
        "id": row.id,
        "telegram_user_id": user.telegram_user_id,
        "type": row.type,
        "title": row.title,
        "body": row.body,
        "action_url": row.action_url,
        "lesson_id": row.lesson_id,
        "ticket_id": row.ticket_id,
        "meta": meta,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _serialize_user_bot_account(user: User, db: Session) -> dict:
    limits = _build_monthly_limits(user, db)
    open_tickets = db.query(Ticket).filter(Ticket.user_id == user.id, Ticket.status != "closed").count()
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "subscription": user.subscription,
            "role": user.role,
            "telegram_username": user.telegram_username,
            "telegram_first_name": user.telegram_first_name,
            "telegram_notifications_enabled": bool(user.telegram_notifications_enabled),
        },
        "limits": limits,
        "support": {
            "open_tickets": open_tickets,
            "support_url": f"{SITE_BASE_URL}/?tab=support",
        },
        "links": {
            "site": SITE_BASE_URL,
            "history": f"{SITE_BASE_URL}/?tab=history",
            "pricing": f"{SITE_BASE_URL}/?tab=pricing",
            "settings": f"{SITE_BASE_URL}/?tab=settings",
        },
        "recent_lessons": _serialize_recent_lessons(user, db, limit=5),
        "recent_tickets": _serialize_recent_tickets(user, db, limit=3),
    }


def _serialize_status(user: User, db: Session) -> dict:
    pending = _get_pending_link(user.id, db)
    return {
        "linked": bool(user.telegram_user_id),
        "telegram_user_id": user.telegram_user_id,
        "telegram_username": user.telegram_username,
        "telegram_first_name": user.telegram_first_name,
        "telegram_linked_at": user.telegram_linked_at.isoformat() if user.telegram_linked_at else None,
        "telegram_notifications_enabled": bool(user.telegram_notifications_enabled),
        "bot_username": TELEGRAM_USER_BOT_USERNAME or None,
        "bot_url": f"https://t.me/{TELEGRAM_USER_BOT_USERNAME}" if TELEGRAM_USER_BOT_USERNAME else None,
        "pending_link": _serialize_pending_link(pending),
    }


@router.get("/telegram/link-status")
async def get_telegram_link_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logger.info(
        "telegram_link_status_loaded user_id=%s linked=%s telegram_user_id=%s",
        user.id,
        bool(user.telegram_user_id),
        user.telegram_user_id,
    )
    return _serialize_status(user, db)


@router.post("/telegram/link/start", dependencies=[Depends(csrf_protect)])
async def start_telegram_link(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()

    db.query(TelegramLinkCode).filter(
        TelegramLinkCode.user_id == user.id,
        TelegramLinkCode.consumed_at.is_(None),
    ).update({"consumed_at": now}, synchronize_session=False)

    code = secrets.token_urlsafe(18).replace("-", "").replace("_", "")[:32]
    link = TelegramLinkCode(
        user_id=user.id,
        code=code,
        expires_at=now + timedelta(minutes=TELEGRAM_LINK_TTL_MINUTES),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    logger.info(
        "telegram_link_started user_id=%s code_id=%s expires_at=%s currently_linked=%s",
        user.id,
        link.id,
        link.expires_at.isoformat(),
        bool(user.telegram_user_id),
    )

    return {
        "status": "ok",
        "link": _serialize_pending_link(link),
        "bot_username": TELEGRAM_USER_BOT_USERNAME or None,
        "bot_url": f"https://t.me/{TELEGRAM_USER_BOT_USERNAME}" if TELEGRAM_USER_BOT_USERNAME else None,
        "instructions": (
            "Відкрийте Telegram-бота, натисніть старт або надішліть код прив'язки."
            if TELEGRAM_USER_BOT_USERNAME
            else "Заповніть TELEGRAM_USER_BOT_USERNAME у backend/.env, щоб deep link працював автоматично."
        ),
    }


@router.post("/telegram/link/unlink", dependencies=[Depends(csrf_protect)])
async def unlink_telegram(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logger.info(
        "telegram_link_unlink_requested user_id=%s linked_before=%s telegram_user_id=%s",
        user.id,
        bool(user.telegram_user_id),
        user.telegram_user_id,
    )
    user.telegram_user_id = None
    user.telegram_username = None
    user.telegram_first_name = None
    user.telegram_linked_at = None
    user.telegram_notifications_enabled = False
    db.query(TelegramLinkCode).filter(
        TelegramLinkCode.user_id == user.id,
        TelegramLinkCode.consumed_at.is_(None),
    ).update({"consumed_at": datetime.utcnow()}, synchronize_session=False)
    db.commit()
    logger.info("telegram_link_unlinked user_id=%s", user.id)
    return {"status": "ok"}


@router.post("/telegram/link/notifications", dependencies=[Depends(csrf_protect)])
async def update_telegram_notifications(
    payload: TelegramNotificationsPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user.telegram_user_id:
        raise HTTPException(status_code=400, detail="Спочатку прив'яжіть Telegram.")

    user.telegram_notifications_enabled = payload.enabled
    db.commit()
    logger.info(
        "telegram_notifications_updated user_id=%s enabled=%s linked=%s",
        user.id,
        payload.enabled,
        bool(user.telegram_user_id),
    )
    return {"status": "ok", "enabled": payload.enabled}


@router.post("/internal/telegram/link/complete", dependencies=[Depends(require_internal_token)])
async def complete_telegram_link(
    payload: TelegramCompleteLinkPayload,
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    normalized_tg_id = str(payload.telegram_user_id or "").strip()
    if not normalized_tg_id:
        logger.warning("telegram_link_complete_rejected reason=empty_telegram_user_id code=%s", payload.code)
        raise HTTPException(status_code=400, detail="Некоректний Telegram ID.")

    link = (
        db.query(TelegramLinkCode)
        .filter(
            TelegramLinkCode.code == payload.code,
            TelegramLinkCode.consumed_at.is_(None),
        )
        .first()
    )
    if not link or link.expires_at <= now:
        logger.info("telegram_link_complete_failed reason=invalid_or_expired_code code=%s", payload.code)
        raise HTTPException(status_code=404, detail="Код прив'язки недійсний або вже протермінований.")

    existing_user = (
        db.query(User)
        .filter(User.telegram_user_id == normalized_tg_id, User.id != link.user_id)
        .first()
    )
    if existing_user:
        logger.info(
            "telegram_link_complete_conflict telegram_user_id=%s target_user_id=%s existing_user_id=%s",
            normalized_tg_id,
            link.user_id,
            existing_user.id,
        )
        raise HTTPException(status_code=409, detail="Цей Telegram-акаунт уже прив'язаний до іншого профілю.")

    user = db.query(User).filter(User.id == link.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Користувача не знайдено.")

    user.telegram_user_id = normalized_tg_id
    user.telegram_username = (payload.telegram_username or "").lstrip("@") or None
    user.telegram_first_name = payload.telegram_first_name or None
    user.telegram_linked_at = now
    user.telegram_notifications_enabled = True
    link.consumed_at = now

    db.query(TelegramLinkCode).filter(
        TelegramLinkCode.user_id == user.id,
        TelegramLinkCode.id != link.id,
        TelegramLinkCode.consumed_at.is_(None),
    ).update({"consumed_at": now}, synchronize_session=False)

    db.commit()
    logger.info(
        "telegram_link_completed user_id=%s telegram_user_id=%s telegram_username=%s",
        user.id,
        user.telegram_user_id,
        user.telegram_username,
    )

    return {
        "status": "ok",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "telegram_username": user.telegram_username,
            "telegram_first_name": user.telegram_first_name,
        },
    }


@router.get("/internal/telegram/account/{telegram_user_id}", dependencies=[Depends(require_internal_token)])
async def get_internal_telegram_account(telegram_user_id: str, db: Session = Depends(get_db)):
    logger.info("telegram_internal_account_lookup telegram_user_id=%s", telegram_user_id)
    user = db.query(User).filter(User.telegram_user_id == telegram_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Telegram-профіль не прив'язано.")
    return _serialize_user_bot_account(user, db)


@router.get("/internal/telegram/documents/{telegram_user_id}", dependencies=[Depends(require_internal_token)])
async def get_internal_telegram_documents(
    telegram_user_id: str,
    limit: int = 10,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.telegram_user_id == telegram_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Telegram-профіль не прив'язано.")
    return {
        "items": _serialize_recent_lessons(user, db, limit=limit),
    }


@router.get("/internal/telegram/document/{lesson_id}", dependencies=[Depends(require_internal_token)])
async def get_internal_telegram_document(
    lesson_id: int,
    telegram_user_id: str,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.telegram_user_id == telegram_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Telegram-профіль не прив'язано.")

    lesson = (
        db.query(UserLesson)
        .filter(UserLesson.id == lesson_id, UserLesson.user_email == user.email)
        .first()
    )
    if not lesson:
        raise HTTPException(status_code=404, detail="Документ не знайдено.")

    file_path = Path(lesson.file_path or "")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл документа відсутній на сервері.")

    return {
        "id": lesson.id,
        "topic": lesson.topic,
        "grade": lesson.grade,
        "filename": file_path.name or f"lesson_{lesson.id}.docx",
        "file_path": str(file_path),
        "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
    }


@router.get("/internal/telegram/notifications/pending", dependencies=[Depends(require_internal_token)])
async def get_pending_telegram_notifications(
    limit: int = 20,
    db: Session = Depends(get_db),
):
    safe_limit = min(max(limit, 1), 100)
    rows = (
        db.query(TelegramNotification, User)
        .join(User, User.id == TelegramNotification.user_id)
        .filter(
            TelegramNotification.is_sent.is_(False),
            User.telegram_user_id.isnot(None),
            User.telegram_notifications_enabled.is_(True),
        )
        .order_by(TelegramNotification.created_at.asc(), TelegramNotification.id.asc())
        .limit(safe_limit)
        .all()
    )
    return {
        "items": [_serialize_notification(notification, user) for notification, user in rows]
    }


@router.post("/internal/telegram/notifications/{notification_id}/sent", dependencies=[Depends(require_internal_token)])
async def mark_telegram_notification_sent(
    notification_id: int,
    payload: TelegramNotificationAckPayload,
    db: Session = Depends(get_db),
):
    row = db.query(TelegramNotification).filter(TelegramNotification.id == notification_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Сповіщення не знайдено.")

    row.is_sent = bool(payload.sent)
    row.sent_at = datetime.utcnow() if payload.sent else None
    db.commit()
    return {"status": "ok"}
