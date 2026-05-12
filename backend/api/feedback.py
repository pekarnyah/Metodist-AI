import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import csrf_protect, get_current_admin, get_current_user
from core.support_mail import SupportMailConfigError, is_smtp_configured, send_support_email

router = APIRouter(tags=["Feedback"])


class FeedbackPayload(BaseModel):
    run_id: str = Field(min_length=1, max_length=128)
    topic: str = Field(min_length=1, max_length=500)
    subject: str = Field(min_length=1, max_length=120)
    grade: str = Field(min_length=1, max_length=60)
    problem_type: str = Field(min_length=1, max_length=80)
    comment: str | None = Field(default=None, max_length=5000)
    user_email: str | None = Field(default=None, max_length=320)


class FeedbackReplyPayload(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=12000)


def _is_safe_run_id(run_id: str) -> bool:
    return bool(run_id) and "/" not in run_id and "\\" not in run_id and ".." not in run_id


def _load_run_report(run_id: str) -> dict:
    if not _is_safe_run_id(run_id):
        return {}

    report_path = Path("storage") / "runs" / run_id / "request_report.json"
    if not report_path.exists():
        return {}

    try:
        return json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _lesson_path_for_run(run_id: str) -> str:
    if not _is_safe_run_id(run_id):
        return ""

    lesson_path = Path("storage") / "runs" / run_id / "lesson_dump.txt"
    if lesson_path.exists():
        return lesson_path.as_posix()
    return ""


def _feedback_dir() -> Path:
    return Path("storage") / "feedback"


def _load_feedback_record(file_path: Path) -> dict:
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    if not data.get("feedback_id"):
        data["feedback_id"] = file_path.stem.replace("feedback_", "", 1)
    if not data.get("created_at"):
        data["created_at"] = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc).isoformat()
    return data


def _feedback_sort_key(item: dict) -> tuple[str, str]:
    created_at = str(item.get("created_at") or "")
    feedback_id = str(item.get("feedback_id") or "")
    return created_at, feedback_id


def _find_feedback_file(feedback_id: str) -> Path | None:
    file_path = _feedback_dir() / f"feedback_{feedback_id}.json"
    if file_path.exists():
        return file_path

    directory = _feedback_dir()
    if directory.exists():
        for candidate in directory.glob("feedback_*.json"):
            record = _load_feedback_record(candidate)
            if record and str(record.get("feedback_id") or "") == feedback_id:
                return candidate
    return None


def _save_feedback_record(file_path: Path, record: dict) -> None:
    file_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")


@router.get("/feedback")
async def list_feedback(_=Depends(get_current_admin)):
    directory = _feedback_dir()
    if not directory.exists():
        return {"items": []}

    records: list[dict] = []
    for file_path in directory.glob("feedback_*.json"):
        record = _load_feedback_record(file_path)
        if not record:
            continue
        records.append(
            {
                "feedback_id": str(record.get("feedback_id") or ""),
                "created_at": str(record.get("created_at") or ""),
                "topic": str(record.get("topic") or ""),
                "problem_type": str(record.get("problem_type") or ""),
                "user_email": record.get("user_email"),
                "reply_status": str(record.get("reply_status") or "not_sent"),
                "run_id": str(record.get("run_id") or ""),
                "comment_preview": (str(record.get("comment") or "")[:180]).strip(),
            }
        )

    records.sort(key=_feedback_sort_key, reverse=True)
    return {
        "items": records,
        "smtp": {
            "configured": is_smtp_configured(),
        },
    }


@router.get("/feedback/{feedback_id}")
async def get_feedback_details(feedback_id: str, _=Depends(get_current_admin)):
    feedback_id = feedback_id.strip()
    if not feedback_id or "/" in feedback_id or "\\" in feedback_id or ".." in feedback_id:
        raise HTTPException(status_code=400, detail="Invalid feedback_id")

    file_path = _find_feedback_file(feedback_id)
    if file_path and file_path.exists():
        record = _load_feedback_record(file_path)
        if record:
            return {"item": record}

    raise HTTPException(status_code=404, detail="Feedback not found")


@router.post("/feedback/{feedback_id}/reply", dependencies=[Depends(csrf_protect)])
async def reply_feedback(
    feedback_id: str,
    payload: FeedbackReplyPayload,
    admin_user=Depends(get_current_admin),
):
    feedback_id = feedback_id.strip()
    if not feedback_id or "/" in feedback_id or "\\" in feedback_id or ".." in feedback_id:
        raise HTTPException(status_code=400, detail="Invalid feedback_id")

    file_path = _find_feedback_file(feedback_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="Feedback not found")

    record = _load_feedback_record(file_path)
    if not record:
        raise HTTPException(status_code=500, detail="Feedback record is corrupted")

    to_email = str(record.get("user_email") or "").strip()
    if not to_email:
        raise HTTPException(status_code=400, detail="Feedback has no user_email")

    subject = payload.subject.strip()
    message = payload.message.strip()
    preview = (message[:300]).strip()
    replier = str(getattr(admin_user, "email", "") or "").strip()

    try:
        await asyncio.to_thread(send_support_email, to_email=to_email, subject=subject, message=message)
    except SupportMailConfigError as exc:
        record["reply_status"] = "failed"
        record["reply_subject"] = subject
        record["reply_body_preview"] = preview
        record["replied_by"] = replier
        _save_feedback_record(file_path, record)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        record["reply_status"] = "failed"
        record["reply_subject"] = subject
        record["reply_body_preview"] = preview
        record["replied_by"] = replier
        _save_feedback_record(file_path, record)
        raise HTTPException(status_code=502, detail="SMTP send failed")

    record["reply_sent_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    record["reply_status"] = "sent"
    record["reply_subject"] = subject
    record["reply_body_preview"] = preview
    record["replied_by"] = replier
    _save_feedback_record(file_path, record)

    return {"status": "ok", "feedback_id": feedback_id, "reply_status": "sent"}


@router.post("/feedback", dependencies=[Depends(csrf_protect)])
async def create_feedback(payload: FeedbackPayload, user=Depends(get_current_user)):
    run_id = payload.run_id.strip()
    if not _is_safe_run_id(run_id):
        raise HTTPException(status_code=400, detail="Invalid run_id")

    report = _load_run_report(run_id)
    quality = report.get("quality") if isinstance(report, dict) else {}
    if not isinstance(quality, dict):
        quality = {}

    refinement = report.get("refinement") if isinstance(report, dict) else {}
    refinement_used = False
    if isinstance(refinement, dict):
        refinement_used = bool(refinement.get("used", False))

    created_at = datetime.now(timezone.utc).replace(microsecond=0)
    timestamp = created_at.strftime("%Y%m%d_%H%M%S")
    feedback_id = f"{timestamp}_{run_id[:24]}"

    feedback_payload = {
        "feedback_id": feedback_id,
        "run_id": run_id,
        "topic": payload.topic.strip(),
        "subject": payload.subject.strip(),
        "grade": payload.grade.strip(),
        "problem_type": payload.problem_type.strip(),
        "comment": (payload.comment or "").strip() or None,
        "user_email": (
            (getattr(user, "email", None) or "").strip()
            or (payload.user_email or "").strip()
            or None
        ),
        "metrics": quality,
        "refinement_used": refinement_used,
        "lesson_path": _lesson_path_for_run(run_id),
        "reply_sent_at": None,
        "reply_status": "not_sent",
        "reply_subject": "",
        "reply_body_preview": "",
        "replied_by": "",
        "created_at": created_at.isoformat(),
    }

    feedback_dir = _feedback_dir()
    feedback_dir.mkdir(parents=True, exist_ok=True)
    feedback_path = feedback_dir / f"feedback_{feedback_id}.json"
    feedback_path.write_text(
        json.dumps(feedback_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "status": "ok",
        "feedback_id": feedback_id,
        "path": feedback_path.as_posix(),
    }
