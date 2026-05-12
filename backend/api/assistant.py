import asyncio
import os
import re
from pathlib import Path
from typing import Literal

from docx import Document
from fastapi import APIRouter, Depends, HTTPException, Query
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, constr
from sqlalchemy.orm import Session

from db.database import get_db
from db import models as db_models
from .auth import csrf_protect, get_current_user

router = APIRouter(tags=['AI Assistant'])

ASSISTANT_MODEL = os.getenv('ASSISTANT_MODEL', 'gemini-2.5-flash')


def _resolve_assistant_api_key() -> str:
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY"):
        value = os.getenv(name)
        if value and str(value).strip():
            return str(value).strip()
    return ""


ASSISTANT_API_KEY = _resolve_assistant_api_key()
assistant_client = genai.Client(api_key=ASSISTANT_API_KEY) if ASSISTANT_API_KEY else None

AssistantChatMessage = getattr(db_models, "AssistantChatMessage", None)
User = db_models.User
UserLesson = db_models.UserLesson

ASSISTANT_VERSION = '1.0'
MAX_HISTORY_MESSAGES = 12
MAX_STORED_MESSAGES_PER_MODE = 40
MODE_VALUES = {'general', 'goals', 'assessment', 'differentiation', 'nush'}
MODE_PROMPTS = {
    'general': 'Допомагай з загальною методикою, структурою уроку, вправами та ідеями занять.',
    'goals': 'Фокусуйся на формулюванні мети, завдань, очікуваних результатів і компетентностей.',
    'assessment': 'Фокусуйся на формувальному оцінюванні, критеріях успіху, рефлексії та перевірці результатів.',
    'differentiation': 'Фокусуйся на адаптації матеріалу, диференціації, підтримці дітей з різним рівнем підготовки.',
    'nush': 'Фокусуйся на перевірці відповідності підходам НУШ, компетентнісності, діяльнісності та ціннісним орієнтирам.',
}


class AssistantChatRequest(BaseModel):
    mode: Literal['general', 'goals', 'assessment', 'differentiation', 'nush'] = 'general'
    message: constr(strip_whitespace=True, min_length=1, max_length=2000)


class AssistantMessageResponse(BaseModel):
    role: Literal['user', 'assistant']
    content: str
    created_at: str


def _require_vip(user: User) -> None:
    if user.subscription != 'VIP':
        raise HTTPException(status_code=403, detail='Доступ до Metodist AI v1.0 відкритий лише для тарифу VIP')


def _require_assistant_storage() -> None:
    if AssistantChatMessage is None:
        raise HTTPException(
            status_code=503,
            detail='Metodist AI тимчасово недоступний: модель історії чату ще не розгорнута на сервері',
        )


def _clean_text(value: str) -> str:
    text = re.sub(r'\s+', ' ', str(value or '')).strip()
    return text


def _normalize_assistant_text(value: str) -> str:
    raw_text = str(value or '').replace('\r\n', '\n').replace('\r', '\n')
    raw_text = raw_text.replace('```', '').replace('**', '').replace('__', '').replace('`', '')

    lines: list[str] = []
    previous_blank = True
    for raw_line in raw_text.split('\n'):
        line = raw_line.strip()
        line = re.sub(r'^#{1,6}\s*', '', line)
        if line:
            if re.match(r'^\d+[\.\)]\s+', line):
                line = re.sub(r'^\d+[\.\)]\s+', '— ', line)
            elif re.match(r'^[\*\-•]+\s+', line):
                line = re.sub(r'^[\*\-•]+\s+', '— ', line)
            line = re.sub(r'\s+', ' ', line).strip()

        if not line:
            if not previous_blank and lines:
                lines.append('')
            previous_blank = True
            continue

        lines.append(line)
        previous_blank = False

    normalized = '\n'.join(lines).strip()
    return normalized


def _serialize_history(messages: list[AssistantChatMessage]) -> list[AssistantMessageResponse]:
    return [
        AssistantMessageResponse(
            role=message.role,
            content=message.content,
            created_at=message.created_at.isoformat(),
        )
        for message in messages
    ]


def _load_recent_lessons_context(user: User, db: Session) -> str:
    lessons = (
        db.query(UserLesson)
        .filter(UserLesson.user_email == user.email)
        .order_by(UserLesson.created_at.desc())
        .limit(3)
        .all()
    )
    if not lessons:
        return 'У користувача поки немає збережених згенерованих уроків.'

    chunks: list[str] = []
    for lesson in lessons:
        header = f"Тема: {lesson.topic}; Клас: {lesson.grade}; Дата: {lesson.created_at.strftime('%Y-%m-%d %H:%M')}"
        body = ''
        path = Path(lesson.file_path or '')
        if path.exists() and path.suffix.lower() == '.docx':
            try:
                doc = Document(str(path))
                paragraphs = [_clean_text(par.text) for par in doc.paragraphs if _clean_text(par.text)]
                excerpt = ' '.join(paragraphs[:8])[:1400]
                if excerpt:
                    body = f' Фрагмент матеріалу: {excerpt}'
            except Exception:
                body = ''
        chunks.append(header + body)
    return '\n'.join(chunks)


def _build_system_instruction(mode: str) -> str:
    return (
        'Ти — Metodist AI v1.0, український ШІ-асистент для вчителя. '
        'Відповідай тільки українською мовою. '
        'Пояснюй чітко, прикладно, без зайвої води. '
        'Не використовуй markdown, зірочки, решітки, подвійні зірочки або службове форматування. '
        'Допомагай лише з методикою, НУШ, уроками, дидактикою, вправами, оцінюванням, диференціацією та педагогічними матеріалами. '
        f'{MODE_PROMPTS[mode]} '
        'Враховуй останні згенеровані матеріали користувача, якщо вони релевантні запиту. '
        'Якщо питання поза твоєю компетенцією або тобі бракує впевненості, починай відповідь точно з фрази: '
        "'Я ще не до кінця навчений.' "
        'Далі коротко поясни обмеження і запропонуй, як уточнити запит. '
        'Не вигадуй факти і не приписуй собі доступ до даних, яких у тебе немає.'
    )


def _build_prompt(mode: str, history: list[AssistantChatMessage], context: str) -> str:
    formatted_history = '\n'.join(
        [f"{'Користувач' if item.role == 'user' else 'Metodist AI'}: {item.content}" for item in history]
    )
    return (
        f'Режим консультації: {mode}.\n\n'
        'Останні згенеровані матеріали користувача:\n'
        f'{context}\n\n'
        'Історія діалогу:\n'
        f'{formatted_history}\n\n'
        'Сформуй наступну відповідь Metodist AI.'
    )


def _trim_history(user_id: int, mode: str, db: Session) -> None:
    rows = (
        db.query(AssistantChatMessage)
        .filter(AssistantChatMessage.user_id == user_id, AssistantChatMessage.mode == mode)
        .order_by(AssistantChatMessage.created_at.desc(), AssistantChatMessage.id.desc())
        .all()
    )
    if len(rows) <= MAX_STORED_MESSAGES_PER_MODE:
        return
    for row in rows[MAX_STORED_MESSAGES_PER_MODE:]:
        db.delete(row)


@router.get('/assistant/history', response_model=list[AssistantMessageResponse])
async def get_assistant_history(
    mode: Literal['general', 'goals', 'assessment', 'differentiation', 'nush'] = Query('general'),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_vip(user)
    _require_assistant_storage()
    rows = (
        db.query(AssistantChatMessage)
        .filter(AssistantChatMessage.user_id == user.id, AssistantChatMessage.mode == mode)
        .order_by(AssistantChatMessage.created_at.asc(), AssistantChatMessage.id.asc())
        .all()
    )
    if not rows:
        return [
            AssistantMessageResponse(
                role='assistant',
                content='Вітаю. Я Metodist AI v1.0. Оберіть режим і поставте запитання про урок, НУШ або методику.',
                created_at='system',
            )
        ]
    return _serialize_history(rows)


@router.delete('/assistant/history', dependencies=[Depends(csrf_protect)])
async def clear_assistant_history(
    mode: Literal['general', 'goals', 'assessment', 'differentiation', 'nush'] = Query('general'),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_vip(user)
    _require_assistant_storage()
    (
        db.query(AssistantChatMessage)
        .filter(AssistantChatMessage.user_id == user.id, AssistantChatMessage.mode == mode)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {'status': 'ok'}


@router.post('/assistant/chat', dependencies=[Depends(csrf_protect)])
async def assistant_chat(
    data: AssistantChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_vip(user)
    _require_assistant_storage()
    if assistant_client is None:
        raise HTTPException(status_code=503, detail='Metodist AI тимчасово недоступний')
    if data.mode not in MODE_VALUES:
        raise HTTPException(status_code=400, detail='Невідомий режим асистента')

    user_message = AssistantChatMessage(
        user_id=user.id,
        mode=data.mode,
        role='user',
        content=data.message,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    history = (
        db.query(AssistantChatMessage)
        .filter(AssistantChatMessage.user_id == user.id, AssistantChatMessage.mode == data.mode)
        .order_by(AssistantChatMessage.created_at.desc(), AssistantChatMessage.id.desc())
        .limit(MAX_HISTORY_MESSAGES)
        .all()
    )
    history = list(reversed(history))

    context = _load_recent_lessons_context(user, db)
    prompt = _build_prompt(data.mode, history, context)
    system_instruction = _build_system_instruction(data.mode)

    def call_model():
        return assistant_client.models.generate_content(
            model=ASSISTANT_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.4,
            ),
        )

    try:
        response = await asyncio.to_thread(call_model)
        text = _normalize_assistant_text(getattr(response, 'text', None) or '')
    except Exception:
        text = ''

    if not text:
        text = 'Я ще не до кінця навчений. Спробуйте переформулювати запит більш конкретно.'

    assistant_message = AssistantChatMessage(
        user_id=user.id,
        mode=data.mode,
        role='assistant',
        content=text,
    )
    db.add(assistant_message)
    _trim_history(user.id, data.mode, db)
    db.commit()
    db.refresh(assistant_message)

    return {
        'message': assistant_message.content,
        'version': ASSISTANT_VERSION,
        'mode': data.mode,
        'history': _serialize_history(
            (
                db.query(AssistantChatMessage)
                .filter(AssistantChatMessage.user_id == user.id, AssistantChatMessage.mode == data.mode)
                .order_by(AssistantChatMessage.created_at.asc(), AssistantChatMessage.id.asc())
                .all()
            )
        ),
    }
