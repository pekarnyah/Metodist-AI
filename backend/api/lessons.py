import json
import os
import time
import asyncio
import logging
import shutil
import base64
import hmac
import hashlib
from collections import Counter
from pathlib import Path
from textwrap import wrap
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import List, Literal
from fastapi import Query
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

from db.database import get_db
from db.models import GenerationDiagnostic, User, UserLesson
from core.generator import LessonGenerator
from core.generation_queue import generation_queue
from core.security import sanitize_filename
from core.telegram_notifications import enqueue_telegram_notification
from .auth import get_current_user, csrf_protect
import aiofiles
import secrets


router = APIRouter(tags=["Lessons & AI Generation"])


def _resolve_gemini_api_key() -> str:
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY"):
        value = os.getenv(name)
        if value and str(value).strip():
            return str(value).strip()
    return ""


generator = LessonGenerator(api_key=_resolve_gemini_api_key())
logger = logging.getLogger(__name__)
ALLOWED_SOURCE_EXTENSIONS = {".pptx", ".docx", ".pdf", ".txt", ".md"}
MAX_SOURCE_FILE_SIZE = 15 * 1024 * 1024
MAX_TOTAL_SOURCE_SIZE = 30 * 1024 * 1024
MAX_SOURCE_FILES = 5
try:
    _queue_wait_timeout_raw = float(os.getenv("GENERATION_QUEUE_WAIT_TIMEOUT_SEC", "20"))
except ValueError:
    _queue_wait_timeout_raw = 20.0
GENERATION_QUEUE_WAIT_TIMEOUT_SEC = max(5.0, _queue_wait_timeout_raw)
try:
    _queue_max_waiting_raw = int(float(os.getenv("GENERATION_QUEUE_MAX_WAITING", "4")))
except ValueError:
    _queue_max_waiting_raw = 4
GENERATION_QUEUE_MAX_WAITING = max(1, _queue_max_waiting_raw)
try:
    _generation_total_timeout_raw = float(os.getenv("GENERATION_TOTAL_TIMEOUT_SEC", "75"))
except ValueError:
    _generation_total_timeout_raw = 75.0
GENERATION_TOTAL_TIMEOUT_SEC = max(20.0, _generation_total_timeout_raw)
OVERLOAD_MESSAGE_UA = "Помилка сервера. Сервер перевантажений або тимчасово недоступний. Спробуйте ще раз через кілька хвилин."
TIMEOUT_MESSAGE_UA = "Не вдалося обробити запит вчасно. Сервер зараз перевантажений. Повторіть спробу пізніше."
MONTHLY_GENERATION_LIMITS = {
    "Free": 15,
    "Pro": 50,
    "VIP": 150,
}

logger.info(
    "generation_runtime_config queue_wait_timeout_sec=%s queue_max_waiting=%s total_timeout_sec=%s",
    GENERATION_QUEUE_WAIT_TIMEOUT_SEC,
    GENERATION_QUEUE_MAX_WAITING,
    GENERATION_TOTAL_TIMEOUT_SEC,
)


class HistoryItem(BaseModel):
    id: int
    topic: str
    grade: str
    created_at: datetime
    path: str


class GenerationQueueStatus(BaseModel):
    active_request_id: str | None
    waiting_count: int
    total_in_system: int


class GenerationRunMetrics(BaseModel):
    topic_coverage_ratio: float = 0.0
    practice_topic_coverage_ratio: float = 0.0
    actualization_topic_coverage_ratio: float = 0.0
    generic_phrase_ratio: float = 0.0
    specificity_ratio: float = 0.0
    structure_ratio: float = 0.0
    cue_phrase_ratio: float = 0.0
    dialogue_ratio: float = 0.0
    explanation_repetition_ratio: float = 0.0
    needs_refinement: bool = False
    reasons: list[str] = []


class GenerationRunOutputFiles(BaseModel):
    output_name: str = ""
    output_path: str = ""
    output_size_bytes: int = 0
    lesson_dump_available: bool = False
    docx_download_available: bool = False
    pdf_preview_available: bool = False
    pdf_preview_reason: str = ""


class GenerationRunListItem(BaseModel):
    id: str
    request_id: str
    created_at: str
    topic: str
    subject: str
    grade: str
    status: str
    requirements: str
    refinement_used: bool = False
    queue_wait_ms: int = 0
    generation_ms: int = 0
    metrics: GenerationRunMetrics
    output_files: GenerationRunOutputFiles


class GenerationRunsPagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class GenerationRunsResponse(BaseModel):
    items: list[GenerationRunListItem]
    pagination: GenerationRunsPagination


class PdfPreviewRebuildResponse(BaseModel):
    run_id: str
    status: Literal["ready", "unavailable", "failed"]
    pdf_preview_available: bool
    pdf_preview_reason: str = ""
    lesson_dump_available: bool = False
    message: str = ""


class PdfPreviewBackfillResponse(BaseModel):
    scanned: int
    rebuilt: int
    skipped_ready: int
    skipped_unavailable: int
    failed: int


class GenerationRunShareResponse(BaseModel):
    token: str
    run_id: str
    share_path: str
    share_url: str | None = None
    expires_at: str


class QualityMetricAverages(BaseModel):
    topic_coverage_ratio: float = 0.0
    practice_topic_coverage_ratio: float = 0.0
    specificity_ratio: float = 0.0
    generic_phrase_ratio: float = 0.0
    structure_ratio: float = 0.0
    cue_phrase_ratio: float = 0.0
    dialogue_ratio: float = 0.0
    explanation_repetition_ratio: float = 0.0


class QualityReasonCount(BaseModel):
    reason: str
    count: int


class QualityDegradationSignal(BaseModel):
    metric: str
    recent_avg: float
    baseline_avg: float
    delta: float
    direction: Literal["up", "down"]
    severity: Literal["warning", "critical"]


class QualityWindowSummary(BaseModel):
    window_size: int
    sample_size: int
    total_runs: int
    success_runs: int
    failed_runs: int
    refinement_used_count: int
    refinement_used_ratio: float
    averages: QualityMetricAverages
    top_quality_reasons: list[QualityReasonCount]
    top_refinement_reasons: list[QualityReasonCount]
    top_failure_reasons: list[QualityReasonCount]
    degradation_signals: list[QualityDegradationSignal]


class QualityTrendsResponse(BaseModel):
    status: str
    timestamp: str
    total_available_runs: int
    windows: list[QualityWindowSummary]


def _persist_generation_diagnostic(
    db: Session,
    *,
    request_id: str,
    user_email: str,
    topic: str,
    grade: str,
    subject: str,
    mode: str,
    duration_ms: int,
    diagnostics: dict | None,
    status: str,
    error_message: str | None = None,
):
    payload = diagnostics or {}
    weak_nodes = payload.get("weak_nodes") or []
    source_names = payload.get("source_names") or []
    row = GenerationDiagnostic(
        request_id=request_id,
        user_email=user_email,
        topic=topic,
        grade=grade,
        subject=subject,
        mode=mode,
        status=status,
        source_files_count=int(payload.get("source_files_count") or 0),
        source_names_json=json.dumps(source_names, ensure_ascii=False),
        template_docs_found=int(payload.get("template_docs_found") or 0),
        parsed_docs_count=int(payload.get("parsed_docs_count") or 0),
        reference_doc=payload.get("reference_doc"),
        has_reference_structure=bool(payload.get("has_reference_structure")),
        source_hints_count=int(payload.get("source_hints_count") or 0),
        has_slide_plan=bool(payload.get("has_slide_plan")),
        blueprint_sections=int(payload.get("blueprint_sections") or 0),
        blueprint_stages=int(payload.get("blueprint_stages") or 0),
        used_strict_example=bool(payload.get("used_strict_example")),
        used_repair_pass=bool(payload.get("used_repair_pass")),
        fell_back_to_rich=bool(payload.get("fell_back_to_rich")),
        final_strategy=payload.get("final_strategy"),
        quality_score=payload.get("quality_score"),
        quality_total_items=payload.get("quality_total_items"),
        weak_nodes_json=json.dumps(weak_nodes, ensure_ascii=False),
        output_name=payload.get("output_name"),
        output_path=payload.get("output_path"),
        output_ext=payload.get("output_ext"),
        duration_ms=duration_ms,
        error_message=(error_message or "")[:4000] or None,
    )
    db.add(row)
    db.commit()


def _write_json_utf8(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def _extract_docx_text(path: Path) -> str:
    doc = Document(str(path))
    lines: list[str] = []
    for child in doc.element.body.iterchildren():
        if child.tag.endswith("}p"):
            paragraph = Paragraph(child, doc)
            text = paragraph.text.strip()
            if text:
                lines.append(text)
        elif child.tag.endswith("}tbl"):
            table = Table(child, doc)
            for row in table.rows:
                cells = [
                    " / ".join(paragraph.text.strip() for paragraph in cell.paragraphs if paragraph.text.strip())
                    for cell in row.cells
                ]
                row_text = " | ".join(cell for cell in cells if cell).strip()
                if row_text:
                    lines.append(row_text)
    return "\n".join(lines).strip()


def _resolve_preview_text(run_dir: Path, payload: dict | None = None) -> str:
    """Best-effort preview text resolver for old/new runs.

    Priority:
    1) lesson_dump.txt
    2) common text artifacts inside run dir
    3) docx output referenced in report payload (or in run dir)
    """
    text_candidates = [
        run_dir / "lesson_dump.txt",
        run_dir / "generated_lesson.txt",
        run_dir / "generated_lesson.md",
        run_dir / "lesson.txt",
        run_dir / "lesson.md",
    ]
    for candidate in text_candidates:
        if candidate.exists():
            try:
                text = candidate.read_text(encoding="utf-8").strip()
                if text:
                    return text
            except Exception:
                logger.warning("preview_text_read_failed path=%s", candidate)

    output_path_raw = str(((payload or {}).get("output") or {}).get("path") or "")
    output_name = str(((payload or {}).get("output") or {}).get("name") or "")
    docx_candidates: list[Path] = []
    if output_path_raw:
        docx_candidates.append(Path(output_path_raw))
    if output_name:
        docx_candidates.append(run_dir / output_name)
    docx_candidates.extend(run_dir.glob("*.docx"))

    seen: set[str] = set()
    for candidate in docx_candidates:
        key = str(candidate.resolve()) if candidate.exists() else str(candidate)
        if key in seen:
            continue
        seen.add(key)
        if not candidate.exists() or candidate.suffix.lower() != ".docx":
            continue
        try:
            text = _extract_docx_text(candidate).strip()
            if text:
                return text
        except Exception:
            logger.warning("preview_text_docx_read_failed path=%s", candidate)

    return ""


def _can_build_pdf_preview(run_dir: Path, payload: dict | None = None) -> bool:
    if (run_dir / "lesson_preview.pdf").exists():
        return True
    if (run_dir / "lesson_dump.txt").exists():
        return True
    if (run_dir / "generated_lesson.txt").exists() or (run_dir / "generated_lesson.md").exists():
        return True
    if (run_dir / "lesson.txt").exists() or (run_dir / "lesson.md").exists():
        return True

    output_path_raw = str(((payload or {}).get("output") or {}).get("path") or "")
    output_name = str(((payload or {}).get("output") or {}).get("name") or "")
    docx_candidates: list[Path] = []
    if output_path_raw:
        docx_candidates.append(Path(output_path_raw))
    if output_name:
        docx_candidates.append(run_dir / output_name)
    docx_candidates.extend(run_dir.glob("*.docx"))

    for candidate in docx_candidates:
        if candidate.exists() and candidate.suffix.lower() == ".docx":
            return True
    return False


def _is_pdf_renderer_available() -> bool:
    try:
        from reportlab.lib.pagesizes import A4  # noqa: F401
        from reportlab.pdfbase import pdfmetrics  # noqa: F401
        from reportlab.pdfbase.ttfonts import TTFont  # noqa: F401
        from reportlab.pdfgen import canvas  # noqa: F401
    except Exception:
        return False
    return True


def _pdf_preview_reason(run_dir: Path, payload: dict | None = None) -> str:
    pdf_path = run_dir / "lesson_preview.pdf"
    if pdf_path.exists():
        return ""
    if not _can_build_pdf_preview(run_dir, payload):
        return "source_text_missing"
    if not _is_pdf_renderer_available():
        return "renderer_unavailable"
    return "not_built_yet"


def _rebuild_pdf_preview(run_dir: Path, payload: dict | None = None) -> tuple[bool, str, bool]:
    pdf_path = run_dir / "lesson_preview.pdf"
    dump_path = run_dir / "lesson_dump.txt"
    if pdf_path.exists():
        return True, "", dump_path.exists()

    dump_text = dump_path.read_text(encoding="utf-8").strip() if dump_path.exists() else ""
    if not dump_text:
        dump_text = _resolve_preview_text(run_dir, payload).strip()
        if dump_text:
            try:
                dump_path.write_text(dump_text, encoding="utf-8")
            except Exception:
                logger.warning("pdf_preview_dump_write_failed run_dir=%s", run_dir)

    if not dump_text:
        return False, "source_text_missing", dump_path.exists()

    built = _build_lesson_preview_pdf(run_dir, dump_text)
    if built and pdf_path.exists():
        return True, "", dump_path.exists()
    if not _is_pdf_renderer_available():
        return False, "renderer_unavailable", dump_path.exists()
    return False, "build_failed", dump_path.exists()


def _build_lesson_preview_pdf(run_dir: Path, lesson_text: str) -> bool:
    text = str(lesson_text or "").strip()
    if not text:
        return False
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.pdfgen import canvas
    except Exception as exc:
        logger.warning("pdf_preview_disabled reason=reportlab_unavailable err=%s", exc)
        return False

    font_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\calibri.ttf",
    ]
    font_path = next((item for item in font_candidates if Path(item).exists()), "")
    font_name = "Helvetica"
    if font_path:
        try:
            font_name = "MetodistPreviewFont"
            pdfmetrics.registerFont(TTFont(font_name, font_path))
        except Exception as exc:
            logger.warning("pdf_preview_font_register_failed path=%s err=%s", font_path, exc)
            font_name = "Helvetica"

    output_path = run_dir / "lesson_preview.pdf"
    page_w, page_h = A4
    margin_x = 40
    margin_top = 50
    line_height = 14
    max_chars = 110
    y_min = 45
    y = page_h - margin_top
    pdf = canvas.Canvas(str(output_path), pagesize=A4)
    pdf.setTitle("Lesson Preview")
    pdf.setFont(font_name, 11)

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        chunks = wrap(line, max_chars) if line else [""]
        for chunk in chunks:
            if y < y_min:
                pdf.showPage()
                pdf.setFont(font_name, 11)
                y = page_h - margin_top
            pdf.drawString(margin_x, y, chunk)
            y -= line_height

    pdf.save()
    return output_path.exists()


def _build_run_report(
    *,
    request_id: str,
    created_at_iso: str,
    status: str,
    topic: str,
    grade: str,
    subject: str,
    mode: str,
    requirements: str,
    context: str,
    user_email: str,
    output_path: str,
    output_name: str,
    output_size_bytes: int,
    queue_wait_ms: int,
    duration_ms: int,
    diagnostics: dict | None,
    error_message: str = "",
) -> dict:
    payload = diagnostics or {}
    validation = payload.get("validation_after_refinement") or payload.get("validation") or {}
    return {
        "request_id": request_id,
        "created_at": created_at_iso,
        "status": status,
        "input": {
            "topic": topic,
            "grade": grade,
            "subject": subject,
            "mode": mode,
            "requirements": requirements,
            "context": context,
            "user_email": user_email,
        },
        "output": {
            "name": output_name,
            "path": output_path,
            "size_bytes": int(output_size_bytes or 0),
        },
        "runtime": {
            "queue_wait_ms": int(queue_wait_ms or 0),
            "duration_ms": int(duration_ms or 0),
            "model_calls_total": int(payload.get("model_calls_total") or len(payload.get("model_calls") or [])),
            "strategy": str(payload.get("final_strategy") or payload.get("pipeline_version") or ""),
        },
        "quality": {
            "topic_coverage_ratio": float(validation.get("topic_coverage_ratio") or 0.0),
            "practice_topic_coverage_ratio": float(validation.get("practice_topic_coverage_ratio") or 0.0),
            "actualization_topic_coverage_ratio": float(validation.get("actualization_topic_coverage_ratio") or 0.0),
            "generic_phrase_ratio": float(validation.get("generic_phrase_ratio") or 0.0),
            "specificity_ratio": float(validation.get("specificity_ratio") or 0.0),
            "structure_ratio": float(validation.get("structure_ratio") or 0.0),
            "cue_phrase_ratio": float(validation.get("cue_phrase_ratio") or 0.0),
            "dialogue_ratio": float(validation.get("dialogue_ratio") or 0.0),
            "explanation_repetition_ratio": float(validation.get("explanation_repetition_ratio") or 0.0),
            "needs_refinement": bool(validation.get("needs_refinement")),
            "reasons": list(validation.get("reasons") or []),
        },
        "refinement": {
            "used": bool(payload.get("refinement_used")),
            "reverted": bool(payload.get("refinement_reverted")),
            "revert_reason": str(payload.get("refinement_revert_reason") or ""),
            "should_run": bool(payload.get("refinement_should_run")),
            "reasons": list(payload.get("refinement_reasons") or []),
        },
        "error": {"message": error_message or ""},
    }


def _persist_generation_run_artifacts(
    *,
    request_id: str,
    status: str,
    topic: str,
    grade: str,
    subject: str,
    mode: str,
    requirements: str,
    context: str,
    user_email: str,
    diagnostics: dict | None,
    output_path: str = "",
    output_name: str = "",
    queue_wait_ms: int = 0,
    duration_ms: int = 0,
    error_message: str = "",
):
    created_at = datetime.utcnow()
    created_at_iso = created_at.isoformat() + "Z"
    run_dir = Path("storage") / "runs" / f"{created_at.strftime('%Y%m%d_%H%M%S')}_{request_id}"
    run_dir.mkdir(parents=True, exist_ok=True)

    request_payload = {
        "request_id": request_id,
        "created_at": created_at_iso,
        "status": status,
        "topic": topic,
        "grade": grade,
        "subject": subject,
        "mode": mode,
        "requirements": requirements,
        "context": context,
        "user_email": user_email,
    }
    _write_json_utf8(run_dir / "request.json", request_payload)
    _write_json_utf8(run_dir / "diagnostics.json", diagnostics or {})

    copied_output_path = ""
    output_size_bytes = 0
    if output_path:
        src = Path(output_path)
        if src.exists():
            copied_name = src.name
            dst = run_dir / copied_name
            shutil.copy2(src, dst)
            copied_output_path = str(dst)
            output_size_bytes = dst.stat().st_size
            if dst.suffix.lower() == ".docx":
                try:
                    dump_text = _extract_docx_text(dst)
                except Exception:
                    dump_text = ""
                if dump_text:
                    (run_dir / "lesson_dump.txt").write_text(dump_text, encoding="utf-8")
                    _build_lesson_preview_pdf(run_dir, dump_text)

    report = _build_run_report(
        request_id=request_id,
        created_at_iso=created_at_iso,
        status=status,
        topic=topic,
        grade=grade,
        subject=subject,
        mode=mode,
        requirements=requirements,
        context=context,
        user_email=user_email,
        output_path=copied_output_path,
        output_name=output_name,
        output_size_bytes=output_size_bytes,
        queue_wait_ms=queue_wait_ms,
        duration_ms=duration_ms,
        diagnostics=diagnostics,
        error_message=error_message,
    )
    _write_json_utf8(run_dir / "request_report.json", report)
    _write_json_utf8(
        run_dir / "summary.json",
        {
            "request_id": request_id,
            "status": status,
            "topic": topic,
            "grade": grade,
            "subject": subject,
            "output_name": output_name,
            "output_path": copied_output_path,
            "output_size_bytes": output_size_bytes,
            "queue_wait_ms": int(queue_wait_ms or 0),
            "duration_ms": int(duration_ms or 0),
            "refinement_used": bool((diagnostics or {}).get("refinement_used")),
            "error_message": error_message or "",
        },
    )
    return str(run_dir)


def _safe_run_dir(run_id: str) -> Path:
    if not run_id or "/" in run_id or "\\" in run_id or ".." in run_id:
        raise HTTPException(status_code=400, detail="Некоректний run id")
    return Path("storage") / "runs" / run_id


def _share_secret() -> str:
    return (
        os.getenv("RUN_SHARE_SECRET", "").strip()
        or os.getenv("INTERNAL_API_TOKEN", "").strip()
        or os.getenv("SECRET_KEY", "").strip()
    )


def _b64u_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64u_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("utf-8"))


def _make_run_share_token(run_id: str, expires_at_ts: int) -> str:
    secret = _share_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Share token secret is not configured")
    payload = {"run_id": run_id, "exp": int(expires_at_ts)}
    payload_b64 = _b64u_encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64u_encode(signature)}"


def _parse_run_share_token(token: str) -> dict:
    secret = _share_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Share token secret is not configured")
    try:
        payload_b64, signature_b64 = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=404, detail="Shared run not found")
    expected_sig = _b64u_encode(
        hmac.new(secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(signature_b64, expected_sig):
        raise HTTPException(status_code=404, detail="Shared run not found")
    try:
        payload = json.loads(_b64u_decode(payload_b64).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=404, detail="Shared run not found")
    run_id = str(payload.get("run_id") or "").strip()
    exp = int(payload.get("exp") or 0)
    if not run_id or exp <= int(time.time()):
        raise HTTPException(status_code=404, detail="Shared run expired")
    return {"run_id": run_id, "exp": exp}


def _parse_iso_datetime(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except Exception:
        return None


def _load_generation_run_items() -> list[dict]:
    base_dir = Path("storage") / "runs"
    if not base_dir.exists():
        return []
    items: list[dict] = []
    for run_dir in base_dir.iterdir():
        if not run_dir.is_dir():
            continue
        report_path = run_dir / "request_report.json"
        if not report_path.exists():
            continue
        try:
            payload = json.loads(report_path.read_text(encoding="utf-8"))
        except Exception:
            logger.warning("generation_runs_bad_report path=%s", report_path)
            continue
        payload["_run_id"] = run_dir.name
        payload["_run_dir"] = str(run_dir)
        payload["_created_at_dt"] = _parse_iso_datetime(payload.get("created_at", ""))
        items.append(payload)
    return items


def _load_run_payload_for_run_id(run_id: str) -> dict:
    run_dir = _safe_run_dir(run_id)
    report_path = run_dir / "request_report.json"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Run не знайдено")
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Не вдалося прочитати run")
    payload["_run_id"] = run_id
    payload["_run_dir"] = str(run_dir)
    payload["_created_at_dt"] = _parse_iso_datetime(payload.get("created_at", ""))
    return payload


def _resolve_shared_run_payload(token: str) -> dict:
    parsed = _parse_run_share_token(token)
    run_id = str(parsed.get("run_id") or "")
    return _load_run_payload_for_run_id(run_id)


def _run_item_for_response(payload: dict) -> GenerationRunListItem:
    quality = payload.get("quality") or {}
    output = payload.get("output") or {}
    runtime = payload.get("runtime") or {}
    refinement = payload.get("refinement") or {}
    run_dir = Path(str(payload.get("_run_dir") or ""))
    lesson_dump_path = run_dir / "lesson_dump.txt"
    output_path = str(output.get("path") or "")
    output_file = Path(output_path) if output_path else None
    can_build_pdf = _can_build_pdf_preview(run_dir, payload)
    return GenerationRunListItem(
        id=str(payload.get("_run_id") or ""),
        request_id=str(payload.get("request_id") or ""),
        created_at=str(payload.get("created_at") or ""),
        topic=str((payload.get("input") or {}).get("topic") or ""),
        subject=str((payload.get("input") or {}).get("subject") or ""),
        grade=str((payload.get("input") or {}).get("grade") or ""),
        status=str(payload.get("status") or ""),
        requirements=str((payload.get("input") or {}).get("requirements") or ""),
        refinement_used=bool(refinement.get("used")),
        queue_wait_ms=int(runtime.get("queue_wait_ms") or 0),
        generation_ms=int(runtime.get("duration_ms") or 0),
        metrics=GenerationRunMetrics(
            topic_coverage_ratio=float(quality.get("topic_coverage_ratio") or 0.0),
            practice_topic_coverage_ratio=float(quality.get("practice_topic_coverage_ratio") or 0.0),
            actualization_topic_coverage_ratio=float(quality.get("actualization_topic_coverage_ratio") or 0.0),
            generic_phrase_ratio=float(quality.get("generic_phrase_ratio") or 0.0),
            specificity_ratio=float(quality.get("specificity_ratio") or 0.0),
            structure_ratio=float(quality.get("structure_ratio") or 0.0),
            cue_phrase_ratio=float(quality.get("cue_phrase_ratio") or 0.0),
            dialogue_ratio=float(quality.get("dialogue_ratio") or 0.0),
            explanation_repetition_ratio=float(quality.get("explanation_repetition_ratio") or 0.0),
            needs_refinement=bool(quality.get("needs_refinement")),
            reasons=list(quality.get("reasons") or []),
        ),
        output_files=GenerationRunOutputFiles(
            output_name=str(output.get("name") or ""),
            output_path=output_path,
            output_size_bytes=int(output.get("size_bytes") or 0),
            lesson_dump_available=lesson_dump_path.exists(),
            docx_download_available=bool(output_file and output_file.exists() and output_file.suffix.lower() == ".docx"),
            pdf_preview_available=can_build_pdf,
            pdf_preview_reason=_pdf_preview_reason(run_dir, payload),
        ),
    )


def _collect_quality_reasons(window_items: list[dict]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for row in window_items:
        for reason in list(((row.get("quality") or {}).get("reasons") or [])):
            text = str(reason or "").strip()
            if text:
                counter[text] += 1
    return counter


def _collect_refinement_reasons(window_items: list[dict]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for row in window_items:
        for reason in list(((row.get("refinement") or {}).get("reasons") or [])):
            text = str(reason or "").strip()
            if text:
                counter[text] += 1
    return counter


def _collect_failure_reasons(window_items: list[dict]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for row in window_items:
        if str(row.get("status") or "").lower() == "success":
            continue
        error_message = str(((row.get("error") or {}).get("message") or "")).strip()
        if error_message:
            counter[error_message[:160]] += 1
    return counter


def _metric_averages(window_items: list[dict]) -> dict[str, float]:
    metric_keys = (
        "topic_coverage_ratio",
        "practice_topic_coverage_ratio",
        "specificity_ratio",
        "generic_phrase_ratio",
        "structure_ratio",
        "cue_phrase_ratio",
        "dialogue_ratio",
        "explanation_repetition_ratio",
    )
    if not window_items:
        return {key: 0.0 for key in metric_keys}
    result: dict[str, float] = {}
    for key in metric_keys:
        values: list[float] = []
        for row in window_items:
            quality = row.get("quality") or {}
            try:
                values.append(float(quality.get(key) or 0.0))
            except Exception:
                values.append(0.0)
        result[key] = round(sum(values) / max(1, len(values)), 4)
    return result


def _top_reason_items(counter: Counter[str], *, limit: int = 5) -> list[dict]:
    return [{"reason": reason, "count": int(count)} for reason, count in counter.most_common(limit)]


def _degradation_signals(recent10: dict[str, float], baseline50: dict[str, float]) -> list[dict]:
    higher_better = {"topic_coverage_ratio", "practice_topic_coverage_ratio", "specificity_ratio", "structure_ratio"}
    lower_better = {"generic_phrase_ratio", "cue_phrase_ratio", "dialogue_ratio", "explanation_repetition_ratio"}
    signals: list[dict] = []
    for metric in sorted(higher_better | lower_better):
        recent = float(recent10.get(metric) or 0.0)
        baseline = float(baseline50.get(metric) or 0.0)
        delta = round(recent - baseline, 4)
        if metric in higher_better:
            degraded = delta <= -0.08
        else:
            degraded = delta >= 0.08
        if not degraded:
            continue
        signals.append(
            {
                "metric": metric,
                "recent_avg": round(recent, 4),
                "baseline_avg": round(baseline, 4),
                "delta": delta,
                "direction": "down" if delta < 0 else "up",
                "severity": "critical" if abs(delta) >= 0.15 else "warning",
            }
        )
    return signals


@router.get("/history", response_model=List[HistoryItem])
async def get_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lessons = (
        db.query(UserLesson)
        .filter(UserLesson.user_email == user.email)
        .order_by(UserLesson.created_at.desc())
        .all()
    )
    return [
        HistoryItem(
            id=l.id,
            topic=l.topic,
            grade=l.grade,
            created_at=l.created_at,
            path=os.path.basename(l.file_path or ""),
        ).dict()
        for l in lessons
    ]


@router.get("/generate/queue-status", response_model=GenerationQueueStatus)
async def get_generation_queue_status(user: User = Depends(get_current_user)):
    snapshot = await generation_queue.snapshot()
    return GenerationQueueStatus(
        active_request_id=snapshot.get("active_request_id"),
        waiting_count=int(snapshot.get("waiting_count") or 0),
        total_in_system=int(snapshot.get("waiting_count") or 0) + (1 if snapshot.get("active_request_id") else 0),
    )


@router.get("/quality-trends", response_model=QualityTrendsResponse)
async def get_quality_trends(
    user: User = Depends(get_current_user),
):
    if user.role not in {"Owner", "Administrator", "Support"}:
        raise HTTPException(status_code=403, detail="Недостатньо прав для перегляду QA Dashboard")
    try:
        items = _load_generation_run_items()
    except Exception:
        logger.exception("quality_trends_load_failed user=%s", user.email)
        raise HTTPException(status_code=500, detail="Не вдалося зібрати quality trends")

    items.sort(key=lambda row: row.get("_created_at_dt") or datetime.min, reverse=True)
    window_sizes = [10, 20, 50]
    baseline50 = _metric_averages(items[:50])
    recent10 = _metric_averages(items[:10])
    windows: list[QualityWindowSummary] = []

    for size in window_sizes:
        window_items = items[:size]
        sample_size = len(window_items)
        success_runs = sum(1 for row in window_items if str(row.get("status") or "").lower() == "success")
        failed_runs = sample_size - success_runs
        refinement_used_count = sum(1 for row in window_items if bool((row.get("refinement") or {}).get("used")))
        averages = _metric_averages(window_items)
        windows.append(
            QualityWindowSummary(
                window_size=size,
                sample_size=sample_size,
                total_runs=sample_size,
                success_runs=success_runs,
                failed_runs=failed_runs,
                refinement_used_count=refinement_used_count,
                refinement_used_ratio=round(refinement_used_count / max(1, sample_size), 4),
                averages=QualityMetricAverages(**averages),
                top_quality_reasons=[QualityReasonCount(**item) for item in _top_reason_items(_collect_quality_reasons(window_items))],
                top_refinement_reasons=[QualityReasonCount(**item) for item in _top_reason_items(_collect_refinement_reasons(window_items))],
                top_failure_reasons=[QualityReasonCount(**item) for item in _top_reason_items(_collect_failure_reasons(window_items))],
                degradation_signals=[
                    QualityDegradationSignal(**item)
                    for item in (_degradation_signals(recent10, baseline50) if size == 10 else [])
                ],
            )
        )

    return QualityTrendsResponse(
        status="ok",
        timestamp=datetime.utcnow().isoformat(),
        total_available_runs=len(items),
        windows=windows,
    )


@router.get("/generation-runs", response_model=GenerationRunsResponse)
async def list_generation_runs(
    status: Literal["success", "failed"] | None = Query(default=None),
    subject: str | None = Query(default=None, min_length=1, max_length=80),
    grade: str | None = Query(default=None, min_length=1, max_length=40),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=200),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    page: int = Query(default=1, ge=1, le=100000),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    try:
        items = _load_generation_run_items()
    except Exception:
        logger.exception("generation_runs_load_failed user=%s", user.email)
        raise HTTPException(status_code=500, detail="Не вдалося завантажити історію запусків")

    is_admin = user.role in {"Owner", "Administrator"}
    filtered: list[dict] = []
    dt_from = _parse_iso_datetime(date_from or "")
    dt_to = _parse_iso_datetime(date_to or "")
    search_l = (search or "").strip().lower()
    subject_l = (subject or "").strip().lower()
    grade_l = (grade or "").strip().lower()

    for item in items:
        input_data = item.get("input") or {}
        item_user_email = str(input_data.get("user_email") or "")
        if not is_admin and item_user_email != user.email:
            continue
        item_status = str(item.get("status") or "")
        if status and item_status != status:
            continue
        item_subject = str(input_data.get("subject") or "")
        if subject_l and subject_l != item_subject.lower():
            continue
        item_grade = str(input_data.get("grade") or "")
        if grade_l and grade_l != item_grade.lower():
            continue

        created_dt = item.get("_created_at_dt")
        if dt_from and (not created_dt or created_dt < dt_from):
            continue
        if dt_to and (not created_dt or created_dt > dt_to):
            continue

        if search_l:
            hay = " ".join(
                [
                    str(item.get("request_id") or ""),
                    str(input_data.get("topic") or ""),
                    item_subject,
                    item_grade,
                    str(input_data.get("requirements") or ""),
                    str(item.get("status") or ""),
                ]
            ).lower()
            if search_l not in hay:
                continue

        filtered.append(item)

    filtered.sort(
        key=lambda row: row.get("_created_at_dt") or datetime.min,
        reverse=(sort_order == "desc"),
    )

    total_items = len(filtered)
    total_pages = max(1, (total_items + page_size - 1) // page_size)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = filtered[start:end]

    return GenerationRunsResponse(
        items=[_run_item_for_response(item) for item in page_items],
        pagination=GenerationRunsPagination(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        ),
    )


@router.get("/generation-runs/{run_id}", response_model=GenerationRunListItem)
async def get_generation_run(
    run_id: str,
    user: User = Depends(get_current_user),
):
    run_dir = _safe_run_dir(run_id)
    report_path = run_dir / "request_report.json"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Run не знайдено")
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Не вдалося прочитати run")

    item_user_email = str((payload.get("input") or {}).get("user_email") or "")
    if user.role not in {"Owner", "Administrator"} and item_user_email != user.email:
        raise HTTPException(status_code=403, detail="Цей run недоступний")
    payload["_run_id"] = run_id
    payload["_run_dir"] = str(run_dir)
    return _run_item_for_response(payload)


@router.get("/generation-runs/{run_id}/lesson-dump")
async def get_generation_run_lesson_dump(
    run_id: str,
    user: User = Depends(get_current_user),
):
    run_dir = _safe_run_dir(run_id)
    report_path = run_dir / "request_report.json"
    dump_path = run_dir / "lesson_dump.txt"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Run не знайдено")
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Не вдалося прочитати run")
    item_user_email = str((payload.get("input") or {}).get("user_email") or "")
    if user.role not in {"Owner", "Administrator"} and item_user_email != user.email:
        raise HTTPException(status_code=403, detail="Цей run недоступний")
    if dump_path.exists():
        text = dump_path.read_text(encoding="utf-8")
    else:
        text = _resolve_preview_text(run_dir, payload)
        if not text:
            raise HTTPException(status_code=404, detail="TXT preview недоступний для цього run")
        try:
            dump_path.write_text(text, encoding="utf-8")
        except Exception:
            logger.warning("lesson_dump_rebuild_failed run_id=%s", run_id)
    return PlainTextResponse(text)


@router.post("/generation-runs/{run_id}/share-link", response_model=GenerationRunShareResponse)
async def create_generation_run_share_link(
    run_id: str,
    ttl_hours: int = Query(default=72, ge=1, le=720),
    user: User = Depends(get_current_user),
):
    payload = _load_run_payload_for_run_id(run_id)
    item_user_email = str((payload.get("input") or {}).get("user_email") or "")
    if user.role not in {"Owner", "Administrator"} and item_user_email != user.email:
        raise HTTPException(status_code=403, detail="Цей run недоступний")
    expires_at_ts = int(time.time()) + int(ttl_hours) * 3600
    token = _make_run_share_token(run_id, expires_at_ts)
    share_path = f"/share/run/{token}"
    web_base = (
        os.getenv("PUBLIC_WEB_BASE_URL", "").strip()
        or os.getenv("WEBAPP_URL", "").strip()
        or os.getenv("NEXT_PUBLIC_WEBAPP_URL", "").strip()
    ).rstrip("/")
    share_url = f"{web_base}{share_path}" if web_base else None
    return GenerationRunShareResponse(
        token=token,
        run_id=run_id,
        share_path=share_path,
        share_url=share_url,
        expires_at=datetime.utcfromtimestamp(expires_at_ts).isoformat() + "Z",
    )


@router.get("/shared-runs/{token}", response_model=GenerationRunListItem)
async def get_shared_generation_run(token: str):
    payload = _resolve_shared_run_payload(token)
    return _run_item_for_response(payload)


@router.get("/shared-runs/{token}/lesson-dump")
async def get_shared_generation_run_lesson_dump(token: str):
    payload = _resolve_shared_run_payload(token)
    run_dir = Path(str(payload.get("_run_dir") or ""))
    dump_path = run_dir / "lesson_dump.txt"
    if dump_path.exists():
        return PlainTextResponse(dump_path.read_text(encoding="utf-8"))
    text = _resolve_preview_text(run_dir, payload)
    if not text:
        raise HTTPException(status_code=404, detail="TXT preview недоступний для цього run")
    try:
        dump_path.write_text(text, encoding="utf-8")
    except Exception:
        logger.warning("shared_lesson_dump_rebuild_failed run_id=%s", payload.get("_run_id"))
    return PlainTextResponse(text)


@router.get("/generation-runs/{run_id}/pdf-preview")
async def get_generation_run_pdf_preview(
    run_id: str,
    user: User = Depends(get_current_user),
):
    run_dir = _safe_run_dir(run_id)
    report_path = run_dir / "request_report.json"
    pdf_path = run_dir / "lesson_preview.pdf"
    dump_path = run_dir / "lesson_dump.txt"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Run не знайдено")
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Не вдалося прочитати run")
    item_user_email = str((payload.get("input") or {}).get("user_email") or "")
    if user.role not in {"Owner", "Administrator"} and item_user_email != user.email:
        raise HTTPException(status_code=403, detail="Цей run недоступний")
    if not pdf_path.exists():
        try:
            _rebuild_pdf_preview(run_dir, payload)
        except Exception:
            logger.exception("pdf_preview_rebuild_failed run_id=%s", run_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF preview недоступний для цього run")
    return FileResponse(
        str(pdf_path),
        filename=pdf_path.name,
        media_type="application/pdf",
        content_disposition_type="inline",
    )


@router.post("/generation-runs/{run_id}/pdf-preview/rebuild", response_model=PdfPreviewRebuildResponse)
async def rebuild_generation_run_pdf_preview(
    run_id: str,
    user: User = Depends(get_current_user),
):
    payload = _load_run_payload_for_run_id(run_id)
    item_user_email = str((payload.get("input") or {}).get("user_email") or "")
    if user.role not in {"Owner", "Administrator"} and item_user_email != user.email:
        raise HTTPException(status_code=403, detail="Run недоступний")

    run_dir = Path(str(payload.get("_run_dir") or ""))
    try:
        ready, reason, lesson_dump_available = _rebuild_pdf_preview(run_dir, payload)
    except Exception:
        logger.exception("pdf_preview_manual_rebuild_failed run_id=%s", run_id)
        return PdfPreviewRebuildResponse(
            run_id=run_id,
            status="failed",
            pdf_preview_available=False,
            pdf_preview_reason="build_failed",
            lesson_dump_available=(run_dir / "lesson_dump.txt").exists(),
            message="rebuild_failed",
        )

    if ready:
        return PdfPreviewRebuildResponse(
            run_id=run_id,
            status="ready",
            pdf_preview_available=True,
            pdf_preview_reason="",
            lesson_dump_available=lesson_dump_available,
            message="ready",
        )

    status = "unavailable" if reason in {"source_text_missing", "renderer_unavailable"} else "failed"
    return PdfPreviewRebuildResponse(
        run_id=run_id,
        status=status,  # type: ignore[arg-type]
        pdf_preview_available=False,
        pdf_preview_reason=reason,
        lesson_dump_available=lesson_dump_available,
        message=reason or "unavailable",
    )


@router.post("/generation-runs/pdf-preview/backfill", response_model=PdfPreviewBackfillResponse)
async def backfill_generation_run_pdf_preview(
    limit: int = Query(default=50, ge=1, le=500),
    user: User = Depends(get_current_user),
):
    if user.role not in {"Owner", "Administrator", "Support"}:
        raise HTTPException(status_code=403, detail="Недостатньо прав")

    scanned = 0
    rebuilt = 0
    skipped_ready = 0
    skipped_unavailable = 0
    failed = 0

    for payload in _load_generation_run_payloads():
        run_dir = Path(str(payload.get("_run_dir") or ""))
        if not run_dir.exists():
            continue
        scanned += 1
        if (run_dir / "lesson_preview.pdf").exists():
            skipped_ready += 1
        else:
            try:
                ready, reason, _ = _rebuild_pdf_preview(run_dir, payload)
                if ready:
                    rebuilt += 1
                elif reason in {"source_text_missing", "renderer_unavailable"}:
                    skipped_unavailable += 1
                else:
                    failed += 1
            except Exception:
                failed += 1
                logger.exception("pdf_preview_backfill_failed run_id=%s", payload.get("_run_id"))

        if scanned >= limit:
            break

    return PdfPreviewBackfillResponse(
        scanned=scanned,
        rebuilt=rebuilt,
        skipped_ready=skipped_ready,
        skipped_unavailable=skipped_unavailable,
        failed=failed,
    )


@router.get("/generation-runs/{run_id}/download")
async def download_generation_run_output(
    run_id: str,
    user: User = Depends(get_current_user),
):
    run_dir = _safe_run_dir(run_id)
    report_path = run_dir / "request_report.json"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Run не знайдено")
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Не вдалося прочитати run")
    item_user_email = str((payload.get("input") or {}).get("user_email") or "")
    if user.role not in {"Owner", "Administrator"} and item_user_email != user.email:
        raise HTTPException(status_code=403, detail="Цей run недоступний")
    output_path = str((payload.get("output") or {}).get("path") or "")
    if not output_path:
        raise HTTPException(status_code=404, detail="Файл результату відсутній")
    output_file = Path(output_path)
    if not output_file.exists():
        raise HTTPException(status_code=404, detail="Файл результату не знайдено")
    ext = output_file.suffix.lower()
    media_map = {
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".zip": "application/zip",
    }
    return FileResponse(
        str(output_file),
        filename=output_file.name,
        media_type=media_map.get(ext, "application/octet-stream"),
    )


@router.get("/shared-runs/{token}/pdf-preview")
async def get_shared_generation_run_pdf_preview(token: str):
    payload = _resolve_shared_run_payload(token)
    run_dir = Path(str(payload.get("_run_dir") or ""))
    pdf_path = run_dir / "lesson_preview.pdf"
    if not pdf_path.exists():
        try:
            _rebuild_pdf_preview(run_dir, payload)
        except Exception:
            logger.exception("shared_pdf_preview_rebuild_failed run_id=%s", payload.get("_run_id"))
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF preview недоступний для цього run")
    return FileResponse(
        str(pdf_path),
        filename=pdf_path.name,
        media_type="application/pdf",
        content_disposition_type="inline",
    )


@router.post("/shared-runs/{token}/pdf-preview/rebuild", response_model=PdfPreviewRebuildResponse)
async def rebuild_shared_generation_run_pdf_preview(token: str):
    payload = _resolve_shared_run_payload(token)
    run_id = str(payload.get("_run_id") or "")
    run_dir = Path(str(payload.get("_run_dir") or ""))
    try:
        ready, reason, lesson_dump_available = _rebuild_pdf_preview(run_dir, payload)
    except Exception:
        logger.exception("shared_pdf_preview_manual_rebuild_failed run_id=%s", run_id)
        return PdfPreviewRebuildResponse(
            run_id=run_id,
            status="failed",
            pdf_preview_available=False,
            pdf_preview_reason="build_failed",
            lesson_dump_available=(run_dir / "lesson_dump.txt").exists(),
            message="rebuild_failed",
        )

    if ready:
        return PdfPreviewRebuildResponse(
            run_id=run_id,
            status="ready",
            pdf_preview_available=True,
            pdf_preview_reason="",
            lesson_dump_available=lesson_dump_available,
            message="ready",
        )

    status = "unavailable" if reason in {"source_text_missing", "renderer_unavailable"} else "failed"
    return PdfPreviewRebuildResponse(
        run_id=run_id,
        status=status,  # type: ignore[arg-type]
        pdf_preview_available=False,
        pdf_preview_reason=reason,
        lesson_dump_available=lesson_dump_available,
        message=reason or "unavailable",
    )


@router.get("/shared-runs/{token}/download")
async def download_shared_generation_run_output(token: str):
    payload = _resolve_shared_run_payload(token)
    output_path = str((payload.get("output") or {}).get("path") or "")
    if not output_path:
        raise HTTPException(status_code=404, detail="Файл результату відсутній")
    output_file = Path(output_path)
    if not output_file.exists():
        raise HTTPException(status_code=404, detail="Файл результату не знайдено")
    ext = output_file.suffix.lower()
    media_map = {
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".zip": "application/zip",
    }
    return FileResponse(
        str(output_file),
        filename=output_file.name,
        media_type=media_map.get(ext, "application/octet-stream"),
    )


@router.post("/generate", dependencies=[Depends(csrf_protect)])
async def generate_lesson(
    topic: str = Form(..., min_length=2, max_length=120),
    grade: str = Form("Не вказано", max_length=40),
    subject: str = Form(..., max_length=50),
    requirements: str = Form("", max_length=2000),
    mode: str = Form("both"),
    extra_context: str = Form("", max_length=500),
    presentation: UploadFile = File(None),
    materials: list[UploadFile] | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if mode not in {"docx", "pptx", "both"}:
        raise HTTPException(status_code=400, detail="Невірний формат файлу")
    if mode != "docx":
        raise HTTPException(status_code=503, detail="Генерація презентацій та архівів тимчасово недоступна")
        
    # 1. Перевірка денного та місячного лімітів
    cost_map = {"docx": 1, "pptx": 3, "both": 5}
    cost = cost_map.get(mode, 1)
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_limit = MONTHLY_GENERATION_LIMITS.get(user.subscription, MONTHLY_GENERATION_LIMITS["Free"])
    monthly_used = (
        db.query(UserLesson)
        .filter(UserLesson.user_email == user.email, UserLesson.created_at >= month_start)
        .count()
    )
    if monthly_used + cost > monthly_limit:
        raise HTTPException(status_code=402, detail=f"Вичерпано місячний ліміт генерацій: {monthly_limit}.")
    if user.free_generations < cost:
        raise HTTPException(status_code=402, detail="Недостатньо кредитів на балансі")

    # 2. Логіка додаткового тексту
    context = ""
    if extra_context:
        context = extra_context

    # 3. Зберігаємо додаткові файли для аналізу
    source_file_paths: list[str] = []
    uploaded_materials: list[UploadFile] = [item for item in (materials or []) if item and item.filename]
    if presentation and presentation.filename and all(item.filename != presentation.filename for item in uploaded_materials):
        uploaded_materials.append(presentation)
    request_id = secrets.token_hex(6)
    started_at = time.perf_counter()
    diagnostics_payload: dict | None = None
    queue_wait_ms = 0
    queue_info: dict | None = None

    if len(uploaded_materials) > MAX_SOURCE_FILES:
        raise HTTPException(status_code=400, detail=f"Можна завантажити не більше {MAX_SOURCE_FILES} файлів для аналізу")

    total_size = 0
    for material in uploaded_materials:
        source_ext = Path(material.filename).suffix.lower()
        if source_ext not in ALLOWED_SOURCE_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Підтримуються лише файли PPTX, DOCX, PDF, TXT або MD")

        content = await material.read()
        file_size = len(content)
        total_size += file_size

        if file_size > MAX_SOURCE_FILE_SIZE:
            raise HTTPException(status_code=413, detail="Розмір одного файлу для аналізу не повинен перевищувати 15 МБ")
        if total_size > MAX_TOTAL_SOURCE_SIZE:
            raise HTTPException(status_code=413, detail="Загальний розмір файлів для аналізу не повинен перевищувати 30 МБ")

        safe_source_name = sanitize_filename(Path(material.filename).stem, default="source")
        source_file_path = f"storage/temp_{secrets.token_hex(4)}_{safe_source_name}{source_ext}"
        async with aiofiles.open(source_file_path, 'wb') as out_file:
            await out_file.write(content)
        source_file_paths.append(source_file_path)

    try:
        logger.info(
            "generation_debug request_started request_id=%s user=%s",
            request_id,
            user.email,
        )
        logger.info(
            "generate_request request_id=%s user=%s subject=%s grade=%s topic=%r mode=%s source_files=%s source_names=%s",
            request_id,
            user.email,
            subject,
            grade,
            topic,
            mode,
            len(uploaded_materials),
            [item.filename for item in uploaded_materials],
        )
        queue_snapshot = await generation_queue.snapshot()
        if int(queue_snapshot.get("waiting_count") or 0) >= GENERATION_QUEUE_MAX_WAITING:
            logger.warning(
                "generation_queue_overloaded request_id=%s user=%s waiting_count=%s max_waiting=%s",
                request_id,
                user.email,
                queue_snapshot.get("waiting_count"),
                GENERATION_QUEUE_MAX_WAITING,
            )
            raise HTTPException(status_code=503, detail=OVERLOAD_MESSAGE_UA)
        queue_started_at = time.perf_counter()
        logger.info(
            "generation_debug queue_wait_started request_id=%s user=%s",
            request_id,
            user.email,
        )
        try:
            queue_info = await asyncio.wait_for(
                generation_queue.acquire(request_id),
                timeout=GENERATION_QUEUE_WAIT_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError as queue_timeout_exc:
            queue_wait_ms = int((time.perf_counter() - queue_started_at) * 1000)
            logger.warning(
                "generation_queue_timeout request_id=%s user=%s wait_ms=%s timeout_sec=%s",
                request_id,
                user.email,
                queue_wait_ms,
                GENERATION_QUEUE_WAIT_TIMEOUT_SEC,
            )
            raise HTTPException(
                status_code=503,
                detail=OVERLOAD_MESSAGE_UA,
            ) from queue_timeout_exc
        queue_wait_ms = int((time.perf_counter() - queue_started_at) * 1000)
        logger.info(
            "generation_debug queue_wait_ended request_id=%s user=%s wait_ms=%s",
            request_id,
            user.email,
            queue_wait_ms,
        )
        logger.info(
            "generation_queue_acquired request_id=%s user=%s queued_ahead=%s wait_ms=%s",
            request_id,
            user.email,
            queue_info.get("queued_ahead"),
            queue_wait_ms,
        )

        # 4. Генерація через ШІ
        try:
            logger.info(
                "generation_debug generation_started request_id=%s user=%s timeout_sec=%s",
                request_id,
                user.email,
                GENERATION_TOTAL_TIMEOUT_SEC,
            )
            result = await asyncio.wait_for(
                generator.generate_lesson_files(
                    topic=topic,
                    grade=grade,
                    requirements=requirements,
                    mode=mode,
                    subject=subject,
                    context=context,
                    source_file=source_file_paths[0] if source_file_paths else None,
                    source_files=source_file_paths,
                    request_id=request_id,
                ),
                timeout=GENERATION_TOTAL_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError as generation_timeout_exc:
            logger.warning(
                "generation_debug generation_timeout_triggered request_id=%s user=%s timeout_sec=%s",
                request_id,
                user.email,
                GENERATION_TOTAL_TIMEOUT_SEC,
            )
            logger.warning(
                "generation_total_timeout request_id=%s user=%s timeout_sec=%s",
                request_id,
                user.email,
                GENERATION_TOTAL_TIMEOUT_SEC,
            )
            raise HTTPException(status_code=503, detail=TIMEOUT_MESSAGE_UA) from generation_timeout_exc
        diagnostics_payload = result.get("diagnostics")

        # 5. Списання балансу
        user.free_generations = max(0, (user.free_generations or 0) - cost)

        # 6. Збереження в базу
        new_lesson = UserLesson(
            user_email=user.email,
            topic=topic,
            grade=grade,
            file_path=result["path"]
        )
        db.add(new_lesson)
        db.commit()
        db.refresh(new_lesson)
        try:
            enqueue_telegram_notification(
                db,
                user=user,
                notification_type="generation_ready",
                title="Конспект готовий",
                body=f"Генерацію на тему «{topic}» завершено. Документ уже доступний у вашій історії.",
                action_url=f"{os.getenv('SITE_BASE_URL', 'https://metodist.co.ua').rstrip('/')}/?tab=history",
                lesson_id=new_lesson.id,
                meta={
                    "topic": topic,
                    "grade": grade,
                    "subject": subject,
                    "filename": result.get("name"),
                },
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("generate_notification_enqueue_failed request_id=%s user=%s", request_id, user.email)
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        try:
            _persist_generation_diagnostic(
                db,
                request_id=request_id,
                user_email=user.email,
                topic=topic,
                grade=grade,
                subject=subject,
                mode=mode,
                duration_ms=duration_ms,
                diagnostics=diagnostics_payload,
                status="success",
            )
        except Exception:
            db.rollback()
            logger.exception("generate_diagnostic_persist_failed request_id=%s user=%s", request_id, user.email)

        try:
            run_dir = _persist_generation_run_artifacts(
                request_id=request_id,
                status="success",
                topic=topic,
                grade=grade,
                subject=subject,
                mode=mode,
                requirements=requirements,
                context=context,
                user_email=user.email,
                diagnostics=diagnostics_payload,
                output_path=result.get("path") or "",
                output_name=result.get("name") or "",
                queue_wait_ms=queue_wait_ms,
                duration_ms=duration_ms,
                error_message="",
            )
            logger.info("generation_run_artifacts_saved request_id=%s run_dir=%s", request_id, run_dir)
        except Exception:
            logger.exception("generation_run_artifacts_failed request_id=%s user=%s", request_id, user.email)

        # 7. Повертаємо файл клієнту
        ext = os.path.splitext(result["path"])[1].lower()
        media_map = {
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".zip": "application/zip",
        }
        response = FileResponse(
            result["path"],
            filename=result["name"],
            media_type=media_map.get(ext, "application/octet-stream"),
        )
        response.headers["X-Credits-Spent"] = str(cost)
        response.headers["X-Credits-Remaining"] = str(user.free_generations)
        response.headers["X-Monthly-Limit"] = str(monthly_limit)
        response.headers["X-Monthly-Used"] = str(monthly_used + cost)
        response.headers["X-Monthly-Remaining"] = str(max(0, monthly_limit - monthly_used - cost))
        response.headers["X-Generation-Request-Id"] = request_id
        response.headers["X-Generation-Queue-Wait-Ms"] = str(queue_wait_ms)
        response.headers["X-Generation-Duration-Ms"] = str(duration_ms)
        response.headers["X-Generation-Strategy"] = str((diagnostics_payload or {}).get("final_strategy") or "")
        response.headers["X-Generation-Model-Calls"] = str(len((diagnostics_payload or {}).get("model_calls") or []))
        logger.info(
            "generate_success request_id=%s user=%s output=%s credits_spent=%s credits_remaining=%s duration_ms=%s queue_wait_ms=%s",
            request_id,
            user.email,
            result["name"],
            cost,
            user.free_generations,
            duration_ms,
            queue_wait_ms,
        )
        return response
        
    except HTTPException as http_exc:
        db.rollback()
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        diagnostics_payload = diagnostics_payload or {
            "source_files_count": len(uploaded_materials),
            "source_names": [item.filename for item in uploaded_materials],
            "template_docs_found": 0,
            "parsed_docs_count": 0,
        }
        try:
            _persist_generation_diagnostic(
                db,
                request_id=request_id,
                user_email=user.email,
                topic=topic,
                grade=grade,
                subject=subject,
                mode=mode,
                duration_ms=duration_ms,
                diagnostics=diagnostics_payload,
                status="failed",
                error_message=str(http_exc.detail),
            )
        except Exception:
            db.rollback()
            logger.exception("generate_diagnostic_persist_failed request_id=%s user=%s", request_id, user.email)
        try:
            run_dir = _persist_generation_run_artifacts(
                request_id=request_id,
                status="failed",
                topic=topic,
                grade=grade,
                subject=subject,
                mode=mode,
                requirements=requirements,
                context=context,
                user_email=user.email,
                diagnostics=diagnostics_payload,
                output_path="",
                output_name="",
                queue_wait_ms=queue_wait_ms,
                duration_ms=duration_ms,
                error_message=str(http_exc.detail),
            )
            logger.info("generation_run_artifacts_saved request_id=%s run_dir=%s", request_id, run_dir)
        except Exception:
            logger.exception("generation_run_artifacts_failed request_id=%s user=%s", request_id, user.email)
        logger.warning(
            "generate_controlled_failure request_id=%s user=%s status=%s detail=%r duration_ms=%s",
            request_id,
            user.email,
            http_exc.status_code,
            http_exc.detail,
            duration_ms,
        )
        if http_exc.status_code == 503:
            logger.warning(
                "generation_debug controlled_503_returned request_id=%s user=%s duration_ms=%s",
                request_id,
                user.email,
                duration_ms,
            )
        raise

    except Exception as e:
        db.rollback()
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        diagnostics_payload = diagnostics_payload or {
            "source_files_count": len(uploaded_materials),
            "source_names": [item.filename for item in uploaded_materials],
            "template_docs_found": 0,
            "parsed_docs_count": 0,
        }
        try:
            _persist_generation_diagnostic(
                db,
                request_id=request_id,
                user_email=user.email,
                topic=topic,
                grade=grade,
                subject=subject,
                mode=mode,
                duration_ms=duration_ms,
                diagnostics=diagnostics_payload,
                status="failed",
                error_message=str(e),
            )
        except Exception:
            db.rollback()
            logger.exception("generate_diagnostic_persist_failed request_id=%s user=%s", request_id, user.email)
        try:
            run_dir = _persist_generation_run_artifacts(
                request_id=request_id,
                status="failed",
                topic=topic,
                grade=grade,
                subject=subject,
                mode=mode,
                requirements=requirements,
                context=context,
                user_email=user.email,
                diagnostics=diagnostics_payload,
                output_path="",
                output_name="",
                queue_wait_ms=queue_wait_ms,
                duration_ms=duration_ms,
                error_message=str(e),
            )
            logger.info("generation_run_artifacts_saved request_id=%s run_dir=%s", request_id, run_dir)
        except Exception:
            logger.exception("generation_run_artifacts_failed request_id=%s user=%s", request_id, user.email)
        logger.exception(
            "generate_failure request_id=%s user=%s subject=%s grade=%s topic=%r duration_ms=%s",
            request_id,
            user.email,
            subject,
            grade,
            topic,
            duration_ms,
        )
        raise HTTPException(status_code=503, detail=OVERLOAD_MESSAGE_UA)
        
    finally:
        await generation_queue.release(request_id)
        # --- ОБОВ'ЯЗКОВО видаляємо тимчасовий файл презентації ---
        for source_file_path in source_file_paths:
            if source_file_path and os.path.exists(source_file_path):
                os.remove(source_file_path)


@router.get("/download/{lesson_id}")
async def download_lesson(
    lesson_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    lesson = db.query(UserLesson).filter(UserLesson.id == lesson_id).first()

    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не знайдено")

    if lesson.user_email != user.email and user.role not in ["Owner", "Administrator"]:
        raise HTTPException(status_code=403, detail="Це не ваш файл")

    if not os.path.exists(lesson.file_path):
        raise HTTPException(status_code=404, detail="Файл фізично видалено з сервера")

    ext = os.path.splitext(lesson.file_path)[1].lower()
    safe_topic = sanitize_filename(lesson.topic or "lesson", default="lesson")
    filename = f"{safe_topic}{ext or '.zip'}"
    return FileResponse(lesson.file_path, filename=filename)
