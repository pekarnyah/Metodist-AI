import json
import secrets
from collections import Counter
from datetime import date, datetime, time, timedelta
from urllib.parse import urlparse
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, constr
from sqlalchemy import func, inspect
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import AnalyticsEvent, GenerationDiagnostic, NewsPost, Review, Ticket, User, UserLesson
from .auth import csrf_protect, get_current_admin, get_current_user

router = APIRouter(tags=['Admin Panel'])

ROLE_LABELS = {
    'Owner': 'Власник',
    'Administrator': 'Адміністратор',
    'Support': 'Підтримка',
    'User': 'Вчитель',
}

SUBSCRIPTION_LABELS = {
    'Free': 'Базовий',
    'Pro': 'Pro',
    'VIP': 'VIP',
}

EVENT_LABELS = {
    'landing_view': 'Перегляд лендингу',
    'auth_modal_open': 'Відкриття модалки входу',
    'auth_modal_switch': 'Перемикання входу/реєстрації',
    'auth_register_start': 'Початок реєстрації',
    'auth_success': 'Успішна авторизація',
    'generator_submit': 'Запуск генерації',
    'generator_success': 'Успішна генерація',
    'generator_preset_apply': 'Застосування пресета',
    'assistant_prompt_submit': 'Запит до Metodist AI',
    'assistant_insert_generator': 'Вставка відповіді в генератор',
    'ticket_create': 'Створення тікета',
    'ticket_message_send': 'Повідомлення в тікеті',
    'pwa_install_prompt_ready': 'Готовий install prompt',
    'pwa_install_accept': 'Прийнято встановлення PWA',
    'pwa_install_dismiss': 'Відхилено встановлення PWA',
    'pwa_install_banner_close': 'Закрито банер встановлення',
    'pwa_installed': 'PWA встановлено',
}

GENERATION_STRATEGY_LABELS = {
    'strict': 'За прикладом',
    'rich': 'Вільна генерація',
}

GENERATION_STATUS_LABELS = {
    'started': 'Запущено',
    'success': 'Успіх',
    'failed': 'Помилка',
}


class SubscriptionUpdate(BaseModel):
    subscription: Literal['Free', 'Pro', 'VIP']
    days: int = Field(30, ge=0, le=3650)


class RoleUpdate(BaseModel):
    role: Literal['User', 'Support', 'Administrator', 'Owner']


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    credits: Optional[int] = Field(None, ge=0, le=100000)


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    credits: Optional[int] = Field(None, ge=0, le=100000)
    role: Optional[Literal['User', 'Support', 'Administrator', 'Owner']] = None
    subscription: Optional[Literal['Free', 'Pro', 'VIP']] = None
    days: Optional[int] = Field(None, ge=0, le=3650)


class ReviewCreate(BaseModel):
    text: constr(strip_whitespace=True, min_length=1, max_length=2000)
    rating: int = Field(..., ge=1, le=5)


class AdminNewsUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    excerpt: Optional[str] = Field(default=None, max_length=1200)
    is_visible: Optional[bool] = None
    is_pinned: Optional[bool] = None


class AdminNewsCreate(BaseModel):
    title: constr(strip_whitespace=True, min_length=1, max_length=200)
    excerpt: constr(strip_whitespace=True, min_length=1, max_length=1200)
    telegram_url: Optional[str] = Field(default=None, max_length=500)
    is_visible: bool = True
    is_pinned: bool = False


def _serialize_admin_news(post: NewsPost) -> dict:
    return {
        'id': post.id,
        'channel_post_id': post.channel_post_id,
        'channel_username': post.channel_username,
        'title': post.title,
        'text': post.text,
        'excerpt': post.excerpt,
        'telegram_url': post.telegram_url,
        'image_url': post.image_url,
        'media_type': post.media_type,
        'media_file_id': post.media_file_id,
        'is_visible': bool(post.is_visible),
        'is_pinned': bool(post.is_pinned),
        'published_at': post.published_at.isoformat() if post.published_at else None,
        'edited_at': post.edited_at.isoformat() if post.edited_at else None,
        'created_at': post.created_at.isoformat() if post.created_at else None,
        'updated_at': post.updated_at.isoformat() if post.updated_at else None,
    }


def _apply_subscription(user: User, subscription: str, days: int) -> None:
    daily_limits = {
        'Free': 1,
        'Pro': 3,
        'VIP': 10,
    }
    user.subscription = subscription
    if subscription != 'Free':
        user.subscription_ends_at = datetime.utcnow() + timedelta(days=days)
        user.free_generations = daily_limits[subscription]
    else:
        user.subscription_ends_at = None
        user.free_generations = daily_limits['Free']
    user.tokens_reset_at = datetime.utcnow() + timedelta(hours=24)


def _validate_avatar_url(value: str) -> str:
    clean = (value or '').strip()
    if not clean:
        return ''
    if clean.startswith('/api/avatars/'):
        return clean
    parsed = urlparse(clean)
    if parsed.scheme in {'http', 'https'}:
        return clean
    raise HTTPException(status_code=400, detail='Невірний формат avatar_url')


def _build_series(rows: list[tuple[str, int]], start_day: date, days: int = 7) -> list[dict]:
    mapping = {str(key): int(value) for key, value in rows}
    return [
        {
            'date': (start_day + timedelta(days=offset)).isoformat(),
            'value': mapping.get((start_day + timedelta(days=offset)).isoformat(), 0),
        }
        for offset in range(days)
    ]


def _distribution(rows: list[tuple[str, int]], labels: dict[str, str]) -> list[dict]:
    return [
        {
            'key': key,
            'label': labels.get(key, key),
            'value': int(value),
        }
        for key, value in rows
    ]


def _safe_json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [str(item).strip() for item in data if str(item).strip()]


@router.get('/admin/users')
async def get_all_users(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'role': user.role,
            'avatar_url': user.avatar_url,
            'subscription': user.subscription,
            'credits': user.free_generations,
            'is_banned': user.is_banned,
            'sub_ends': user.subscription_ends_at.isoformat() if user.subscription_ends_at else None,
            'reset_at': user.tokens_reset_at.isoformat() if user.tokens_reset_at else None,
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }
        for user in users
    ]


@router.get('/admin/news')
async def get_admin_news(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    rows = (
        db.query(NewsPost)
        .order_by(NewsPost.is_pinned.desc(), NewsPost.published_at.desc(), NewsPost.id.desc())
        .limit(limit)
        .all()
    )
    return {'items': [_serialize_admin_news(post) for post in rows]}


@router.post('/admin/news', dependencies=[Depends(csrf_protect)])
async def create_admin_news(
    payload: AdminNewsCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    telegram_url = (payload.telegram_url or '').strip() or None
    if telegram_url:
        parsed = urlparse(telegram_url)
        if parsed.scheme not in {'http', 'https'}:
            raise HTTPException(status_code=400, detail='Невірне посилання Telegram')

    if payload.is_pinned:
        db.query(NewsPost).update({'is_pinned': False}, synchronize_session=False)

    post = NewsPost(
        channel_post_id=f'manual-{int(datetime.utcnow().timestamp())}-{secrets.token_hex(4)}',
        channel_username='manual',
        title=payload.title.strip(),
        text=payload.excerpt.strip(),
        excerpt=payload.excerpt.strip(),
        telegram_url=telegram_url,
        media_type=None,
        media_file_id=None,
        is_visible=payload.is_visible,
        is_pinned=payload.is_pinned,
        published_at=datetime.utcnow(),
        edited_at=None,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return {'status': 'ok', 'item': _serialize_admin_news(post)}


@router.post('/admin/news/{news_id}', dependencies=[Depends(csrf_protect)])
async def update_admin_news(
    news_id: int,
    payload: AdminNewsUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    post = db.query(NewsPost).filter(NewsPost.id == news_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Новину не знайдено')

    if payload.title is not None:
        post.title = payload.title.strip() or None
    if payload.excerpt is not None:
        post.excerpt = payload.excerpt.strip() or None
    if payload.is_visible is not None:
        post.is_visible = payload.is_visible
    if payload.is_pinned is not None:
        if payload.is_pinned:
            db.query(NewsPost).filter(NewsPost.id != news_id).update({'is_pinned': False}, synchronize_session=False)
        post.is_pinned = payload.is_pinned

    db.commit()
    db.refresh(post)
    return {'status': 'ok', 'item': _serialize_admin_news(post)}


@router.delete('/admin/news/{news_id}', dependencies=[Depends(csrf_protect)])
async def delete_admin_news(
    news_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    post = db.query(NewsPost).filter(NewsPost.id == news_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Новину не знайдено')
    db.delete(post)
    db.commit()
    return {'status': 'ok'}


@router.post('/admin/users/{user_id}', dependencies=[Depends(csrf_protect)])
async def update_user_admin(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if admin.role != 'Owner':
        raise HTTPException(status_code=403, detail='Тільки Owner може оновлювати користувачів')

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Користувача не знайдено')

    try:
        if data.name is not None:
            user.name = data.name.strip()
        if data.avatar_url is not None:
            user.avatar_url = _validate_avatar_url(data.avatar_url)
        if data.role is not None:
            user.role = data.role
            user.is_admin = data.role in ['Owner', 'Administrator', 'Support']
        if data.subscription is not None:
            days = data.days if data.days is not None else 30
            _apply_subscription(user, data.subscription, days)
        if data.credits is not None:
            user.free_generations = max(0, int(data.credits))
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {'status': 'ok'}


@router.post('/admin/users/{user_id}/subscription', dependencies=[Depends(csrf_protect)])
async def update_user_subscription(
    user_id: int,
    data: SubscriptionUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if admin.role != 'Owner':
        raise HTTPException(status_code=403, detail='Тільки Owner може видавати підписки')

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Користувача не знайдено')

    _apply_subscription(user, data.subscription, data.days)
    db.commit()
    return {'status': 'ok'}


@router.post('/admin/users/{user_id}/role', dependencies=[Depends(csrf_protect)])
async def update_user_role(
    user_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Користувача не знайдено')
    if admin.role != 'Owner':
        raise HTTPException(status_code=403, detail='Тільки Owner може змінювати ролі')
    user.role = data.role
    user.is_admin = data.role in ['Owner', 'Administrator', 'Support']
    db.commit()
    return {'status': 'ok'}


@router.post('/admin/users/{user_id}/profile', dependencies=[Depends(csrf_protect)])
async def update_user_profile(
    user_id: int,
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if admin.role != 'Owner':
        raise HTTPException(status_code=403, detail='Тільки Owner може змінювати профіль')

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Користувача не знайдено')

    if data.name is not None:
        user.name = data.name.strip()
    if data.avatar_url is not None:
        user.avatar_url = _validate_avatar_url(data.avatar_url)
    if data.credits is not None:
        user.free_generations = max(0, int(data.credits))

    db.commit()
    return {'status': 'ok'}


@router.post('/admin/users/{user_id}/ban', dependencies=[Depends(csrf_protect)])
async def toggle_user_ban(user_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Користувача не знайдено')
    if user.id == admin.id or user.role == 'Owner':
        raise HTTPException(status_code=403, detail='Цю дію заборонено')
    user.is_banned = not user.is_banned
    db.commit()
    return {'is_banned': user.is_banned}


@router.get('/admin/stats')
async def get_admin_stats(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    now = datetime.utcnow()
    today = now.date()
    start_day = today - timedelta(days=6)
    start_dt = datetime.combine(start_day, time.min)
    today_dt = datetime.combine(today, time.min)

    total_users = db.query(User).count()
    total_lessons = db.query(UserLesson).count()
    open_tickets = db.query(Ticket).filter(Ticket.status != 'closed').count()
    total_reviews = db.query(Review).count()
    total_credits = sum(user.free_generations or 0 for user in db.query(User).all())

    new_users_7d = db.query(User).filter(User.created_at >= start_dt).count()
    lessons_7d = db.query(UserLesson).filter(UserLesson.created_at >= start_dt).count()
    lessons_today = db.query(UserLesson).filter(UserLesson.created_at >= today_dt).count()
    average_rating = float(db.query(func.avg(Review.rating)).scalar() or 0)
    active_users_7d = int(
        db.query(func.count(func.distinct(AnalyticsEvent.user_id)))
        .filter(AnalyticsEvent.created_at >= start_dt, AnalyticsEvent.user_id.isnot(None))
        .scalar()
        or 0
    )

    subscription_rows = db.query(User.subscription, func.count(User.id)).group_by(User.subscription).all()
    role_rows = db.query(User.role, func.count(User.id)).group_by(User.role).all()
    top_event_rows = (
        db.query(AnalyticsEvent.event_name, func.count(AnalyticsEvent.id).label('total'))
        .filter(AnalyticsEvent.created_at >= start_dt)
        .group_by(AnalyticsEvent.event_name)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .limit(6)
        .all()
    )

    signup_rows = (
        db.query(func.date(User.created_at), func.count(User.id))
        .filter(User.created_at >= start_dt)
        .group_by(func.date(User.created_at))
        .all()
    )
    lesson_rows = (
        db.query(func.date(UserLesson.created_at), func.count(UserLesson.id))
        .filter(UserLesson.created_at >= start_dt)
        .group_by(func.date(UserLesson.created_at))
        .all()
    )

    funnel_keys = ['landing_view', 'auth_modal_open', 'auth_success', 'generator_success']
    funnel_rows = [
        (
            key,
            EVENT_LABELS.get(key, key),
            int(
                db.query(func.count(AnalyticsEvent.id))
                .filter(AnalyticsEvent.event_name == key, AnalyticsEvent.created_at >= start_dt)
                .scalar()
                or 0
            ),
        )
        for key in funnel_keys
    ]

    diagnostics_table_exists = inspect(db.bind).has_table(GenerationDiagnostic.__tablename__)
    generation_success_7d = 0
    generation_failed_7d = 0
    generation_fallback_7d = 0
    generation_repair_7d = 0
    avg_generation_score_7d = 0.0
    avg_generation_duration_ms_7d = 0.0
    generation_strategy_rows = []
    generation_status_rows = []
    weak_node_counter: Counter[str] = Counter()
    recent_generation_rows = []

    if diagnostics_table_exists:
        generation_success_7d = (
            db.query(func.count(GenerationDiagnostic.id))
            .filter(GenerationDiagnostic.created_at >= start_dt, GenerationDiagnostic.status == 'success')
            .scalar()
            or 0
        )
        generation_failed_7d = (
            db.query(func.count(GenerationDiagnostic.id))
            .filter(GenerationDiagnostic.created_at >= start_dt, GenerationDiagnostic.status == 'failed')
            .scalar()
            or 0
        )
        generation_fallback_7d = (
            db.query(func.count(GenerationDiagnostic.id))
            .filter(GenerationDiagnostic.created_at >= start_dt, GenerationDiagnostic.fell_back_to_rich.is_(True))
            .scalar()
            or 0
        )
        generation_repair_7d = (
            db.query(func.count(GenerationDiagnostic.id))
            .filter(GenerationDiagnostic.created_at >= start_dt, GenerationDiagnostic.used_repair_pass.is_(True))
            .scalar()
            or 0
        )
        avg_generation_score_7d = float(
            db.query(func.avg(GenerationDiagnostic.quality_score))
            .filter(GenerationDiagnostic.created_at >= start_dt, GenerationDiagnostic.quality_score.isnot(None))
            .scalar()
            or 0
        )
        avg_generation_duration_ms_7d = float(
            db.query(func.avg(GenerationDiagnostic.duration_ms))
            .filter(GenerationDiagnostic.created_at >= start_dt, GenerationDiagnostic.duration_ms.isnot(None))
            .scalar()
            or 0
        )

        generation_strategy_rows = (
            db.query(GenerationDiagnostic.final_strategy, func.count(GenerationDiagnostic.id))
            .filter(GenerationDiagnostic.created_at >= start_dt, GenerationDiagnostic.final_strategy.isnot(None))
            .group_by(GenerationDiagnostic.final_strategy)
            .all()
        )
        generation_status_rows = (
            db.query(GenerationDiagnostic.status, func.count(GenerationDiagnostic.id))
            .filter(GenerationDiagnostic.created_at >= start_dt)
            .group_by(GenerationDiagnostic.status)
            .all()
        )

        weak_node_rows = (
            db.query(GenerationDiagnostic.weak_nodes_json)
            .filter(GenerationDiagnostic.created_at >= start_dt, GenerationDiagnostic.weak_nodes_json.isnot(None))
            .all()
        )
        for (weak_nodes_json,) in weak_node_rows:
            if not weak_nodes_json:
                continue
            try:
                weak_nodes = json.loads(weak_nodes_json)
            except json.JSONDecodeError:
                continue
            for node in weak_nodes:
                title = str(node or '').strip()
                if title:
                    weak_node_counter[title] += 1

        recent_generation_rows = (
            db.query(GenerationDiagnostic)
            .order_by(GenerationDiagnostic.created_at.desc())
            .limit(20)
            .all()
        )

    return {
        'total_users': total_users,
        'total_lessons': total_lessons,
        'open_tickets': open_tickets,
        'total_reviews': total_reviews,
        'total_credits': total_credits,
        'new_users_7d': new_users_7d,
        'lessons_7d': lessons_7d,
        'lessons_today': lessons_today,
        'average_rating': round(average_rating, 2),
        'active_users_7d': active_users_7d,
        'subscription_breakdown': _distribution(subscription_rows, SUBSCRIPTION_LABELS),
        'role_breakdown': _distribution(role_rows, ROLE_LABELS),
        'top_events_7d': [
            {'key': key, 'label': EVENT_LABELS.get(key, key), 'value': int(value)}
            for key, value in top_event_rows
        ],
        'funnel_7d': [
            {'key': key, 'label': label, 'value': value}
            for key, label, value in funnel_rows
        ],
        'signup_series_7d': _build_series(signup_rows, start_day),
        'lesson_series_7d': _build_series(lesson_rows, start_day),
        'generation_success_7d': int(generation_success_7d),
        'generation_failed_7d': int(generation_failed_7d),
        'generation_fallback_7d': int(generation_fallback_7d),
        'generation_repair_7d': int(generation_repair_7d),
        'avg_generation_score_7d': round(avg_generation_score_7d, 2),
        'avg_generation_duration_ms_7d': int(round(avg_generation_duration_ms_7d)),
        'generation_strategy_breakdown_7d': _distribution(generation_strategy_rows, GENERATION_STRATEGY_LABELS),
        'generation_status_breakdown_7d': _distribution(generation_status_rows, GENERATION_STATUS_LABELS),
        'weak_nodes_7d': [
            {'key': key, 'label': key, 'value': value}
            for key, value in weak_node_counter.most_common(6)
        ],
        'recent_generation_runs': [
            {
                'request_id': item.request_id,
                'topic': item.topic or 'Без теми',
                'subject': item.subject or 'Без предмета',
                'grade': item.grade or 'Без класу',
                'status': item.status,
                'final_strategy': item.final_strategy,
                'quality_score': round(float(item.quality_score), 2) if item.quality_score is not None else None,
                'quality_total_items': item.quality_total_items,
                'fell_back_to_rich': bool(item.fell_back_to_rich),
                'used_repair_pass': bool(item.used_repair_pass),
                'duration_ms': item.duration_ms,
                'created_at': item.created_at.isoformat() if item.created_at else None,
                'source_files_count': item.source_files_count or 0,
                'source_names': _safe_json_list(item.source_names_json),
                'reference_doc': item.reference_doc,
                'has_reference_structure': bool(item.has_reference_structure),
                'template_docs_found': item.template_docs_found or 0,
                'parsed_docs_count': item.parsed_docs_count or 0,
                'source_hints_count': item.source_hints_count or 0,
                'has_slide_plan': bool(item.has_slide_plan),
                'blueprint_sections': item.blueprint_sections or 0,
                'blueprint_stages': item.blueprint_stages or 0,
                'output_name': item.output_name,
                'output_ext': item.output_ext,
                'error_message': item.error_message,
                'weak_nodes': _safe_json_list(item.weak_nodes_json)[:4],
            }
            for item in recent_generation_rows
        ],
    }


@router.get('/reviews')
async def get_reviews(db: Session = Depends(get_db)):
    reviews = db.query(Review).order_by(Review.created_at.desc()).limit(15).all()
    users = {user.email.lower(): user for user in db.query(User).all()}
    return [
        {
            'id': review.id,
            'user': (users.get(review.user_email.lower()).name if users.get(review.user_email.lower()) and users.get(review.user_email.lower()).name else review.user_email.split('@')[0]),
            'text': review.text,
            'rating': review.rating,
            'avatar_url': users.get(review.user_email.lower()).avatar_url if users.get(review.user_email.lower()) else None,
        }
        for review in reviews
    ]


@router.post('/reviews', dependencies=[Depends(csrf_protect)])
async def post_review(data: ReviewCreate, u: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.query(Review).filter(func.lower(Review.user_email) == u.email.lower()).first():
        raise HTTPException(status_code=400, detail='Ви вже залишали відгук')
    db.add(Review(user_email=u.email.lower(), text=data.text, rating=data.rating))
    db.commit()
    return {'status': 'ok'}


@router.delete('/reviews/{review_id}', dependencies=[Depends(csrf_protect)])
async def delete_review(review_id: int, u: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if u.role not in ['Owner', 'Administrator']:
        raise HTTPException(status_code=403, detail='Доступ заборонено')
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail='Відгук не знайдено')
    db.delete(review)
    db.commit()
    return {'status': 'ok'}

