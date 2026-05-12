import os
import json
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import GenerationDiagnostic, TelegramNotification, User
from core.generation_queue import generation_queue
from .auth import get_current_user

router = APIRouter(tags=["System Status"])
PROCESS_STARTED_AT = datetime.utcnow()
TELEGRAM_RUNTIME_STATUS_PATH = Path(__file__).resolve().parents[2] / "user-bot" / "storage" / "telegram_runtime_status.json"


def _load_telegram_runtime_status() -> dict:
    try:
        if not TELEGRAM_RUNTIME_STATUS_PATH.exists():
            return {}
        with TELEGRAM_RUNTIME_STATUS_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


@router.get("/system-status")
async def get_system_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in {"Owner", "Administrator", "Support"}:
        raise HTTPException(status_code=403, detail="Недостатньо прав для перегляду стану системи")

    now = datetime.utcnow()
    uptime_sec = max(0, int((now - PROCESS_STARTED_AT).total_seconds()))

    queue_snapshot = await generation_queue.snapshot()
    queue_status = {
        "reachable": True,
        "pending_jobs": int(queue_snapshot.get("waiting_count") or 0),
        "processing_jobs": 1 if queue_snapshot.get("active_request_id") else 0,
        "active_request_id": queue_snapshot.get("active_request_id"),
    }

    recent_limit = 50
    recent_runs = (
        db.query(GenerationDiagnostic)
        .order_by(GenerationDiagnostic.created_at.desc())
        .limit(recent_limit)
        .all()
    )
    success_count = sum(1 for row in recent_runs if (row.status or "").lower() == "success")
    failed_count = sum(1 for row in recent_runs if (row.status or "").lower() != "success")
    duration_values = [int(row.duration_ms) for row in recent_runs if row.duration_ms is not None and row.duration_ms >= 0]
    avg_generation_ms = int(sum(duration_values) / len(duration_values)) if duration_values else 0
    latest_errors = []
    for row in recent_runs:
        if (row.status or "").lower() == "success":
            continue
        message = (row.error_message or "").strip()
        if not message:
            continue
        latest_errors.append(
            {
                "request_id": row.request_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "message": message[:220],
            }
        )
        if len(latest_errors) >= 5:
            break

    linked_users_count = db.query(User).filter(User.telegram_user_id.isnot(None)).count()
    notifications_pending = db.query(TelegramNotification).filter(TelegramNotification.is_sent.is_(False)).count()
    sent_since = now - timedelta(hours=24)
    sent_24h = (
        db.query(TelegramNotification)
        .filter(
            TelegramNotification.is_sent.is_(True),
            TelegramNotification.sent_at.isnot(None),
            TelegramNotification.sent_at >= sent_since,
        )
        .count()
    )
    last_sent_at = (
        db.query(func.max(TelegramNotification.sent_at))
        .filter(TelegramNotification.sent_at.isnot(None))
        .scalar()
    )
    last_event_at = db.query(func.max(TelegramNotification.created_at)).scalar()

    telegram_bot_username = os.getenv("TELEGRAM_USER_BOT_USERNAME", "").strip()
    internal_token = os.getenv("INTERNAL_API_TOKEN", "").strip()
    runtime = _load_telegram_runtime_status()
    poll_success_total = int(runtime.get("notification_poll_success_total") or 0)
    poll_failed_total = int(runtime.get("notification_poll_failed_total") or 0)
    last_error = str(runtime.get("last_error") or "")
    token_error_detected = "internal api token is not configured" in last_error.lower()
    forbidden_error_detected = "forbidden" in last_error.lower()
    internal_api_auth_ok = bool(internal_token) and poll_success_total > 0 and not (
        token_error_detected or forbidden_error_detected
    )
    internal_api_auth_issue = None
    if not internal_token:
        internal_api_auth_issue = "internal_token_missing"
    elif token_error_detected:
        internal_api_auth_issue = "token_not_configured_on_backend"
    elif forbidden_error_detected:
        internal_api_auth_issue = "token_mismatch_or_forbidden"
    elif poll_success_total == 0 and poll_failed_total > 0:
        internal_api_auth_issue = "no_successful_internal_polls"

    telegram_status = {
        "configured": bool(telegram_bot_username and internal_token),
        "bot_username_configured": bool(telegram_bot_username),
        "internal_token_configured": bool(internal_token),
        "internal_api_auth_ok": internal_api_auth_ok,
        "internal_api_auth_issue": internal_api_auth_issue,
        "basic_mode": str(runtime.get("mode") or "unknown"),
        "last_api_base_used": runtime.get("last_api_base_used"),
        "internal_health_last_ok_at": runtime.get("internal_health_last_ok_at"),
        "internal_health_last_error_at": runtime.get("internal_health_last_error_at"),
        "internal_health_last_error": runtime.get("internal_health_last_error"),
        "last_update_type": runtime.get("last_update_type"),
        "last_success_event_at": runtime.get("last_success_event_at"),
        "last_error_at": runtime.get("last_error_at"),
        "last_error": runtime.get("last_error"),
        "news_sync_total": int(runtime.get("news_sync_total") or 0),
        "news_sync_failed_total": int(runtime.get("news_sync_failed_total") or 0),
        "notification_poll_success_total": poll_success_total,
        "notification_poll_failed_total": poll_failed_total,
        "notification_delivery_failed_total": int(runtime.get("notification_delivery_failed_total") or 0),
        "linked_users_count": int(linked_users_count),
        "pending_notifications": int(notifications_pending),
        "sent_notifications_24h": int(sent_24h),
        "last_sent_at": last_sent_at.isoformat() if last_sent_at else None,
        "last_event_at": last_event_at.isoformat() if last_event_at else None,
    }

    return {
        "status": "ok",
        "timestamp": now.isoformat(),
        "backend": {
            "reachable": True,
            "uptime_sec": uptime_sec,
            "version": os.getenv("APP_VERSION", "").strip() or "unknown",
            "build": os.getenv("APP_BUILD", "").strip() or os.getenv("GIT_SHA", "").strip() or "unknown",
        },
        "generator": {
            "recent_window": recent_limit,
            "success_count": int(success_count),
            "failed_count": int(failed_count),
            "avg_generation_ms": int(avg_generation_ms),
            "latest_errors": latest_errors,
        },
        "queue": queue_status,
        "telegram": telegram_status,
    }
