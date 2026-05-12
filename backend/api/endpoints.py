from fastapi import APIRouter
from . import admin, analytics, assistant, auth, feedback, internal, lessons, news, system_status, telegram, tickets

router = APIRouter()

router.include_router(auth.router)
router.include_router(tickets.router)
router.include_router(admin.router)
router.include_router(analytics.router)
router.include_router(internal.router)
router.include_router(lessons.router)
router.include_router(assistant.router)
router.include_router(telegram.router)
router.include_router(news.router)
router.include_router(system_status.router)
router.include_router(feedback.router)
