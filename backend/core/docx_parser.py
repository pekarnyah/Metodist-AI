import re
from pathlib import Path

from docx import Document


HEADER_FIELD_MAP = {
    "дата": "Дата",
    "клас": "Клас",
    "предмет": "Предмет",
    "тема": "Тема",
    "мета": "Мета",
    "обладнання": "Обладнання",
    "тип уроку": "Тип уроку",
    "освітня галузь": "Освітня галузь",
}

SECTION_TITLE_MAP = {
    "хід уроку": "Хід уроку",
    "очікувані результати": "Очікувані результати",
    "очікуваний результат": "Очікувані результати",
    "ключові компетентності": "Ключові компетентності",
    "міжпредметні зв'язки": "Міжпредметні зв'язки",
    "міжпредметні зв'язки": "Міжпредметні зв'язки",
    "формувальне оцінювання": "Формувальне оцінювання",
    "домашнє завдання": "Домашнє завдання",
    "методи": "Методи",
    "форми роботи": "Форми роботи",
    "ресурси": "Ресурси",
}

STAGE_SYNONYMS = {
    "вступна частина": "Вступна частина",
    "організація класу": "Організаційний момент",
    "організаційний момент": "Організаційний момент",
    "мотивація навчальної діяльності": "Мотивація навчальної діяльності",
    "повідомлення теми і мети уроку": "Повідомлення теми і мети уроку",
    "мотивація навчальної діяльності повідомлення теми й мети уроку": "Мотивація навчальної діяльності. Повідомлення теми й мети уроку",
    "мотивація навчальної діяльності повідомлення теми і мети уроку": "Мотивація навчальної діяльності. Повідомлення теми і мети уроку",
    "актуалізація знань учнів": "Актуалізація опорних знань",
    "актуалізація опорних знань": "Актуалізація опорних знань",
    "перевірка домашнього завдання": "Перевірка домашнього завдання",
    "вивчення нового матеріалу": "Вивчення нового матеріалу",
    "закріплення знань": "Закріплення знань",
    "закріплення вивченого матеріалу": "Закріплення вивченого матеріалу",
    "узагальнення і систематизація знань": "Узагальнення і систематизація знань",
    "узагальнення і систематизація отриманих знань": "Узагальнення і систематизація отриманих знань",
    "підсумок уроку": "Підсумок уроку",
    "рефлексія": "Рефлексія",
    "рефлексія промінь сонця": "Рефлексія «Промені сонця»",
    "домашнє завдання": "Домашнє завдання",
}

GENERIC_FLOW_SECTIONS = {
    "основна частина": "Основна частина",
    "заключна частина": "Заключна частина",
}

ROMAN_STAGE_RE = re.compile(r"^[IVXІVХ]+[\.)]\s*.+", re.IGNORECASE)
LEADING_NUMBER_RE = re.compile(r"^\d+[\.)]\s*")
LEADING_LABEL_RE = re.compile(r"^([^:]{2,80}):\s*(.+)?$")
TRAILING_TIME_RE = re.compile(r"\s*\((?:до\s*)?\d+\s*(?:хв|min)\)\s*$", re.IGNORECASE)
SUBSTEP_NUMBER_RE = re.compile(r"^\d+[\.)]\s+.+$")
SUBSTEP_KEYWORDS = (
    "вправа",
    "робота",
    "гра",
    "бесіда",
    "евристична бесіда",
    "тестові завдання",
    "каліграф",
    "хвилинка",
    "фізкульт",
    "самостійна",
    "сенкан",
    "сенквейн",
    "мікрофон",
    "ранкове коло",
    "рефлексія",
    "повідомлення теми",
    "домашнє завдання",
    "читання",
    "слухання",
    "дослід",
    "перевірка",
)


class DocxParser:
    @staticmethod
    def _normalize_spaces(text: str) -> str:
        return re.sub(r"\s+", " ", str(text or "").replace("\xa0", " ")).strip()

    @staticmethod
    def _split_lines(text: str) -> list[str]:
        raw_lines = str(text or "").replace("\r", "\n").split("\n")
        return [DocxParser._normalize_spaces(line) for line in raw_lines if DocxParser._normalize_spaces(line)]

    @staticmethod
    def _normalize_label(text: str) -> str:
        head = text.split(":", 1)[0]
        head = LEADING_NUMBER_RE.sub("", head)
        head = re.sub(r"^[\-•*\s]+", "", head)
        return DocxParser._normalize_spaces(head).rstrip(".").lower()

    @staticmethod
    def _canonical_stage(title: str) -> str:
        cleaned = DocxParser._normalize_spaces(title).rstrip(".")
        normalized = cleaned.lower()
        canonical = STAGE_SYNONYMS.get(normalized)
        if canonical:
            return canonical
        if normalized in GENERIC_FLOW_SECTIONS:
            return GENERIC_FLOW_SECTIONS[normalized]
        if cleaned:
            return cleaned[0].upper() + cleaned[1:]
        return ""

    @staticmethod
    def _parse_labeled_line(text: str) -> tuple[str | None, str]:
        match = LEADING_LABEL_RE.match(text)
        if not match:
            return None, ""
        label = DocxParser._normalize_spaces(match.group(1)).rstrip(".").lower()
        value = DocxParser._normalize_spaces(match.group(2) or "")
        return label, value

    @staticmethod
    def _is_stage_line(text: str) -> str | None:
        normalized = DocxParser._normalize_spaces(text)
        if not normalized:
            return None
        normalized = TRAILING_TIME_RE.sub("", normalized).strip()

        if ROMAN_STAGE_RE.match(normalized):
            title = re.sub(r"^[IVXІVХ]+[\.)]\s*", "", normalized, flags=re.IGNORECASE).strip()
            return DocxParser._canonical_stage(title)

        plain_label = DocxParser._normalize_label(normalized)
        if plain_label in STAGE_SYNONYMS or plain_label in GENERIC_FLOW_SECTIONS:
            return DocxParser._canonical_stage(plain_label)

        return None

    @staticmethod
    def _is_substep_line(text: str, style_name: str, inside_lesson_flow: bool) -> str | None:
        normalized = DocxParser._normalize_spaces(text)
        if not normalized or not inside_lesson_flow:
            return None
        if normalized.startswith(("-", "–", "—", "•", "*")):
            return None

        label, _ = DocxParser._parse_labeled_line(normalized)
        if label in HEADER_FIELD_MAP or label in SECTION_TITLE_MAP:
            return None
        if DocxParser._is_stage_line(normalized):
            return None

        style_lower = (style_name or "").lower()
        if SUBSTEP_NUMBER_RE.match(normalized):
            return LEADING_NUMBER_RE.sub("", normalized).strip().rstrip(".")

        if style_lower.startswith("list") and len(normalized) <= 140:
            return normalized.rstrip(".")

        lowered = normalized.lower().rstrip(".")
        if any(keyword in lowered for keyword in SUBSTEP_KEYWORDS) and len(normalized) <= 160:
            return normalized.rstrip(".")

        return None

    @staticmethod
    def _append_unique(target: dict, text: str, style_name: str, max_items: int = 24):
        cleaned = DocxParser._normalize_spaces(text)
        if not cleaned or len(cleaned) < 2:
            return
        if cleaned in target["items"]:
            return
        if len(target["items"]) >= max_items:
            return
        target["items"].append(cleaned)
        target["item_styles"].append(style_name or "Normal")

    @staticmethod
    def extract_structure(file_path):
        path = Path(file_path)
        doc = Document(path)

        result = {
            "file_name": path.name,
            "header_fields": [],
            "sections": [],
            "stages": [],
            "paragraphs": [],
        }

        current_section = None
        current_stage = None
        current_substep = None
        inside_lesson_flow = False

        def new_content_node(title: str, display_title: str | None, style_name: str):
            return {
                "title": title,
                "display_title": DocxParser._normalize_spaces(display_title or title),
                "style": style_name or "Normal",
                "items": [],
                "item_styles": [],
                "substeps": [],
                "children_order": [],
            }

        def start_section(title: str, display_title: str | None = None, style_name: str = "Normal"):
            nonlocal current_section, current_stage, current_substep
            current_section = {
                "title": title,
                "display_title": DocxParser._normalize_spaces(display_title or title),
                "style": style_name or "Normal",
                "items": [],
                "item_styles": [],
                "substeps": [],
                "stages": [],
                "children_order": [],
            }
            result["sections"].append(current_section)
            current_stage = None
            current_substep = None

        def ensure_flow_section():
            nonlocal inside_lesson_flow
            if current_section is None or current_section["title"] not in {"Хід уроку", *GENERIC_FLOW_SECTIONS.values()}:
                start_section("Хід уроку", "Хід уроку", "Normal")
            inside_lesson_flow = True

        def start_stage(title: str, display_title: str | None = None, style_name: str = "Normal"):
            nonlocal current_stage, current_substep
            ensure_flow_section()
            current_stage = new_content_node(title, display_title, style_name)
            current_stage["section_title"] = current_section["title"]
            result["stages"].append(current_stage)
            current_section["stages"].append(current_stage)
            current_section["children_order"].append(("stage", len(current_section["stages"]) - 1))
            current_substep = None

        def start_substep(title: str, display_title: str | None = None, style_name: str = "Normal"):
            nonlocal current_substep
            target = current_stage if current_stage is not None else current_section
            if target is None:
                return
            current_substep = new_content_node(title, display_title, style_name)
            target["substeps"].append(current_substep)
            target["children_order"].append(("substep", len(target["substeps"]) - 1))

        def add_header_field(label: str, value: str, style_name: str):
            existing = {(item["label"], item.get("value", "")) for item in result["header_fields"]}
            key = (label, value)
            if key in existing:
                return
            if not value and any(item["label"] == label for item in result["header_fields"]):
                return
            if value:
                same_label = next((item for item in result["header_fields"] if item["label"] == label), None)
                if same_label and not same_label.get("value"):
                    same_label["value"] = value
                    return
            result["header_fields"].append(
                {
                    "label": label,
                    "value": value,
                    "style": style_name or "Normal",
                }
            )

        def append_material(text: str, style_name: str):
            if current_substep is not None:
                DocxParser._append_unique(current_substep, text, style_name)
                return
            if current_stage is not None:
                DocxParser._append_unique(current_stage, text, style_name)
                return
            if current_section is not None:
                DocxParser._append_unique(current_section, text, style_name)

        for paragraph in doc.paragraphs:
            style_name = paragraph.style.name if paragraph.style else "Normal"
            for text in DocxParser._split_lines(paragraph.text):
                normalized = text

                label, value = DocxParser._parse_labeled_line(text)
                if label in HEADER_FIELD_MAP:
                    add_header_field(HEADER_FIELD_MAP[label], value, style_name)
                    result["paragraphs"].append({"text": text, "style": style_name, "kind": "header"})
                    continue

                if label in SECTION_TITLE_MAP:
                    section_title = SECTION_TITLE_MAP[label]
                    start_section(section_title, text, style_name)
                    inside_lesson_flow = section_title in {"Хід уроку", *GENERIC_FLOW_SECTIONS.values()}
                    if value:
                        append_material(value, style_name)
                    result["paragraphs"].append({"text": text, "style": style_name, "kind": "section"})
                    continue

                if text.lower() in SECTION_TITLE_MAP:
                    section_title = SECTION_TITLE_MAP[text.lower()]
                    start_section(section_title, text, style_name)
                    inside_lesson_flow = section_title in {"Хід уроку", *GENERIC_FLOW_SECTIONS.values()}
                    result["paragraphs"].append({"text": text, "style": style_name, "kind": "section"})
                    continue

                stage_title = DocxParser._is_stage_line(text)
                if stage_title:
                    if stage_title in GENERIC_FLOW_SECTIONS.values():
                        start_section(stage_title, text, style_name)
                        inside_lesson_flow = True
                        result["paragraphs"].append({"text": text, "style": style_name, "kind": "section"})
                    else:
                        start_stage(stage_title, text, style_name)
                        result["paragraphs"].append({"text": text, "style": style_name, "kind": "stage"})
                    continue

                if style_name.startswith("Heading"):
                    if inside_lesson_flow:
                        start_stage(TRAILING_TIME_RE.sub("", text).strip(), text, style_name)
                        result["paragraphs"].append({"text": text, "style": style_name, "kind": "stage"})
                    else:
                        start_section(text, text, style_name)
                        result["paragraphs"].append({"text": text, "style": style_name, "kind": "section"})
                    continue

                substep_title = DocxParser._is_substep_line(text, style_name, inside_lesson_flow)
                if substep_title:
                    start_substep(substep_title, text, style_name)
                    result["paragraphs"].append({"text": text, "style": style_name, "kind": "substep"})
                    continue

                append_material(text, style_name)
                result["paragraphs"].append({"text": text, "style": style_name, "kind": "content"})

        return result
