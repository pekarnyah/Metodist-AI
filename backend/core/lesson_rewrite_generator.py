from __future__ import annotations

import os
import re
import secrets
import time
import zipfile
from pathlib import Path
from typing import Any

from core.lesson_rewrite_prompts import (
    build_prompt_diagnostics,
    build_refinement_prompt,
    build_rewrite_prompt,
)
from core.simple_validator import assess_lesson_text, normalize_lesson_text
from core.security import sanitize_filename


class LessonRewriteGenerator:
    REQUIRED_SECTION_HEADINGS = (
        "Тема уроку",
        "Клас",
        "Предмет",
        "Тип уроку",
        "Мета уроку",
        "Очікувані результати",
        "Обладнання та матеріали",
        "Хід уроку",
        "Домашнє завдання",
    )
    LESSON_FLOW_HEADINGS = (
        "Організаційний момент",
        "Актуалізація опорних знань",
        "Мотивація навчальної діяльності",
        "Вивчення нового матеріалу",
        "Закріплення знань",
        "Підсумок уроку",
    )
    REFINEMENT_TRIGGER_REASONS = {
        "topic_coverage_low",
        "section_topic_coverage_low",
        "low_specificity",
        "generic_phrase_ratio_high",
        "goal_too_generic",
        "structure_missing",
        "cue_phrase_overuse",
        "dialogue_style_excess",
        "explanation_repetition",
        "topic_echo_excess",
        "placeholder_artifact_excess",
        "malformed_math_notation",
        "broken_fill_pattern",
        "generic_topic_tail_excess",
        "nush_structure_missing",
        "lesson_flow_after_homework",
        "weak_methodical_phrases",
        "weak_role_lines",
        "weak_homework",
    }
    REFINEMENT_META_MARKERS = (
        "чудово",
        "ось оновлений варіант",
        "оновлений варіант",
        "привіт, математики",
        "РїСЂРёРІС–С',",
        "як редактор",
        "поясню нижче",
        "коментар",
    )
    PLACEHOLDER_PATTERNS = (
        "(учитель називає сторінку)",
        "(учитель називає номер)",
    )
    MOJIBAKE_REPLACEMENTS = {}

    def __init__(self, legacy_generator: Any):
        self.legacy = legacy_generator
        self.loader = legacy_generator.loader

    @staticmethod
    def _clean(value: Any) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()

    @staticmethod
    def _match_text(value: str) -> str:
        return str(value or "").lower()

    @staticmethod
    def _topic_tokens(value: str) -> set[str]:
        tokens = re.findall(r"[A-Za-z\u0400-\u04FF0-9']+", LessonRewriteGenerator._match_text(value))
        return {token for token in tokens if len(token) >= 3}
    @staticmethod
    def _extract_topic_number_tokens(value: str) -> set[str]:
        text = LessonRewriteGenerator._match_text(value)
        numbers = set()
        explicit_target = LessonRewriteGenerator._extract_operation_target_number(text)
        if explicit_target:
            numbers.add(explicit_target)
        if "РЅР° 6" in text:
            numbers.add("6")
        if "РЅР° 7" in text:
            numbers.add("7")
        if "РЅР° 8" in text:
            numbers.add("8")
        if "РЅР° 9" in text:
            numbers.add("9")
        return numbers

    @staticmethod
    def _extract_operation_target_number(value: str) -> str:
        text = LessonRewriteGenerator._match_text(value)
        for pattern in (
            r"(?:множ|добут|ділен|частк)\w*[^.\n]{0,24}?\bна\s+(\d{1,2})\b",
            r"\bна\s+(\d{1,2})\b[^.\n]{0,24}?(?:множ|ділен)\w*",
        ):
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return ""

    @staticmethod
    def _topic_math_type(value: str) -> str:
        text = LessonRewriteGenerator._match_text(value)
        has_mult = any(token in text for token in ("РјРЅРѕР¶", "РґРѕР±СѓС'"))
        has_div = any(token in text for token in ("ділен", "дiлен", "частк"))
        has_table = "таблич" in text
        has_tasks = "задач" in text
        has_geometry = any(token in text for token in ("геометр", "периметр", "прямокут"))

        if has_geometry:
            return "geometry_perimeter"
        if has_tasks:
            return "word_tasks"
        if has_mult and has_div:
            return "table_mult_div" if has_table else "mult_div"
        if has_mult:
            return "table_mult" if has_table else "mult_only"
        if has_div:
            return "table_div" if has_table else "div_only"
        return "generic"

    @staticmethod
    def _is_narrow_topic(value: str) -> bool:
        text = LessonRewriteGenerator._match_text(value)
        if LessonRewriteGenerator._extract_operation_target_number(text):
            return True
        return any(
            phrase in text
            for phrase in ("периметр прямокутника", "одноцифров", "без переходу через розряд", "задачі на дві дії")
        )

    def _extract_reference_topic(self, parsed_doc: dict, path: Path) -> str:
        header_topic = ""
        for field in parsed_doc.get("header_fields") or []:
            label = self._clean(field.get("label")).lower()
            if label in {"тема", "тема уроку"}:
                header_topic = self._clean(field.get("value"))
                break
        return header_topic or self._clean(path.stem)

    def _score_reference_doc(self, topic: str, parsed_doc: dict, path: Path) -> dict:
        header_topic = self._extract_reference_topic(parsed_doc, path)
        doc_tokens = self._topic_tokens(header_topic)
        topic_tokens = self._topic_tokens(topic)
        overlap = len(topic_tokens & doc_tokens)

        topic_math_type = self._topic_math_type(topic)
        doc_math_type = self._topic_math_type(header_topic)
        type_match = topic_math_type == doc_math_type and topic_math_type != "generic"
        loose_type_match = (
            {topic_math_type, doc_math_type}
            <= {"table_mult", "mult_only", "table_mult_div", "mult_div", "table_div", "div_only"}
        )

        requested_numbers = self._extract_topic_number_tokens(topic)
        doc_numbers = self._extract_topic_number_tokens(header_topic)
        number_overlap = len(requested_numbers & doc_numbers)

        narrow_bonus = 0.0
        if self._is_narrow_topic(topic) and number_overlap:
            narrow_bonus += 10.0 + number_overlap * 2.0
        topic_clean = self._match_text(self._clean(topic))
        if topic_clean and topic_clean in self._match_text(header_topic):
            narrow_bonus += 10.0

        stage_count = len(parsed_doc.get("stages") or [])
        section_count = len(parsed_doc.get("sections") or [])
        score = overlap * 12.0 + stage_count * 0.5 + section_count * 0.3 + narrow_bonus
        if type_match:
            score += 24.0
        elif loose_type_match:
            score += 8.0
        try:
            size_mb = path.stat().st_size / (1024 * 1024)
        except Exception:
            size_mb = 0.0
        if size_mb > 2.0:
            score -= min(20.0, (size_mb - 2.0) * 6.0)

        return {
            "score": score,
            "path": path,
            "topic": header_topic,
            "topic_math_type": topic_math_type,
            "doc_math_type": doc_math_type,
            "overlap": overlap,
            "number_overlap": number_overlap,
            "type_match": type_match,
            "loose_type_match": loose_type_match,
        }

    def load_reference_lessons(self, *, subject: str, grade: str, topic: str, max_refs: int = 1) -> list[Path]:
        doc_paths = self.loader.load_docs_for_subject(subject, grade)
        scored = []
        for path in doc_paths:
            try:
                parsed = self.legacy.docx_parser.extract_structure(path) if hasattr(self.legacy, "docx_parser") else None
                if parsed is None:
                    from core.docx_parser import DocxParser

                    parsed = DocxParser.extract_structure(path)
            except Exception:
                continue
            scored.append(self._score_reference_doc(topic, parsed, path))
        scored.sort(key=lambda item: item["score"], reverse=True)

        if not scored:
            return doc_paths[:1]

        fallback_refs_raw = os.getenv("GENERATOR_REWRITE_FALLBACK_REFS", "3")
        try:
            fallback_refs = max(1, min(3, int(fallback_refs_raw)))
        except ValueError:
            fallback_refs = 3

        top = scored[0]
        selected = [top["path"]]

        second = scored[1] if len(scored) > 1 else None
        top_gap = top["score"] - (second["score"] if second else 0.0)
        strong_match = bool(
            top.get("type_match")
            or (top.get("number_overlap", 0) > 0 and top.get("overlap", 0) > 0)
            or top.get("score", 0.0) >= 30.0
        )

        if not strong_match and top_gap < 8.0:
            selected = [item["path"] for item in scored[:fallback_refs]]

        return selected

    def extract_reference_text(self, paths: list[Path], *, max_chars_per_doc: int = 6000) -> list[dict]:
        refs = []
        for path in paths:
            text = ""
            try:
                text = self.legacy._read_docx_text(path)
            except Exception:
                text = ""
            text = self._cleanup_model_text(text)
            if len(text) > max_chars_per_doc:
                text = text[:max_chars_per_doc].rstrip() + "\n...[trimmed]"
            refs.append({"title": path.name, "text": text})
        return refs

    @staticmethod
    def _text_to_document_model(*, topic: str, grade: str, subject: str, requirements: str, lesson_text: str) -> dict:
        paragraphs = [line.strip() for line in lesson_text.splitlines() if line.strip()]
        if not paragraphs:
            paragraphs = ["Конспект підготовлено за темою уроку.", "Проведіть урок за послідовністю завдань."]
        header_fields = [
            {"label": "Тема", "value": topic or "—", "style": "Metodist Body"},
            {"label": "Клас", "value": grade or "—", "style": "Metodist Body"},
            {"label": "Предмет", "value": subject or "—", "style": "Metodist Body"},
        ]

        return {
            "header_fields": header_fields,
            "sections": [
                {
                    "title": "",
                    "display_title": "",
                    "style": "Metodist Section",
                    "content_style": "Metodist Body",
                    "items": paragraphs,
                    "sample_item_styles": [],
                    "substeps": [],
                    "stages": [],
                    "children_order": [],
                }
            ],
        }

    @staticmethod
    def _text_to_slides(topic: str, grade: str, subject: str, lesson_text: str) -> list[dict]:
        lines = [line.strip() for line in lesson_text.splitlines() if line.strip()]
        slides = [{"type": "title", "title": topic or "Урок", "subtitle": " • ".join([part for part in [grade, subject] if part])}]
        chunk = []
        for line in lines:
            chunk.append(line)
            if len(chunk) >= 6:
                slides.append({"type": "bullets", "title": "Хід уроку", "emoji": "", "bullets": chunk[:]})
                chunk = []
        if chunk:
            slides.append({"type": "bullets", "title": "Хід уроку", "emoji": "", "bullets": chunk})
        return slides

    @classmethod
    def _has_refinement_meta(cls, text: str) -> bool:
        lower = str(text or "").lower()
        return any(marker in lower for marker in cls.REFINEMENT_META_MARKERS)

    @classmethod
    def _repair_common_mojibake(cls, text: str) -> str:
        result = str(text or "")
        for broken, fixed in cls.MOJIBAKE_REPLACEMENTS.items():
            result = result.replace(broken, fixed)
        return result

    @classmethod
    def _cleanup_model_text(cls, text: str) -> str:
        value = str(text or "").strip()
        value = re.sub(r"^\s*```(?:json|text)?\s*", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\s*```\s*$", "", value, flags=re.IGNORECASE)
        if value.lower().startswith("json\n"):
            value = value[5:]
        elif value.lower() == "json":
            value = ""
        value = cls._repair_common_mojibake(value)
        value = normalize_lesson_text(value)
        value = cls._postprocess_lesson_text(value)
        return value

    @staticmethod
    def _postprocess_lesson_text(text: str) -> str:
        lines = [line.rstrip() for line in str(text or "").splitlines()]
        cleaned = []
        for raw in lines:
            line = raw.strip()
            if not line:
                cleaned.append("")
                continue
            low = line.lower()

            if "[поточна дата]" in low or "[номер завдання]" in low:
                continue
            if "[...]" in low:
                continue
            if any(token in low for token in LessonRewriteGenerator.PLACEHOLDER_PATTERNS):
                continue
            if re.search(r"\[[^\]]*\.\.\.[^\]]*\]", low):
                continue
            if re.search(r"^\(\s*(?:\u0442\u0435\u043c\u0430|\u0442\u0435\u043c\u0438|\u0437\u0430\s+\u0442\u0435\u043c\u043e\u044e)\s+\u0443\u0440\u043e\u043a\u0443\s*\)$", low):
                continue
            line = re.sub(r"\s*[:=]?\s*\(\s*(?:\u0442\u0435\u043c\u0430|\u0442\u0435\u043c\u0438|\u0437\u0430\s+\u0442\u0435\u043c\u043e\u044e)\s+\u0443\u0440\u043e\u043a\u0443\s*\)\s*$", "", line, flags=re.IGNORECASE)
            line = line.strip()
            if not line:
                continue
            if low.startswith("побажання:"):
                continue
            if low.startswith("доброго дня, діти"):
                continue
            if low.startswith("сьогодні ми"):
                continue
            if low == "молодці" or low.startswith("молодці,"):
                continue
            cleaned.append(line)

        result = "\n".join(cleaned)
        result = normalize_lesson_text(result)
        return LessonRewriteGenerator._compact_lesson_text(result)

    @staticmethod
    def _compact_lesson_text(text: str) -> str:
        lines = [line.strip() for line in str(text or "").splitlines()]
        compact = []
        prev = ""
        seen = set()
        for line in lines:
            if not line:
                if compact and compact[-1] != "":
                    compact.append("")
                prev = line
                continue
            low = line.lower()
            # Keep headings even if repeated far apart, but collapse direct duplicates and repeated content lines.
            is_heading = any(
                low == heading.lower() or low.startswith(f"{heading.lower()}:")
                for heading in (
                    LessonRewriteGenerator.REQUIRED_SECTION_HEADINGS
                    + LessonRewriteGenerator.LESSON_FLOW_HEADINGS
                )
            )
            key = low
            if line == prev:
                continue
            if not is_heading and key in seen:
                continue
            compact.append(line)
            if not is_heading:
                seen.add(key)
            prev = line
        return normalize_lesson_text("\n".join(compact))

    @staticmethod
    def _cleanup_topic_echoes(text: str, topic: str) -> str:
        value = normalize_lesson_text(text)
        topic_clean = normalize_lesson_text(topic)
        if not value or not topic_clean or len(topic_clean) < 6:
            return value

        topic_escaped = re.escape(topic_clean)
        topic_lower = topic_clean.lower()
        generic_tail_re = re.compile(
            r"\s*\(\s*(?:тема|теми|за\s+темою)\s+уроку\s*\)\s*$",
            flags=re.IGNORECASE,
        )
        lines = value.splitlines()
        cleaned_lines = []
        mentions_seen = 0
        mention_limit = 3

        for raw in lines:
            line = raw.strip()
            if not line:
                cleaned_lines.append("")
                continue

            low = line.lower()
            if re.fullmatch(rf"[\(\[\{{\s:;,\-–—]*{topic_escaped}[\)\]\}}\s:;,\-–—]*", line, flags=re.IGNORECASE):
                continue

            # Remove typical suffix echoes: "(<topic>)", ": (<topic>)", "= (<topic>)", "... <topic>"
            line = re.sub(rf"\s*[:=]\s*\(\s*{topic_escaped}\s*\)\s*$", "", line, flags=re.IGNORECASE)
            line = re.sub(rf"\s*\(\s*{topic_escaped}\s*\)\s*$", "", line, flags=re.IGNORECASE)
            line = re.sub(rf"\s*[:=]\s*{topic_escaped}\s*$", "", line, flags=re.IGNORECASE)
            line = re.sub(rf"\s*[–—\-:;,\.]\s*{topic_escaped}\s*$", "", line, flags=re.IGNORECASE)
            line = generic_tail_re.sub("", line)
            line = re.sub(r"\s*[:=]\s*\(\s*(?:тема|теми|за\s+темою)\s+уроку\s*\)\s*$", "", line, flags=re.IGNORECASE)

            if not line.strip():
                continue

            # Keep only limited exact topic mentions in body; trim excessive exact echoes.
            exact_mentions_here = len(re.findall(topic_escaped, line, flags=re.IGNORECASE))
            if mentions_seen >= mention_limit and exact_mentions_here:
                line = re.sub(topic_escaped, "", line, flags=re.IGNORECASE)
                exact_mentions_here = 0
            elif mentions_seen + exact_mentions_here > mention_limit and exact_mentions_here:
                keep = max(0, mention_limit - mentions_seen)
                if keep <= 0:
                    line = re.sub(topic_escaped, "", line, flags=re.IGNORECASE)
                    exact_mentions_here = 0
            mentions_seen += exact_mentions_here

            line = re.sub(r"\s{2,}", " ", line).strip(" \t:;,-–—")
            if line and line.lower() != topic_lower:
                cleaned_lines.append(line)

        return normalize_lesson_text("\n".join(cleaned_lines))

    @staticmethod
    def _topic_focus_profile(topic: str) -> dict:
        low = str(topic or "").lower()
        number = LessonRewriteGenerator._extract_operation_target_number(low)
        has_mult = "РјРЅРѕР¶" in low
        has_div = "ділен" in low
        if "периметр" in low and "прямокут" in low:
            return {
                "markers": ["периметр", "прямокут", "сторона", "довжина"],
                "anchor": "периметр прямокутника",
                "broad_sections": True,
            }
        if "множ" in low and "ділен" in low and number:
            return {
                "markers": [number, "множ", "ділен"],
                "anchor": f"множення і ділення на {number}",
            }
        if "РјРЅРѕР¶" in low and number:
            return {
                "markers": [number, "РјРЅРѕР¶"],
                "anchor": f"множення на {number}",
            }
        if "ділен" in low and number:
            return {
                "markers": [number, "ділен"],
                "anchor": f"ділення на {number}",
            }
        if has_mult and has_div:
            return {
                "markers": ["множ", "ділен", "одноцифров", "межах"],
                "anchor": "теми уроку",
            }
        if has_mult:
            return {
                "markers": ["множ", "одноцифров", "межах", "число"],
                "anchor": "теми уроку",
            }
        if has_div:
            return {
                "markers": ["ділен", "одноцифров", "межах", "число"],
                "anchor": "теми уроку",
            }
        if "задач" in low and "дв" in low and "ді" in low:
            return {
                "markers": ["задач", "дві дії"],
                "anchor": "задача на дві дії",
            }
        tokens = [token for token in re.findall(r"[A-Za-z\u0400-\u04FF0-9']+", low) if len(token) >= 4]
        return {"markers": tokens[:4], "anchor": str(topic or "").strip()}

    @classmethod
    def _enforce_topic_focus_sections(cls, text: str, topic: str) -> str:
        value = normalize_lesson_text(text)
        if not value:
            return value
        profile = cls._topic_focus_profile(topic)
        markers = [marker.lower() for marker in (profile.get("markers") or []) if marker]
        anchor = str(profile.get("anchor") or topic or "").strip()
        broad_sections = bool(profile.get("broad_sections"))
        if not markers or not anchor:
            return value

        target_sections = {
            "актуалізація знань",
            "актуалізація опорних знань",
            "закріплення",
            "закріплення знань",
        }
        if broad_sections:
            target_sections.update({heading.lower() for heading in cls.REQUIRED_SECTION_HEADINGS + cls.LESSON_FLOW_HEADINGS})
        headings = {heading.lower() for heading in cls.REQUIRED_SECTION_HEADINGS + cls.LESSON_FLOW_HEADINGS}
        lines = value.splitlines()
        current_section = ""
        output = []
        for raw in lines:
            line = raw.strip()
            lower = line.lower()
            matched_heading = next((heading for heading in headings if lower == heading or lower.startswith(f"{heading}:")), "")
            if matched_heading:
                current_section = matched_heading
                output.append(line)
                continue
            if not line:
                output.append(line)
                continue
            if current_section in target_sections:
                if not any(marker in lower for marker in markers):
                    output.append(line)
                    continue
            output.append(line)
        return normalize_lesson_text("\n".join(output))

    @classmethod
    def _ensure_required_sections(cls, text: str) -> str:
        value = normalize_lesson_text(text)
        lower = value.lower()
        missing = [heading for heading in cls.REQUIRED_SECTION_HEADINGS if heading.lower() not in lower]
        if not missing:
            return value

        fallback_content = {
            "Тема уроку": "Уточнити тему уроку відповідно до запиту.",
            "Клас": "Уточнити клас відповідно до запиту.",
            "Предмет": "Уточнити предмет відповідно до запиту.",
            "Тип уроку": "Урок вивчення і первинного закріплення нового матеріалу.",
            "Мета уроку": "Навчальна: опрацювати зміст теми на конкретних завданнях. Розвивальна: тренувати пояснення способу дії. Виховна: підтримувати уважність і взаємодопомогу під час роботи.",
            "Очікувані результати": "Учні пояснюють ключову ідею теми, виконують завдання за зразком і перевіряють відповідь.",
            "Обладнання та матеріали": "Підручник, картки із завданнями за темою, демонстраційний матеріал.",
            "Хід уроку": "",
            "Домашнє завдання": "Виконати 2–3 завдання за темою уроку.",
        }

        blocks = [value] if value else []
        for heading in cls.REQUIRED_SECTION_HEADINGS:
            if heading not in missing:
                continue
            content = fallback_content.get(heading, "Уточнити зміст блоку відповідно до теми уроку.")
            blocks.append(f"{heading}\n{content}")
            if heading == "Хід уроку":
                for stage_heading in cls.LESSON_FLOW_HEADINGS:
                    blocks.append(
                        f"{stage_heading}\n"
                        "Учитель: організовує коротку дію за темою.\n"
                        "Учні: виконують дію та озвучують відповідь.\n"
                        "Завдання/вправа: виконати конкретне завдання за темою уроку."
                    )
        return normalize_lesson_text("\n\n".join(part for part in blocks if part))

    @classmethod
    def _refinement_is_worse(cls, before: dict, after: dict) -> bool:
        before = before if isinstance(before, dict) else {}
        after = after if isinstance(after, dict) else {}
        generic_before = float(before.get("generic_phrase_ratio", 0.0) or 0.0)
        generic_after = float(after.get("generic_phrase_ratio", 0.0) or 0.0)
        spec_before = float(before.get("specificity_ratio", 0.0) or 0.0)
        spec_after = float(after.get("specificity_ratio", 0.0) or 0.0)
        topic_before = float(before.get("topic_coverage_ratio", 0.0) or 0.0)
        topic_after = float(after.get("topic_coverage_ratio", 0.0) or 0.0)
        nush_before_bad = bool(before.get("nush_missing_required")) or bool(before.get("lesson_flow_after_homework"))
        nush_after_bad = bool(after.get("nush_missing_required")) or bool(after.get("lesson_flow_after_homework"))
        artifact_before = (
            float(before.get("placeholder_artifact_ratio", 0.0) or 0.0)
            + float(before.get("malformed_math_ratio", 0.0) or 0.0)
            + float(before.get("broken_fill_ratio", 0.0) or 0.0)
            + float(before.get("generic_topic_tail_ratio", 0.0) or 0.0)
        )
        artifact_after = (
            float(after.get("placeholder_artifact_ratio", 0.0) or 0.0)
            + float(after.get("malformed_math_ratio", 0.0) or 0.0)
            + float(after.get("broken_fill_ratio", 0.0) or 0.0)
            + float(after.get("generic_topic_tail_ratio", 0.0) or 0.0)
        )
        if generic_after > generic_before + 0.01:
            return True
        if spec_after < spec_before - 0.01:
            return True
        if artifact_after > artifact_before + 0.01:
            return True
        if (
            before.get("topic_coverage_applicable")
            and topic_after < topic_before - 0.01
        ):
            return True
        if after.get("line_count", 0) < max(6, int(before.get("line_count", 0) * 0.7)):
            return True
        improved = (
            generic_after < generic_before - 0.01
            or spec_after > spec_before + 0.01
            or artifact_after < artifact_before - 0.01
            or (before.get("topic_coverage_applicable") and topic_after > topic_before + 0.01)
            or (nush_before_bad and not nush_after_bad)
        )
        if not improved and before.get("needs_refinement") and after.get("needs_refinement"):
            return True
        return False

    async def _call_text_model(
        self,
        *,
        call_name: str,
        system_instruction: str,
        prompt: str,
        runtime_trace: dict,
        timeout_sec: float,
        temperature: float = 0.35,
    ) -> str:
        response = await self.legacy._execute_model_call(
            call_name=call_name,
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=temperature,
            runtime_trace=runtime_trace,
            timeout_sec=timeout_sec,
            response_mime_type="text/plain",
        )
        return str(getattr(response, "text", "") if response else "").strip()

    async def generate_lesson_files(
        self,
        *,
        topic: str,
        grade: str,
        requirements: str,
        mode: str,
        subject: str,
        context: str = "",
        source_file: str | None = None,
        source_files: list[str] | None = None,
        request_id: str | None = None,
    ) -> dict:
        request_id = request_id or secrets.token_hex(6)
        started = time.perf_counter()
        diagnostics = {
            "request_id": request_id,
            "pipeline_version": "rewrite_v1",
            "status": "started",
            "references_count": 0,
            "references": [],
            "model_calls_total": 0,
            "refinement_used": False,
            "validation": {},
            "output_name": None,
            "output_path": None,
            "output_ext": None,
            "duration_ms": None,
            "model_calls": [],
        }
        runtime_trace = {"request_id": request_id, "model_calls": diagnostics["model_calls"]}

        refs_paths = self.load_reference_lessons(subject=subject, grade=grade, topic=topic, max_refs=1)
        refs_text = self.extract_reference_text(refs_paths)
        diagnostics["references_count"] = len(refs_text)
        diagnostics["references"] = [item["title"] for item in refs_text]

        source_context_parts = [self._clean(context)]
        normalized_source_files = [item for item in (source_files or ([source_file] if source_file else [])) if item]
        if normalized_source_files:
            bundle = self.legacy._build_sources_bundle(normalized_source_files, blueprint=None)
            bundle_context = self._clean(bundle.get("context"))
            if bundle_context:
                source_context_parts.append(bundle_context)
        source_context = "\n\n".join(part for part in source_context_parts if part)

        sys_instr, prompt = build_rewrite_prompt(
            topic=topic,
            grade=grade,
            subject=subject,
            requirements=requirements,
            context=source_context,
            references=refs_text,
        )
        diagnostics["prompt"] = build_prompt_diagnostics(references=refs_text, prompt=prompt)

        timeout_1 = float(os.getenv("GENERATOR_REWRITE_TIMEOUT_SEC", "50"))
        lesson_text = await self._call_text_model(
            call_name="rewrite_generate",
            system_instruction=sys_instr,
            prompt=prompt,
            runtime_trace=runtime_trace,
            timeout_sec=timeout_1,
            temperature=0.4,
        )
        lesson_text = self._cleanup_model_text(lesson_text)
        lesson_text = self._enforce_topic_focus_sections(lesson_text, topic)
        lesson_text = self._cleanup_topic_echoes(lesson_text, topic)
        validation = assess_lesson_text(lesson_text, topic=topic, subject=subject)
        diagnostics["validation"] = validation

        allow_refinement = os.getenv("GENERATOR_REWRITE_REFINE", "1").strip().lower() in {"1", "true", "yes", "on"}
        refinement_reasons = set(validation.get("reasons") or [])
        should_refine = bool(refinement_reasons & self.REFINEMENT_TRIGGER_REASONS)
        diagnostics["refinement_reasons"] = sorted(refinement_reasons)
        diagnostics["refinement_should_run"] = should_refine
        if allow_refinement and should_refine:
            original_text = lesson_text
            original_validation = validation
            r_sys, r_prompt = build_refinement_prompt(
                draft_text=lesson_text,
                requirements=requirements,
                topic=topic,
                subject=subject,
                grade=grade,
                refinement_reasons=sorted(refinement_reasons),
                weak_role_lines=validation.get("weak_role_lines") or [],
            )
            timeout_2 = float(os.getenv("GENERATOR_REWRITE_REFINE_TIMEOUT_SEC", "35"))
            refined = await self._call_text_model(
                call_name="rewrite_refine",
                system_instruction=r_sys,
                prompt=r_prompt,
                runtime_trace=runtime_trace,
                timeout_sec=timeout_2,
                temperature=0.25,
            )
            refined = self._cleanup_model_text(refined)
            refined = self._enforce_topic_focus_sections(refined, topic)
            refined = self._cleanup_topic_echoes(refined, topic)
            if refined:
                refined_validation = assess_lesson_text(refined, topic=topic, subject=subject)
                meta_detected = self._has_refinement_meta(refined)
                worse_quality = self._refinement_is_worse(original_validation, refined_validation)
                topic_not_improved = (
                    "topic_coverage_low" in refinement_reasons
                    and float(refined_validation.get("topic_coverage_ratio", 0.0) or 0.0)
                    <= float(original_validation.get("topic_coverage_ratio", 0.0) or 0.0)
                )
                if meta_detected or worse_quality or topic_not_improved:
                    lesson_text = original_text
                    diagnostics["refinement_used"] = False
                    diagnostics["refinement_reverted"] = True
                    diagnostics["refinement_revert_reason"] = (
                        "meta_phrases_detected"
                        if meta_detected
                        else ("topic_coverage_not_improved" if topic_not_improved else "quality_worse")
                    )
                    diagnostics["validation_after_refinement"] = original_validation
                else:
                    lesson_text = refined
                    diagnostics["refinement_used"] = True
                    diagnostics["refinement_reverted"] = False
                    diagnostics["validation_after_refinement"] = refined_validation

        final_validation = assess_lesson_text(lesson_text, topic=topic, subject=subject)
        structural_fallback_needed = bool(
            final_validation.get("nush_missing_required")
            or final_validation.get("lesson_flow_after_homework")
            or "structure_missing" in set(final_validation.get("reasons") or [])
        )
        if structural_fallback_needed:
            diagnostics["validation_final_before_fallback"] = final_validation
            lesson_text = self._ensure_required_sections(lesson_text)
            diagnostics["fallback_sections_applied"] = True
            diagnostics["validation_after_fallback"] = assess_lesson_text(lesson_text, topic=topic, subject=subject)
        else:
            diagnostics["fallback_sections_applied"] = False

        doc_model = self._text_to_document_model(
            topic=topic,
            grade=grade,
            subject=subject,
            requirements=requirements,
            lesson_text=lesson_text,
        )

        safe_grade = sanitize_filename(str(grade) or "grade", default="grade")
        file_id = f"{secrets.token_hex(4)}_{safe_grade}"
        safe_topic = sanitize_filename(str(topic) or "lesson", default="lesson")

        outputs = []
        if mode in {"docx", "both"}:
            outputs.append(await self.legacy.create_docx(doc_model, f"Lesson_{file_id}", doc_paths=refs_paths, template_structure=None))
        if mode in {"pptx", "both"}:
            slides = self._text_to_slides(topic=topic, grade=grade, subject=subject, lesson_text=lesson_text)
            outputs.append(await self.legacy.create_pptx(slides, f"Presentation_{file_id}"))

        if mode in {"docx", "both"} and outputs:
            try:
                initial_docx_size = Path(outputs[0]).stat().st_size
            except Exception:
                initial_docx_size = 0
            diagnostics["output_docx_size_bytes_initial"] = initial_docx_size
            if initial_docx_size > 500 * 1024:
                diagnostics["oversize_docx_detected"] = True
                diagnostics["oversize_docx_action"] = "rerender_without_template"
                compact_docx = await self.legacy.create_docx(
                    doc_model,
                    f"Lesson_{file_id}_compact",
                    doc_paths=[],
                    template_structure=None,
                )
                try:
                    compact_size = Path(compact_docx).stat().st_size
                except Exception:
                    compact_size = 0
                diagnostics["output_docx_size_bytes_compact"] = compact_size
                if compact_size and (not initial_docx_size or compact_size < initial_docx_size):
                    outputs[0] = compact_docx
                    diagnostics["oversize_docx_compact_applied"] = True
                else:
                    diagnostics["oversize_docx_compact_applied"] = False

        diagnostics["model_calls_total"] = len(diagnostics["model_calls"])
        diagnostics["status"] = "success"
        diagnostics["duration_ms"] = int((time.perf_counter() - started) * 1000)

        if mode == "both":
            zip_path = f"storage/Full_Package_{file_id}.zip"
            with zipfile.ZipFile(zip_path, "w") as archive:
                for path in outputs:
                    archive.write(path, os.path.basename(path))
            diagnostics["output_name"] = f"Lesson_Pack_{safe_topic}.zip"
            diagnostics["output_path"] = zip_path
            diagnostics["output_ext"] = ".zip"
            return {"path": zip_path, "name": diagnostics["output_name"], "diagnostics": diagnostics}

        output_path = outputs[0]
        try:
            output_size = Path(output_path).stat().st_size
        except Exception:
            output_size = 0
        diagnostics["output_size_bytes"] = output_size
        diagnostics["output_oversize"] = bool(output_size > 500 * 1024)
        diagnostics["output_name"] = os.path.basename(output_path)
        diagnostics["output_path"] = output_path
        diagnostics["output_ext"] = os.path.splitext(output_path)[1].lower()
        return {"path": output_path, "name": diagnostics["output_name"], "diagnostics": diagnostics}
