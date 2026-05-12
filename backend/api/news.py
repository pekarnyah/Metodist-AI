from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import NewsPost
from .internal import require_internal_token

router = APIRouter(tags=["News"])
logger = logging.getLogger(__name__)


class NewsUpsertPayload(BaseModel):
    channel_post_id: str = Field(min_length=1, max_length=64)
    channel_username: str = Field(min_length=1, max_length=128)
    title: str | None = Field(default=None, max_length=200)
    text: str | None = Field(default=None, max_length=12000)
    excerpt: str | None = Field(default=None, max_length=1200)
    telegram_url: str | None = Field(default=None, max_length=500)
    image_url: str | None = Field(default=None, max_length=500)
    media_type: str | None = Field(default=None, max_length=50)
    media_file_id: str | None = Field(default=None, max_length=512)
    is_visible: bool = True
    is_pinned: bool = False
    published_at: datetime
    edited_at: datetime | None = None


def _build_excerpt(post: NewsPost) -> str:
    if post.excerpt and post.excerpt.strip():
        return post.excerpt.strip()
    text = (post.text or "").strip()
    if len(text) <= 240:
        return text
    return f"{text[:237].rstrip()}..."


def _serialize_news_post(post: NewsPost) -> dict:
    return {
        "id": post.id,
        "channel_post_id": post.channel_post_id,
        "channel_username": post.channel_username,
        "title": post.title,
        "text": post.text,
        "excerpt": _build_excerpt(post),
        "telegram_url": post.telegram_url,
        "image_url": post.image_url,
        "media_type": post.media_type,
        "is_pinned": bool(post.is_pinned),
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "edited_at": post.edited_at.isoformat() if post.edited_at else None,
    }


@router.get("/public/news")
async def get_public_news(
    limit: int = Query(default=6, ge=1, le=20),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(NewsPost)
        .filter(NewsPost.is_visible.is_(True))
        .order_by(NewsPost.is_pinned.desc(), NewsPost.published_at.desc(), NewsPost.id.desc())
        .limit(limit)
        .all()
    )
    return {"items": [_serialize_news_post(post) for post in rows]}


@router.get("/news")
async def get_news(
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(NewsPost)
        .filter(NewsPost.is_visible.is_(True))
        .order_by(NewsPost.is_pinned.desc(), NewsPost.published_at.desc(), NewsPost.id.desc())
        .limit(limit)
        .all()
    )
    return {"items": [_serialize_news_post(post) for post in rows]}


@router.post("/internal/news/upsert", dependencies=[Depends(require_internal_token)])
async def upsert_news_post(payload: NewsUpsertPayload, db: Session = Depends(get_db)):
    channel_username = payload.channel_username.strip().lstrip("@")
    logger.info(
        "news_upsert_received channel=%s post_id=%s has_text=%s has_excerpt=%s",
        channel_username,
        payload.channel_post_id,
        bool((payload.text or "").strip()),
        bool((payload.excerpt or "").strip()),
    )

    post = (
        db.query(NewsPost)
        .filter(
            NewsPost.channel_username == channel_username,
            NewsPost.channel_post_id == payload.channel_post_id,
        )
        .first()
    )

    if not post:
        post = NewsPost(
            channel_post_id=payload.channel_post_id,
            channel_username=channel_username,
            published_at=payload.published_at,
        )
        db.add(post)

    post.title = payload.title
    post.text = payload.text
    post.excerpt = payload.excerpt
    post.telegram_url = payload.telegram_url
    post.image_url = payload.image_url
    post.media_type = payload.media_type
    post.media_file_id = payload.media_file_id
    post.is_visible = payload.is_visible
    post.is_pinned = payload.is_pinned
    post.published_at = payload.published_at
    post.edited_at = payload.edited_at

    db.commit()
    db.refresh(post)
    logger.info(
        "news_upsert_saved id=%s channel=%s post_id=%s edited=%s",
        post.id,
        post.channel_username,
        post.channel_post_id,
        bool(post.edited_at),
    )

    return {
        "status": "ok",
        "item": _serialize_news_post(post),
    }


@router.post("/internal/news/{news_id}/hide", dependencies=[Depends(require_internal_token)])
async def hide_news_post(news_id: int, db: Session = Depends(get_db)):
    post = db.query(NewsPost).filter(NewsPost.id == news_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Новину не знайдено.")
    post.is_visible = False
    db.commit()
    return {"status": "ok"}
