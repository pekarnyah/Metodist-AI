import os
import secrets
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Review, Ticket, User, UserLesson

router = APIRouter(tags=['Internal'])

INTERNAL_API_TOKEN = os.getenv('INTERNAL_API_TOKEN', '').strip()


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    if not INTERNAL_API_TOKEN:
        raise HTTPException(status_code=503, detail='Internal API token is not configured')
    if not x_internal_token or not secrets.compare_digest(x_internal_token, INTERNAL_API_TOKEN):
        raise HTTPException(status_code=403, detail='Forbidden')


@router.get('/internal/health', dependencies=[Depends(require_internal_token)])
async def get_internal_health(db: Session = Depends(get_db)):
    db.execute(text('SELECT 1'))
    return {
        'status': 'ok',
        'time': datetime.utcnow().isoformat(),
        'users_total': db.query(User).count(),
        'lessons_total': db.query(UserLesson).count(),
        'open_tickets': db.query(Ticket).filter(Ticket.status != 'closed').count(),
    }


@router.get('/internal/users/stats', dependencies=[Depends(require_internal_token)])
async def get_internal_user_stats(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    today = date.today()
    start_today = datetime.combine(today, time.min)
    start_week = now - timedelta(days=7)
    start_month = now - timedelta(days=30)

    return {
        'total': db.query(User).count(),
        'today': db.query(User).filter(User.created_at >= start_today).count(),
        'week': db.query(User).filter(User.created_at >= start_week).count(),
        'month': db.query(User).filter(User.created_at >= start_month).count(),
        'active': db.query(User).filter(User.is_active.is_(True)).count(),
    }


@router.get('/internal/users/recent', dependencies=[Depends(require_internal_token)])
async def get_recent_users(limit: int = 5, db: Session = Depends(get_db)):
    safe_limit = min(max(limit, 1), 20)
    users = db.query(User).order_by(User.created_at.desc()).limit(safe_limit).all()
    return [
        {
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'role': user.role,
            'subscription': user.subscription,
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }
        for user in users
    ]


@router.get('/internal/summary', dependencies=[Depends(require_internal_token)])
async def get_internal_summary(db: Session = Depends(get_db)):
    average_rating = float(db.query(func.avg(Review.rating)).scalar() or 0)
    return {
        'status': 'ok',
        'users_total': db.query(User).count(),
        'users_active': db.query(User).filter(User.is_active.is_(True)).count(),
        'lessons_total': db.query(UserLesson).count(),
        'open_tickets': db.query(Ticket).filter(Ticket.status != 'closed').count(),
        'reviews_average_rating': round(average_rating, 2),
    }
