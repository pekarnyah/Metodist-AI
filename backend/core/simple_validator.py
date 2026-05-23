import re


GENERIC_PHRASES = (
    "сьогодні на уроці",
    "будьте уважні",
    "будьте уважними",
    "посміхніться",
    "на нас чекають відкриття",
    "молодці",
)

LOW_SPECIFICITY_PHRASES = (
    "виконайте завдання",
    "виконати завдання",
    "виконати вправу",
    "попрацюйте в парах",
    "розвивати мислення",
    "виховувати відповідальність",
    "виховувати інтерес",
    "формувати вміння",
    "ознайомити учнів",
    "закріпити знання",
    "обговорити тему",
    "провести бесіду",
)

GOAL_GENERIC_PHRASES = (
    "розвивати мислення",
    "виховувати",
    "виховувати інтерес",
    "ознайомити",
    "формувати вміння",
    "формувати навички",
    "закріпити знання",
)

CONCRETENESS_MARKERS = (
    "приклад",
    "вираз",
    "задач",
    "числ",
    "обчисл",
    "рівн",
    "слово",
    "словосполуч",
    "реченн",
    "текст",
    "геро",
    "запитан",
    "прочит",
    "склад",
    "поясн",
    "порівн",
    "картк",
    "дослід",
    "спостереж",
    "практич",
    "комп'ютер",
    "алгоритм",
    "крок",
)

ROLE_LINE_PREFIXES = (
    "завдання/вправа:",
    "завдання:",
    "вправа:",
    "учитель:",
    "вчитель:",
    "учні:",
)

WEAK_ROLE_PHRASES = (
    "виконати завдання",
    "виконати вправу",
    "обговорити",
    "провести бесіду",
    "дати відповідь",
    "працюють із завданням",
)

WEAK_HOMEWORK_PHRASES = (
    "виконати вправу",
    "виконати завдання",
    "опрацювати матеріал",
    "повторити тему",
    "завдання за підручником",
    "завдання з підручника",
)

MATH_TOKENS = (
    "периметр",
    "прямокут",
    "множ",
    "ділен",
    "задач",
    "обчисл",
    "приклад",
)

REQUIRED_HEADINGS = (
    "тема уроку",
    "клас",
    "предмет",
    "тип уроку",
    "мета уроку",
    "очікувані результати",
    "обладнання та матеріали",
    "хід уроку",
    "домашнє завдання",
)

LESSON_FLOW_HEADINGS = (
    "організаційний момент",
    "актуалізація опорних знань",
    "мотивація навчальної діяльності",
    "вивчення нового матеріалу",
    "закріплення знань",
    "підсумок уроку",
)

CUE_PHRASES = (
    "пригадайте",
    "спробуйте",
    "що помітили",
    "давайте",
    "що ми можемо",
    "як ви думаєте",
)

DIALOGUE_MARKERS = ()


def normalize_lesson_text(text: str) -> str:
    raw = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw.split("\n")]
    compact = []
    blank = False
    for line in lines:
        if not line:
            if not blank:
                compact.append("")
            blank = True
            continue
        compact.append(line)
        blank = False
    return "\n".join(compact).strip()


def _line_has_specific_content(line: str) -> bool:
    lower = line.lower()
    if re.search(r"\d", lower):
        return True
    if "?" in line:
        return True
    if re.search(r"\b\d+\s*[\+\-\*xх×:\/]\s*\d+\b", lower):
        return True
    if any(token in lower for token in MATH_TOKENS):
        return True
    if any(token in lower for token in CONCRETENESS_MARKERS):
        return True
    return False


def _is_role_line(line: str) -> bool:
    lower = str(line or "").strip().lower()
    return any(lower.startswith(prefix) for prefix in ROLE_LINE_PREFIXES)


def _role_line_has_specific_content(line: str) -> bool:
    lower = str(line or "").lower()
    if "?" in line:
        return True
    if re.search(r"\d+\s*(?:[:/+\-*x×])\s*\d+", lower):
        return True
    if len(re.findall(r"\d+", lower)) >= 2:
        return True
    if any(token in lower for token in CONCRETENESS_MARKERS):
        return True
    return False


def _weak_role_line_signal(lines: list[str]) -> tuple[float, dict[str, int], list[str], bool]:
    if not lines:
        return 0.0, {}, [], False
    hits = {phrase: 0 for phrase in WEAK_ROLE_PHRASES}
    weak_lines: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line or not _is_role_line(line):
            continue
        lower = line.lower()
        matched = [phrase for phrase in WEAK_ROLE_PHRASES if phrase in lower]
        if not matched:
            continue
        for phrase in matched:
            hits[phrase] += lower.count(phrase)
        if not _role_line_has_specific_content(line):
            weak_lines.append(line[:240])

    hits = {phrase: count for phrase, count in hits.items() if count}
    role_lines_count = sum(1 for line in lines if _is_role_line(line))
    ratio = len(weak_lines) / max(1, role_lines_count)
    excess = bool(weak_lines)
    return ratio, hits, weak_lines[:10], excess


def _homework_block(lines: list[str]) -> list[str]:
    block: list[str] = []
    capture = False
    headings = {h.lower() for h in REQUIRED_HEADINGS + LESSON_FLOW_HEADINGS}
    target = "домашнє завдання"
    for raw in lines:
        line = str(raw or "").strip()
        low = line.lower()
        if not line:
            continue
        if low.startswith(target):
            capture = True
            _, _, tail = line.partition(":")
            if tail.strip():
                block.append(tail.strip())
            continue
        if capture and (low in headings or any(low.startswith(f"{heading}:") for heading in headings)):
            break
        if capture:
            block.append(line)
    return block


def _weak_homework_signal(lines: list[str]) -> tuple[dict[str, int], list[str], bool]:
    homework = _homework_block(lines)
    if not homework:
        return {}, [], False

    text = " ".join(homework).strip()
    lower = text.lower()
    hits = {phrase: lower.count(phrase) for phrase in WEAK_HOMEWORK_PHRASES if phrase in lower}
    has_weak_phrase = bool(hits)
    has_specific = _role_line_has_specific_content(text)
    too_generic = has_weak_phrase and not has_specific
    return hits, ([text[:260]] if too_generic else []), too_generic


def _weak_methodical_signal(lines: list[str]) -> tuple[float, dict[str, int], list[str], bool]:
    if not lines:
        return 0.0, {}, [], False
    hits = {phrase: 0 for phrase in LOW_SPECIFICITY_PHRASES}
    weak_without_specific: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        lower = line.lower()
        matched = [phrase for phrase in LOW_SPECIFICITY_PHRASES if phrase in lower]
        if not matched:
            continue
        for phrase in matched:
            hits[phrase] += lower.count(phrase)
        if not _line_has_specific_content(line):
            weak_without_specific.append(line[:220])

    hits = {phrase: count for phrase, count in hits.items() if count}
    ratio = len(weak_without_specific) / max(1, len(lines))
    excess = len(weak_without_specific) >= 2 or ratio > 0.05
    return ratio, hits, weak_without_specific[:8], excess


def _topic_coverage_ratio(lines: list[str], topic: str) -> tuple[float, bool]:
    topic_l = str(topic or "").lower()
    non_empty = [line for line in lines if line.strip()]
    if not non_empty:
        return 0.0, False

    is_narrow_topic = bool(
        re.search(r"\b\w+\s+\d+\b", topic_l)
        or any(marker in topic_l for marker in ("периметр", "прямокут", "множ", "ділен"))
    )
    if not is_narrow_topic:
        return 1.0, False

    required_markers = []
    if "периметр" in topic_l and "прямокут" in topic_l:
        required_markers = ["периметр", "прямокут"]
    elif " 6" in topic_l:
        required_markers = ["6", "множ", "ділен"]
    elif " 8" in topic_l:
        required_markers = ["8", "множ", "ділен"]

    if not required_markers:
        required_markers = [token for token in MATH_TOKENS if token in topic_l]
    if not required_markers:
        return 1.0, True

    covered = 0
    for line in non_empty:
        lower = line.lower()
        if any(marker in lower for marker in required_markers):
            covered += 1

    return covered / max(1, len(non_empty)), True


def _task_focus_lines(lines: list[str]) -> list[str]:
    focus = []
    for raw in lines:
        line = str(raw or "").strip()
        low = line.lower()
        if not line:
            continue
        if _is_role_line(line) or any(token in low for token in ("завдання", "вправа", "розв", "обчисл", "склад", "спостереж", "дослід")):
            focus.append(line)
    return focus


def _extract_division_target(topic: str) -> str:
    match = re.search(r"ділен\w*[^.\n]{0,24}?\bна\s+(\d{1,2})\b", str(topic or "").lower())
    return match.group(1) if match else ""


def _soft_topic_coverage_signal(lines: list[str], topic: str) -> dict:
    topic_l = str(topic or "").lower()
    flow = _section_block(lines, "хід уроку")
    focus_lines = _task_focus_lines(flow or lines)
    focus_text = "\n".join(focus_lines).lower()
    flow_text = "\n".join(flow or lines).lower()

    if not topic_l.strip() or not (flow_text or focus_text):
        return {"applicable": False, "low": False, "ratio": 1.0, "hits": 0, "expected": []}

    division_target = _extract_division_target(topic_l)
    if division_target:
        pattern = rf"(?:[:÷/]\s*{re.escape(division_target)}\b|\b\d+\s*:\s*{re.escape(division_target)}\b)"
        hits = len(re.findall(pattern, focus_text))
        required = 2 if len(focus_lines) >= 3 else 1
        return {
            "applicable": True,
            "low": hits < required,
            "ratio": min(1.0, hits / max(1, required)),
            "hits": hits,
            "expected": [f":{division_target}"],
        }

    if "реченн" in topic_l and "вид" in topic_l:
        markers = ["розповід", "питальн", "спонукальн", "окличн", "неокличн"]
        hits = sum(1 for marker in markers if marker in flow_text)
        return {
            "applicable": True,
            "low": hits < 2,
            "ratio": min(1.0, hits / 2),
            "hits": hits,
            "expected": markers,
        }

    if "кругообіг" in topic_l and "вод" in topic_l:
        markers = ["випаров", "конденсац", "опад", "хмар", "кругообіг"]
        hits = sum(1 for marker in markers if marker in flow_text)
        return {
            "applicable": True,
            "low": hits < 2,
            "ratio": min(1.0, hits / 2),
            "hits": hits,
            "expected": markers,
        }

    topic_tokens = [
        token
        for token in re.findall(r"[A-Za-z\u0400-\u04FF0-9']+", topic_l)
        if len(token) >= 4 and token not in {"урок", "тема", "клас", "природі"}
    ]
    if len(topic_tokens) >= 2:
        hits = sum(1 for token in set(topic_tokens) if token in flow_text)
        return {
            "applicable": True,
            "low": hits == 0,
            "ratio": min(1.0, hits / max(1, min(2, len(set(topic_tokens))))),
            "hits": hits,
            "expected": sorted(set(topic_tokens))[:6],
        }

    return {"applicable": False, "low": False, "ratio": 1.0, "hits": 0, "expected": []}


def _section_block(lines: list[str], heading: str) -> list[str]:
    if not lines:
        return []
    headings = {h.lower() for h in REQUIRED_HEADINGS + LESSON_FLOW_HEADINGS}
    target = heading.lower()
    capture = False
    block = []
    for line in lines:
        low = line.lower().strip()
        if low in headings or low.startswith(f"{target}:"):
            if capture:
                break
            capture = low == target or low.startswith(f"{target}:")
            continue
        if capture:
            block.append(line)
    return block


def _narrow_topic_markers(topic: str) -> list[str]:
    topic_l = str(topic or "").lower()
    if "периметр" in topic_l and "прямокут" in topic_l:
        return ["периметр", "прямокут", "сторона", "довжин"]
    if " 6" in topic_l:
        if "ділен" in topic_l and "множ" not in topic_l:
            return ["6", "ділен", ":"]
        return ["6", "множ", "×", "x", "х"]
    if " 8" in topic_l:
        if "ділен" in topic_l and "множ" not in topic_l:
            return ["8", "ділен", ":"]
        if "множ" in topic_l and "ділен" in topic_l:
            return ["8", "множ", "ділен"]
        return ["8", "множ", "×", "x", "х"]
    return [token for token in MATH_TOKENS if token in topic_l]


def _section_topic_coverage(lines: list[str], topic: str) -> tuple[float, float, bool]:
    markers = _narrow_topic_markers(topic)
    if not markers:
        return 1.0, 1.0, False
    act = _section_block(lines, "актуалізація опорних знань") or _section_block(lines, "актуалізація знань")
    prac = _section_block(lines, "закріплення знань") or _section_block(lines, "закріплення")
    if not act and not prac:
        return 1.0, 1.0, False

    def ratio(block: list[str]) -> float:
        content = [line for line in block if line.strip()]
        if not content:
            return 1.0
        hit = 0
        for line in content:
            low = line.lower()
            if any(marker in low for marker in markers):
                hit += 1
        return hit / max(1, len(content))

    return ratio(act), ratio(prac), True


def _goal_generic_ratio(lines: list[str], topic: str) -> tuple[float, bool]:
    topic_tokens = {
        t for t in re.findall(r"[A-Za-z\u0400-\u04FF0-9']+", str(topic or "").lower()) if len(t) >= 3
    }
    goal_lines = []
    for line in lines:
        lower = line.lower()
        if lower.startswith("мета") or "мета уроку" in lower:
            goal_lines.append(lower)
    if not goal_lines:
        return 0.0, False

    generic = 0
    for line in goal_lines:
        has_generic = any(phrase in line for phrase in GOAL_GENERIC_PHRASES)
        line_tokens = {t for t in re.findall(r"[A-Za-z\u0400-\u04FF0-9']+", line) if len(t) >= 3}
        topic_overlap = bool(topic_tokens & line_tokens) if topic_tokens else False
        if has_generic and not topic_overlap:
            generic += 1

    return generic / max(1, len(goal_lines)), True


def _structure_presence(lines: list[str]) -> tuple[float, list[str]]:
    text = "\n".join(lines).lower()
    present = [heading for heading in REQUIRED_HEADINGS if heading in text]
    missing = [heading for heading in REQUIRED_HEADINGS if heading not in text]
    ratio = len(present) / max(1, len(REQUIRED_HEADINGS))
    return ratio, missing


def _nush_structure_signals(lines: list[str]) -> dict:
    text = "\n".join(lines).lower()

    def find_heading(*variants: str) -> int:
        positions = [text.find(variant.lower()) for variant in variants]
        positions = [pos for pos in positions if pos >= 0]
        return min(positions) if positions else -1

    meta_pos = find_heading("мета уроку")
    flow_pos = find_heading("хід уроку")
    homework_pos = find_heading("домашнє завдання")
    equipment_pos = find_heading("обладнання та матеріали", "обладнання")

    missing_required = []
    if meta_pos < 0:
        missing_required.append("мета уроку")
    if flow_pos < 0:
        missing_required.append("хід уроку")
    if equipment_pos < 0:
        missing_required.append("обладнання")

    flow_after_homework = flow_pos >= 0 and homework_pos >= 0 and flow_pos > homework_pos
    equipment_before_flow = equipment_pos >= 0 and flow_pos >= 0 and equipment_pos < flow_pos
    homework_after_flow = homework_pos >= 0 and flow_pos >= 0 and homework_pos > flow_pos

    return {
        "nush_missing_required": missing_required,
        "nush_structure_missing": bool(missing_required),
        "lesson_flow_after_homework": flow_after_homework,
        "equipment_before_lesson_flow": equipment_before_flow,
        "homework_after_lesson_flow": homework_after_flow,
    }


def _cue_phrase_ratio(lines: list[str]) -> tuple[float, dict[str, int]]:
    text = "\n".join(lines).lower()
    hits = {phrase: text.count(phrase) for phrase in CUE_PHRASES}
    total = sum(hits.values())
    return total / max(1, len(lines)), hits


def _dialogue_ratio(lines: list[str]) -> float:
    if not lines:
        return 0.0
    dialogue_lines = 0
    for line in lines:
        lower = line.lower().strip()
        if any(lower.startswith(marker) for marker in DIALOGUE_MARKERS):
            dialogue_lines += 1
            continue
        if lower.count("—") >= 2 and "?" in lower:
            dialogue_lines += 1
    return dialogue_lines / max(1, len(lines))


def _explanation_repetition_ratio(lines: list[str]) -> float:
    explanation_markers = ("пояснює", "пояснення", "правило:", "правило ", "зверніть увагу")
    explanation_lines = [line.lower() for line in lines if any(marker in line.lower() for marker in explanation_markers)]
    if not explanation_lines:
        return 0.0
    unique = set(explanation_lines)
    repeated = len(explanation_lines) - len(unique)
    return repeated / max(1, len(explanation_lines))


def _topic_echo_signal(lines: list[str], topic: str) -> tuple[float, int, int, bool]:
    topic_text = normalize_lesson_text(topic).lower()
    if not topic_text or len(topic_text) < 6:
        return 0.0, 0, 0, False

    text = "\n".join(lines).lower()
    topic_escaped = re.escape(topic_text)
    mentions = len(re.findall(topic_escaped, text, flags=re.IGNORECASE))
    bracket_mentions = len(
        re.findall(rf"(?:\(|:|=)\s*\(?\s*{topic_escaped}\s*\)?", text, flags=re.IGNORECASE)
    )
    ratio = max(0, mentions - 3) / max(1, len(lines))
    echo_excess = mentions > 6 or bracket_mentions >= 2 or ratio > 0.08
    return ratio, mentions, bracket_mentions, echo_excess


def _artifact_signals(lines: list[str], topic: str) -> dict:
    if not lines:
        return {
            "placeholder_artifact_ratio": 0.0,
            "malformed_math_ratio": 0.0,
            "broken_fill_ratio": 0.0,
            "placeholder_artifact_excess": False,
            "malformed_math_notation": False,
            "broken_fill_pattern": False,
        }

    topic_text = normalize_lesson_text(topic).lower().strip()
    topic_escaped = re.escape(topic_text) if topic_text else ""

    placeholder_hits = 0
    malformed_math_hits = 0
    broken_fill_hits = 0

    broken_math_patterns = (
        r"\b\d+\s*[=:+\-xх×*/]\s*[.\u2026]+\s*[+\-xх×*/]?\s*[.\u2026]*\b",
        r"\b\d+\s*[=:+\-xх×*/]\s*[+\-xх×*/]\s*\b",
        r"\b[=:+\-xх×*/]\s*[.\u2026]+\b",
        r"\b\d+\s*=\.\s*\+\.",
    )
    malformed_fill_patterns = (
        r"[.\u2026]{2,}",
        r"\b\d+\s*[=:+\-xх×*/]\s*[.\u2026]+\b",
        r"\b[.\u2026]+\s*[+\-xх×*/]\s*[.\u2026]+\b",
    )

    for raw in lines:
        line = raw.strip()
        low = line.lower()
        if not line:
            continue

        if any(re.search(pattern, low) for pattern in broken_math_patterns):
            malformed_math_hits += 1
        if any(re.search(pattern, low) for pattern in malformed_fill_patterns):
            broken_fill_hits += 1

        if topic_escaped:
            if re.search(rf"(?:\)|:|=)\s*\(?\s*{topic_escaped}\s*\)?\s*$", low, flags=re.IGNORECASE):
                placeholder_hits += 1

    count = max(1, len(lines))
    placeholder_ratio = placeholder_hits / count
    malformed_math_ratio = malformed_math_hits / count
    broken_fill_ratio = broken_fill_hits / count

    return {
        "placeholder_artifact_ratio": placeholder_ratio,
        "malformed_math_ratio": malformed_math_ratio,
        "broken_fill_ratio": broken_fill_ratio,
        "placeholder_artifact_excess": placeholder_hits >= 2 or placeholder_ratio > 0.04,
        "malformed_math_notation": malformed_math_hits >= 1,
        "broken_fill_pattern": broken_fill_hits >= 2 or broken_fill_ratio > 0.06,
    }


def _generic_topic_tail_signal(lines: list[str]) -> tuple[float, int, bool]:
    if not lines:
        return 0.0, 0, False
    joined = "\n".join(lines).lower()
    hits = len(
        re.findall(
            r"(?:\(|:|=)\s*\(?\s*(?:тема|теми|за\s+темою)\s+уроку\s*\)?",
            joined,
            flags=re.IGNORECASE,
        )
    )
    ratio = hits / max(1, len(lines))
    excess = hits >= 2 or ratio > 0.04
    return ratio, hits, excess


def assess_lesson_text(text: str, topic: str = "", subject: str = "") -> dict:
    normalized = normalize_lesson_text(text)
    lower = normalized.lower()
    lines = [line for line in normalized.splitlines() if line.strip()]

    generic_hits = {phrase: lower.count(phrase) for phrase in GENERIC_PHRASES}
    generic_total = sum(generic_hits.values())
    generic_ratio = generic_total / max(1, len(lines))

    low_specificity_hits = {phrase: lower.count(phrase) for phrase in LOW_SPECIFICITY_PHRASES}
    low_specificity_total = sum(low_specificity_hits.values())
    weak_methodical_ratio, weak_methodical_hits, weak_methodical_lines, weak_methodical_excess = _weak_methodical_signal(lines)
    weak_role_ratio, weak_role_hits, weak_role_lines, weak_role_excess = _weak_role_line_signal(lines)
    weak_homework_hits, weak_homework_lines, weak_homework_excess = _weak_homework_signal(lines)

    specific_lines = sum(1 for line in lines if _line_has_specific_content(line))
    specificity_ratio = specific_lines / max(1, len(lines))

    topic_coverage_ratio, topic_coverage_applicable = _topic_coverage_ratio(lines, topic)
    soft_topic_coverage = _soft_topic_coverage_signal(lines, topic)
    act_ratio, prac_ratio, section_coverage_applicable = _section_topic_coverage(lines, topic)
    goal_generic_ratio, goal_applicable = _goal_generic_ratio(lines, topic)
    structure_ratio, structure_missing = _structure_presence(lines)
    nush_structure = _nush_structure_signals(lines)
    cue_phrase_ratio, cue_phrase_hits = _cue_phrase_ratio(lines)
    dialogue_ratio = _dialogue_ratio(lines)
    explanation_repetition_ratio = _explanation_repetition_ratio(lines)
    topic_echo_ratio, topic_mentions, bracket_topic_mentions, topic_echo_excess = _topic_echo_signal(lines, topic)
    artifact_signals = _artifact_signals(lines, topic)
    generic_topic_tail_ratio, generic_topic_tail_hits, generic_topic_tail_excess = _generic_topic_tail_signal(lines)

    too_short = len(lines) < 12
    generic_high = generic_ratio > 0.18
    low_specificity = specificity_ratio < 0.45 or low_specificity_total >= 3
    topic_coverage_low = (
        bool(soft_topic_coverage.get("low"))
        if soft_topic_coverage.get("applicable")
        else (topic_coverage_applicable and topic_coverage_ratio < 0.35)
    )
    section_topic_coverage_low = section_coverage_applicable and (act_ratio < 0.8 or prac_ratio < 0.8)
    goal_too_generic = goal_applicable and goal_generic_ratio >= 0.5
    structure_missing_flag = structure_ratio < 1.0
    cue_phrase_overuse = cue_phrase_ratio > 0.12
    dialogue_style_excess = dialogue_ratio > 0.22
    explanation_repetition = explanation_repetition_ratio > 0.25

    reasons = [
        reason
        for reason, cond in [
            ("too_short", too_short),
            ("generic_phrase_ratio_high", generic_high),
            ("low_specificity", low_specificity),
            ("topic_coverage_low", topic_coverage_low),
            ("section_topic_coverage_low", section_topic_coverage_low),
            ("goal_too_generic", goal_too_generic),
            ("structure_missing", structure_missing_flag),
            ("cue_phrase_overuse", cue_phrase_overuse),
            ("dialogue_style_excess", dialogue_style_excess),
            ("explanation_repetition", explanation_repetition),
            ("topic_echo_excess", topic_echo_excess),
            ("placeholder_artifact_excess", bool(artifact_signals.get("placeholder_artifact_excess"))),
            ("malformed_math_notation", bool(artifact_signals.get("malformed_math_notation"))),
            ("broken_fill_pattern", bool(artifact_signals.get("broken_fill_pattern"))),
            ("generic_topic_tail_excess", generic_topic_tail_excess),
            ("nush_structure_missing", bool(nush_structure.get("nush_structure_missing"))),
            ("lesson_flow_after_homework", bool(nush_structure.get("lesson_flow_after_homework"))),
            ("weak_methodical_phrases", weak_methodical_excess),
            ("weak_role_lines", weak_role_excess),
            ("weak_homework", weak_homework_excess),
        ]
        if cond
    ]

    return {
        "line_count": len(lines),
        "generic_hits": generic_hits,
        "generic_phrase_ratio": round(generic_ratio, 4),
        "low_specificity_hits": low_specificity_hits,
        "weak_methodical_phrase_hits": weak_methodical_hits,
        "weak_methodical_without_specific": weak_methodical_lines,
        "weak_methodical_ratio": round(weak_methodical_ratio, 4),
        "weak_role_phrase_hits": weak_role_hits,
        "weak_role_lines": weak_role_lines,
        "weak_role_ratio": round(weak_role_ratio, 4),
        "weak_homework_phrase_hits": weak_homework_hits,
        "weak_homework_lines": weak_homework_lines,
        "specificity_ratio": round(specificity_ratio, 4),
        "topic_coverage_ratio": round(topic_coverage_ratio, 4),
        "topic_coverage_applicable": topic_coverage_applicable,
        "soft_topic_coverage_ratio": round(float(soft_topic_coverage.get("ratio") or 0.0), 4),
        "soft_topic_coverage_applicable": bool(soft_topic_coverage.get("applicable")),
        "soft_topic_coverage_hits": int(soft_topic_coverage.get("hits") or 0),
        "soft_topic_coverage_expected": list(soft_topic_coverage.get("expected") or []),
        "actualization_topic_coverage_ratio": round(act_ratio, 4),
        "practice_topic_coverage_ratio": round(prac_ratio, 4),
        "section_topic_coverage_applicable": section_coverage_applicable,
        "goal_generic_ratio": round(goal_generic_ratio, 4),
        "goal_check_applicable": goal_applicable,
        "structure_ratio": round(structure_ratio, 4),
        "structure_missing": structure_missing,
        "nush_missing_required": list(nush_structure.get("nush_missing_required") or []),
        "lesson_flow_after_homework": bool(nush_structure.get("lesson_flow_after_homework")),
        "equipment_before_lesson_flow": bool(nush_structure.get("equipment_before_lesson_flow")),
        "homework_after_lesson_flow": bool(nush_structure.get("homework_after_lesson_flow")),
        "cue_phrase_ratio": round(cue_phrase_ratio, 4),
        "cue_phrase_hits": cue_phrase_hits,
        "dialogue_ratio": round(dialogue_ratio, 4),
        "explanation_repetition_ratio": round(explanation_repetition_ratio, 4),
        "topic_echo_ratio": round(topic_echo_ratio, 4),
        "topic_mentions": int(topic_mentions),
        "bracket_topic_mentions": int(bracket_topic_mentions),
        "generic_topic_tail_ratio": round(float(generic_topic_tail_ratio), 4),
        "generic_topic_tail_hits": int(generic_topic_tail_hits),
        "placeholder_artifact_ratio": round(float(artifact_signals.get("placeholder_artifact_ratio") or 0.0), 4),
        "malformed_math_ratio": round(float(artifact_signals.get("malformed_math_ratio") or 0.0), 4),
        "broken_fill_ratio": round(float(artifact_signals.get("broken_fill_ratio") or 0.0), 4),
        "needs_refinement": bool(reasons),
        "reasons": reasons,
    }
