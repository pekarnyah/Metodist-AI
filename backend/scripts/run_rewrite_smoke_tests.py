from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph


def _load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _safe_name(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in (value or "case"))
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned.strip("_") or "case"


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


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


async def _run_case(
    *,
    generator: Any,
    run_dir: Path,
    idx: int,
    topic: str,
    grade: str,
    subject: str,
    requirements: str,
) -> dict[str, Any]:
    case_slug = f"{idx:02d}_{_safe_name(topic)}"
    case_dir = run_dir / case_slug
    case_dir.mkdir(parents=True, exist_ok=True)

    summary: dict[str, Any] = {
        "case": topic,
        "status": "error",
        "docx_path": "",
        "txt_path": "",
        "diagnostics_path": str(case_dir / "diagnostics.json"),
        "refinement_used": None,
        "text_length": 0,
        "output_size_bytes": 0,
        "error": "",
    }

    try:
        result = await generator.generate_lesson_files(
            topic=topic,
            grade=grade,
            requirements=requirements,
            mode="docx",
            subject=subject,
            context="Smoke test run for unified generator v2.5 quality checks.",
            source_file=None,
            source_files=None,
            request_id=f"smoke_{idx:02d}",
        )
        diagnostics = result.get("diagnostics") if isinstance(result, dict) else {}
        output_path = Path(str(result.get("path") or "")).resolve()
        if not output_path.exists():
            raise FileNotFoundError(f"Output docx not found: {output_path}")

        copied_docx = case_dir / output_path.name
        shutil.copy2(output_path, copied_docx)

        dump_text = _extract_docx_text(copied_docx)
        txt_path = case_dir / "lesson_dump.txt"
        txt_path.write_text(dump_text, encoding="utf-8")

        _write_json(case_dir / "diagnostics.json", diagnostics if isinstance(diagnostics, dict) else {})

        summary["status"] = "success"
        summary["docx_path"] = str(copied_docx)
        summary["txt_path"] = str(txt_path)
        summary["refinement_used"] = bool((diagnostics or {}).get("refinement_used"))
        summary["text_length"] = len(dump_text)
        summary["output_size_bytes"] = copied_docx.stat().st_size
    except Exception as exc:
        error_payload = {
            "case": topic,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        _write_json(case_dir / "diagnostics.json", error_payload)
        summary["error"] = str(exc)

    return summary


async def _amain() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    backend_dir = repo_root / "backend"
    os.chdir(backend_dir)
    sys.path.insert(0, str(backend_dir))

    _load_env_file(backend_dir / ".env")
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("ERROR: GEMINI_API_KEY is not set (env or backend/.env).")
        return 2

    from core.generator import LessonGenerator

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = backend_dir / "storage" / "rewrite_smoke_tests" / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)

    cases = [
        "Множення на 6",
        "Ділення на 6",
        "Множення і ділення на 8",
        "Задачі на дві дії",
        "Периметр прямокутника",
    ]
    cases_filter = [item.strip() for item in os.getenv("GENERATOR_SMOKE_CASES", "").split("|") if item.strip()]
    if cases_filter:
        cases = cases_filter
    case_delay_sec = max(0.0, _env_float("GENERATOR_SMOKE_CASE_DELAY_SEC", 0.0))
    grade = "3 клас"
    subject = "Математика"
    requirements = (
        "Пишіть природно, без шаблонних повторів. "
        "Усі завдання мають бути жорстко прив'язані до теми."
    )

    generator = LessonGenerator(api_key=api_key)

    summaries: list[dict[str, Any]] = []
    for idx, topic in enumerate(cases, start=1):
        print(f"[{idx}/{len(cases)}] Running: {topic}")
        summary = await _run_case(
            generator=generator,
            run_dir=run_dir,
            idx=idx,
            topic=topic,
            grade=grade,
            subject=subject,
            requirements=requirements,
        )
        summaries.append(summary)
        print(f"  -> {summary['status']}")
        if case_delay_sec and idx < len(cases):
            print(f"  waiting {case_delay_sec:.1f}s to avoid API rate limits...")
            await asyncio.sleep(case_delay_sec)

    _write_json(run_dir / "summary.json", {"run_dir": str(run_dir), "cases": summaries})

    print("\n=== generator v2.5 smoke summary ===")
    print(f"Run directory: {run_dir}")
    for item in summaries:
        print(f"- case: {item['case']}")
        print(f"  status: {item['status']}")
        print(f"  output docx: {item['docx_path'] or '-'}")
        print(f"  diagnostics: {item['diagnostics_path']}")
        print(f"  refinement used: {item['refinement_used']}")
        print(f"  text length: {item['text_length']}")
        print(f"  output size: {item['output_size_bytes']} bytes")
        if item["error"]:
            print(f"  error: {item['error']}")

    has_errors = any(item["status"] != "success" for item in summaries)
    return 1 if has_errors else 0


def main() -> None:
    code = asyncio.run(_amain())
    raise SystemExit(code)


if __name__ == "__main__":
    main()
