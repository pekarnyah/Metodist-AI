import json
from typing import Any

from sqlalchemy.orm import Session

from db.models import TelegramNotification, User


def enqueue_telegram_notification(
    db: Session,
    *,
    user: User,
    notification_type: str,
    title: str,
    body: str,
    action_url: str | None = None,
    lesson_id: int | None = None,
    ticket_id: int | None = None,
    meta: dict[str, Any] | None = None,
) -> TelegramNotification | None:
    if not user.telegram_user_id or not bool(user.telegram_notifications_enabled):
        return None

    row = TelegramNotification(
        user_id=user.id,
        type=notification_type,
        title=title.strip()[:200] or "Сповіщення Metodist AI",
        body=body.strip()[:4000] or "У вас нове сповіщення.",
        action_url=(action_url or "").strip() or None,
        lesson_id=lesson_id,
        ticket_id=ticket_id,
        meta_json=json.dumps(meta or {}, ensure_ascii=False),
        is_sent=False,
    )
    db.add(row)
    return row
