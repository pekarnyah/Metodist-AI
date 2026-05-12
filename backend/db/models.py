from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

# backend/db/models.py
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=False)
    is_banned = Column(Boolean, default=False)
    subscription = Column(String, default="Free")
    free_generations = Column(Integer, default=1)
    subscription_ends_at = Column(DateTime, nullable=True)
    tokens_reset_at = Column(DateTime, nullable=True)
    telegram_user_id = Column(String, unique=True, index=True, nullable=True)
    telegram_username = Column(String, nullable=True)
    telegram_first_name = Column(String, nullable=True)
    telegram_linked_at = Column(DateTime, nullable=True)
    telegram_notifications_enabled = Column(Boolean, default=True)


    
    # НОВЫЕ ПОЛЯ ДЛЯ ТРИАЛА И ЛИМИТОВ:
    last_daily_reset = Column(Date, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)
    
    role = Column(String, default="User")
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)



# Новая таблица для Тикетов (Техподдержка)
class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    subject = Column(String)
    status = Column(String, default="open") # open, pending, closed
    
    # НОВОЕ ПОЛЕ: кто из саппортов взял тикет
    handler_id = Column(Integer, ForeignKey("users.id"), nullable=True) 
    
    created_at = Column(DateTime, default=datetime.utcnow)

class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    sender_id = Column(Integer, ForeignKey("users.id"))
    text = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class TicketReadState(Base):
    __tablename__ = "ticket_read_states"
    __table_args__ = (
        UniqueConstraint("ticket_id", "user_id", name="uq_ticket_read_state_ticket_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)



class UserLesson(Base):
    __tablename__ = "user_lessons"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True)
    topic = Column(String)
    grade = Column(String)
    file_path = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class GenerationDiagnostic(Base):
    __tablename__ = "generation_diagnostics"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String, unique=True, index=True, nullable=False)
    user_email = Column(String, index=True, nullable=True)
    topic = Column(String, nullable=True)
    grade = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    mode = Column(String, nullable=True)
    status = Column(String, nullable=False, default="success")
    source_files_count = Column(Integer, nullable=False, default=0)
    source_names_json = Column(Text, nullable=True)
    template_docs_found = Column(Integer, nullable=False, default=0)
    parsed_docs_count = Column(Integer, nullable=False, default=0)
    reference_doc = Column(String, nullable=True)
    has_reference_structure = Column(Boolean, nullable=False, default=False)
    source_hints_count = Column(Integer, nullable=False, default=0)
    has_slide_plan = Column(Boolean, nullable=False, default=False)
    blueprint_sections = Column(Integer, nullable=False, default=0)
    blueprint_stages = Column(Integer, nullable=False, default=0)
    used_strict_example = Column(Boolean, nullable=False, default=False)
    used_repair_pass = Column(Boolean, nullable=False, default=False)
    fell_back_to_rich = Column(Boolean, nullable=False, default=False)
    final_strategy = Column(String, nullable=True)
    quality_score = Column(Float, nullable=True)
    quality_total_items = Column(Integer, nullable=True)
    weak_nodes_json = Column(Text, nullable=True)
    output_name = Column(String, nullable=True)
    output_path = Column(String, nullable=True)
    output_ext = Column(String, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String)
    text = Column(Text)
    rating = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserOTP(Base):
    __tablename__ = "user_otps"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True)
    code = Column(String)
    expires_at = Column(DateTime)


class TelegramLinkCode(Base):
    __tablename__ = "telegram_link_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AssistantChatMessage(Base):
    __tablename__ = "assistant_chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    mode = Column(String, index=True, nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    event_name = Column(String, nullable=False, index=True)
    page = Column(String, nullable=True)
    source = Column(String, nullable=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class NewsPost(Base):
    __tablename__ = "news_posts"
    __table_args__ = (
        UniqueConstraint("channel_username", "channel_post_id", name="uq_news_channel_post"),
    )

    id = Column(Integer, primary_key=True, index=True)
    channel_post_id = Column(String, nullable=False, index=True)
    channel_username = Column(String, nullable=False, index=True)
    title = Column(String, nullable=True)
    text = Column(Text, nullable=True)
    excerpt = Column(Text, nullable=True)
    telegram_url = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    media_type = Column(String, nullable=True)
    media_file_id = Column(String, nullable=True)
    is_visible = Column(Boolean, default=True, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False)
    published_at = Column(DateTime, nullable=False, index=True)
    edited_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TelegramNotification(Base):
    __tablename__ = "telegram_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    action_url = Column(String, nullable=True)
    lesson_id = Column(Integer, ForeignKey("user_lessons.id"), nullable=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True)
    meta_json = Column(Text, nullable=True)
    is_sent = Column(Boolean, default=False, nullable=False, index=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
