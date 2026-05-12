import os
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, constr
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Ticket, TicketMessage, TicketReadState, User
from core.telegram_notifications import enqueue_telegram_notification
from .auth import csrf_protect, get_current_user, is_privileged

router = APIRouter(tags=["Support & Tickets"])


class TicketCreate(BaseModel):
    subject: constr(strip_whitespace=True, min_length=3, max_length=120)
    message: constr(strip_whitespace=True, min_length=3, max_length=2000)


class MessageCreate(BaseModel):
    text: constr(strip_whitespace=True, min_length=1, max_length=2000)


def _user_name(user: Optional[User]) -> str:
    if not user:
        return "User"
    if user.name and user.name.strip():
        return user.name.strip()
    return user.email.split("@")[0]


def _serialize_ticket(
    ticket: Ticket,
    requester: Optional[User],
    handler: Optional[User],
    message_count: int,
    unread_count: int,
    last_message: Optional[TicketMessage],
) -> dict:
    last_activity_at = last_message.created_at if last_message else ticket.created_at
    last_preview = (last_message.text or "").strip() if last_message else ""
    if len(last_preview) > 120:
        last_preview = f"{last_preview[:117]}..."

    return {
        "id": ticket.id,
        "subject": ticket.subject,
        "status": ticket.status,
        "created_at": ticket.created_at,
        "last_activity_at": last_activity_at,
        "message_count": message_count,
        "unread_count": unread_count,
        "last_message_preview": last_preview,
        "user_id": ticket.user_id,
        "user_name": _user_name(requester),
        "user_email": requester.email if requester else None,
        "user_avatar": requester.avatar_url if requester else None,
        "handler_id": ticket.handler_id,
        "handler_name": _user_name(handler) if handler else None,
    }


def _touch_read_state(db: Session, ticket_id: int, user_id: int, seen_at: Optional[datetime] = None) -> None:
    state = (
        db.query(TicketReadState)
        .filter(TicketReadState.ticket_id == ticket_id, TicketReadState.user_id == user_id)
        .first()
    )
    target_seen_at = seen_at or datetime.utcnow()
    if state:
        if target_seen_at > state.last_seen_at:
            state.last_seen_at = target_seen_at
        return
    db.add(TicketReadState(ticket_id=ticket_id, user_id=user_id, last_seen_at=target_seen_at))


def _build_ticket_archive(
    current_user: User,
    db: Session,
    requested_user_id: Optional[int] = None,
) -> dict:
    ticket_query = db.query(Ticket)
    if is_privileged(current_user):
        if requested_user_id is not None:
            ticket_query = ticket_query.filter(Ticket.user_id == requested_user_id)
    else:
        ticket_query = ticket_query.filter(Ticket.user_id == current_user.id)
        requested_user_id = current_user.id

    tickets = ticket_query.order_by(Ticket.created_at.desc(), Ticket.id.desc()).all()
    if not tickets:
        return {
            "users": [],
            "selected_user_id": requested_user_id,
        }

    ticket_ids = [ticket.id for ticket in tickets]
    read_states = {
        state.ticket_id: state.last_seen_at
        for state in (
            db.query(TicketReadState)
            .filter(
                TicketReadState.ticket_id.in_(ticket_ids),
                TicketReadState.user_id == current_user.id,
            )
            .all()
        )
    }

    last_messages: dict[int, TicketMessage] = {}
    message_counts: dict[int, int] = defaultdict(int)
    unread_counts: dict[int, int] = defaultdict(int)
    last_message_rows = (
        db.query(TicketMessage)
        .filter(TicketMessage.ticket_id.in_(ticket_ids))
        .order_by(TicketMessage.ticket_id.asc(), TicketMessage.created_at.desc(), TicketMessage.id.desc())
        .all()
    )
    for message in last_message_rows:
        message_counts[message.ticket_id] += 1
        if message.ticket_id not in last_messages:
            last_messages[message.ticket_id] = message
        last_seen_at = read_states.get(message.ticket_id)
        if message.sender_id != current_user.id and (last_seen_at is None or message.created_at > last_seen_at):
            unread_counts[message.ticket_id] += 1

    related_user_ids = {ticket.user_id for ticket in tickets if ticket.user_id}
    related_user_ids.update(ticket.handler_id for ticket in tickets if ticket.handler_id)
    users = {}
    if related_user_ids:
        users = {
            record.id: record
            for record in db.query(User).filter(User.id.in_(related_user_ids)).all()
        }

    grouped_tickets: dict[int, list[dict]] = defaultdict(list)
    for ticket in tickets:
        requester = users.get(ticket.user_id)
        handler = users.get(ticket.handler_id)
        grouped_tickets[ticket.user_id].append(
            _serialize_ticket(
                ticket=ticket,
                requester=requester,
                handler=handler,
                message_count=message_counts.get(ticket.id, 0),
                unread_count=unread_counts.get(ticket.id, 0),
                last_message=last_messages.get(ticket.id),
            )
        )

    archives = []
    for user_id, user_tickets in grouped_tickets.items():
        requester = users.get(user_id)
        user_tickets.sort(
            key=lambda item: (item["last_activity_at"], item["id"]),
            reverse=True,
        )
        open_tickets = sum(1 for item in user_tickets if item["status"] != "closed")
        closed_tickets = sum(1 for item in user_tickets if item["status"] == "closed")
        unread_tickets = sum(1 for item in user_tickets if item["unread_count"] > 0)
        unread_messages = sum(item["unread_count"] for item in user_tickets)
        last_activity_at = user_tickets[0]["last_activity_at"] if user_tickets else None
        archives.append(
            {
                "user_id": user_id,
                "user_name": _user_name(requester),
                "user_email": requester.email if requester else None,
                "user_avatar": requester.avatar_url if requester else None,
                "user_role": requester.role if requester else "User",
                "tickets_count": len(user_tickets),
                "open_tickets": open_tickets,
                "closed_tickets": closed_tickets,
                "unread_tickets": unread_tickets,
                "unread_messages": unread_messages,
                "last_activity_at": last_activity_at,
                "tickets": user_tickets,
            }
        )

    archives.sort(
        key=lambda item: item["last_activity_at"] or datetime.min,
        reverse=True,
    )

    if is_privileged(current_user):
        selected_user_id = requested_user_id or (archives[0]["user_id"] if archives else None)
    else:
        selected_user_id = current_user.id

    return {
        "users": archives,
        "selected_user_id": selected_user_id,
    }


@router.get("/tickets")
async def get_tickets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
):
    archive = _build_ticket_archive(user, db, user_id)
    flattened = []
    for item in archive["users"]:
        flattened.extend(item["tickets"])
    return flattened


@router.get("/tickets/archive")
async def get_ticket_archive(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
):
    return _build_ticket_archive(user, db, user_id)


@router.post("/tickets", dependencies=[Depends(csrf_protect)])
async def create_ticket(
    data: TicketCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        created_at = datetime.utcnow()
        ticket = Ticket(user_id=user.id, subject=data.subject, status="open", created_at=created_at)
        db.add(ticket)
        db.flush()

        first_message = TicketMessage(
            ticket_id=ticket.id,
            sender_id=user.id,
            text=data.message,
            created_at=created_at,
        )
        db.add(first_message)
        _touch_read_state(db, ticket.id, user.id, created_at)
        db.commit()
        db.refresh(ticket)
        return {
            "id": ticket.id,
            "status": ticket.status,
        }
    except Exception:
        db.rollback()
        raise


@router.get("/tickets/{ticket_id}/messages")
async def get_ticket_messages(
    ticket_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не знайдено")

    if ticket.user_id != user.id and not is_privileged(user):
        raise HTTPException(status_code=403, detail="Доступ заборонено")

    messages = (
        db.query(TicketMessage)
        .filter(TicketMessage.ticket_id == ticket_id)
        .order_by(TicketMessage.created_at.asc(), TicketMessage.id.asc())
        .all()
    )
    seen_at = messages[-1].created_at if messages else datetime.utcnow()
    _touch_read_state(db, ticket_id, user.id, seen_at)
    db.commit()
    sender_ids = {message.sender_id for message in messages if message.sender_id}
    senders = {}
    if sender_ids:
        senders = {
            record.id: record
            for record in db.query(User).filter(User.id.in_(sender_ids)).all()
        }

    return [
        {
            "id": message.id,
            "text": message.text,
            "created_at": message.created_at,
            "sender_id": message.sender_id,
            "sender_name": _user_name(senders.get(message.sender_id)),
            "sender_role": senders.get(message.sender_id).role if senders.get(message.sender_id) else "User",
            "sender_avatar": senders.get(message.sender_id).avatar_url if senders.get(message.sender_id) else None,
        }
        for message in messages
    ]


@router.post("/tickets/{ticket_id}/messages", dependencies=[Depends(csrf_protect)])
async def send_ticket_message(
    ticket_id: int,
    data: MessageCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не знайдено")
    if ticket.status == "closed":
        raise HTTPException(status_code=409, detail="Тикет закритий")
    if ticket.user_id != user.id and not is_privileged(user):
        raise HTTPException(status_code=403, detail="Доступ заборонено")

    if is_privileged(user):
        ticket.status = "pending"
        if ticket.handler_id is None:
            ticket.handler_id = user.id
    else:
        ticket.status = "open"

    created_at = datetime.utcnow()
    db.add(TicketMessage(ticket_id=ticket_id, sender_id=user.id, text=data.text, created_at=created_at))
    _touch_read_state(db, ticket_id, user.id, created_at)
    ticket_owner = db.query(User).filter(User.id == ticket.user_id).first()
    if is_privileged(user) and ticket_owner and ticket_owner.id != user.id:
        enqueue_telegram_notification(
            db,
            user=ticket_owner,
            notification_type="support_reply",
            title="Відповідь підтримки",
            body=f"У тікеті «{ticket.subject}» з'явилась нова відповідь від підтримки.",
            action_url=f"{os.getenv('SITE_BASE_URL', 'https://metodist.co.ua').rstrip('/')}/?tab=support",
            ticket_id=ticket.id,
            meta={
                "ticket_id": ticket.id,
                "subject": ticket.subject,
                "message_preview": data.text[:280],
            },
        )
    db.commit()
    return {"status": "ok"}


@router.post("/tickets/{ticket_id}/close", dependencies=[Depends(csrf_protect)])
async def close_ticket(
    ticket_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Тикет не знайдено")
    if ticket.user_id != user.id and not is_privileged(user):
        raise HTTPException(status_code=403, detail="Доступ заборонено")

    ticket.status = "closed"
    if is_privileged(user) and ticket.handler_id is None:
        ticket.handler_id = user.id
    db.commit()
    return {"status": "closed"}
