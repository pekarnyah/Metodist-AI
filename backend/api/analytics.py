import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field, constr
from sqlalchemy import func
from sqlalchemy.orm import Session
from jose import JWTError

from db.database import get_db
from db.models import AnalyticsEvent, Review, User, UserLesson
from .auth import ACCESS_COOKIE, _decode_token, _get_bearer_token

router = APIRouter(tags=["Analytics"])


class AnalyticsEventIn(BaseModel):
    event: constr(strip_whitespace=True, min_length=2, max_length=80, pattern=r"^[a-z0-9_:-]+$")
    page: Optional[constr(strip_whitespace=True, max_length=200)] = None
    source: Optional[constr(strip_whitespace=True, max_length=80)] = None
    meta: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


def _resolve_optional_user(request: Request, db: Session) -> Optional[User]:
    token = _get_bearer_token(request) or request.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    try:
        payload = _decode_token(token, "access")
    except (JWTError, Exception):
        return None

    subject = payload.get("sub")
    if not subject:
        return None
    user = db.query(User).filter(User.email == subject).first()
    if not user or not user.is_active or user.is_banned:
        return None
    return user


@router.post("/analytics/event", status_code=status.HTTP_204_NO_CONTENT)
async def create_analytics_event(payload: AnalyticsEventIn, request: Request, db: Session = Depends(get_db)):
    user = _resolve_optional_user(request, db)
    db.add(
        AnalyticsEvent(
            user_id=user.id if user else None,
            event_name=payload.event,
            page=payload.page,
            source=payload.source,
            meta_json=json.dumps(payload.meta, ensure_ascii=False) if payload.meta else None,
        )
    )
    db.commit()
    return None


@router.get("/public/stats")
async def get_public_stats(db: Session = Depends(get_db)):
    last_7_days = datetime.utcnow() - timedelta(days=7)
    average_rating = float(db.query(func.avg(Review.rating)).scalar() or 0)
    active_users_7d = int(
        db.query(func.count(func.distinct(AnalyticsEvent.user_id)))
        .filter(AnalyticsEvent.created_at >= last_7_days, AnalyticsEvent.user_id.isnot(None))
        .scalar()
        or 0
    )
    return {
        "total_users": db.query(User).filter(User.is_active.is_(True)).count(),
        "total_lessons": db.query(UserLesson).count(),
        "total_reviews": db.query(Review).count(),
        "average_rating": round(average_rating, 2),
        "active_users_7d": active_users_7d,
    }
