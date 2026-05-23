from __future__ import annotations

import json
import re


def _reference_block(references: list[dict]) -> str:
    blocks = []
    for idx, ref in enumerate(references, start=1):
        title = str(ref.get("title") or f"Reference {idx}").strip()
        text = str(ref.get("text") or "").strip()
        blocks.append(f"=== REFERENCE {idx}: {title} ===\n{text}")
    return "\n\n".join(blocks).strip()


def _is_narrow_math_topic(topic: str, subject: str) -> bool:
    topic_l = str(topic or "").lower()
    explicit_target = _extract_operation_target_number(topic_l)
    return bool(explicit_target) or any(
        token in topic_l
        for token in (
            "одноцифров",
            "дві дії",
            "без переходу через розряд",
            "периметр",
            "прямокут",
            "area",
            "perimeter",
            "rectangle",
            "word problem",
            "task",
        )
    )


def _extract_operation_target_number(topic_l: str) -> str:
    text = str(topic_l or "").lower()
    # Explicit operation target: "множення на 6", "ділення на 8", "на 7"
    for pattern in (
        r"(?:множ|добут|ділен|частк)\w*[^.\n]{0,24}?\bна\s+(\d{1,2})\b",
        r"\bна\s+(\d{1,2})\b[^.\n]{0,24}?(?:множ|ділен)\w*",
    ):
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    return ""


def _topic_type(topic: str) -> str:
    low = str(topic or "").lower()
    has_mult = "множ" in low or "multiplication" in low
    has_div = "ділен" in low or "division" in low
    has_tasks = "задач" in low or "word problem" in low or "task" in low
    has_geometry = any(token in low for token in ("периметр", "площа", "геометр", "rectangle", "perimeter", "area", "geometry"))

    if has_geometry:
        return "geometry"
    if has_tasks:
        return "word_tasks"
    if has_mult and has_div:
        return "mult_div"
    if has_mult:
        return "table_mult"
    if has_div:
        return "table_div"
    return "general"


def _topic_focus_hint(topic: str) -> str:
    low = str(topic or "").lower()
    number = _extract_operation_target_number(low)
    if "периметр" in low and "прямокут" in low:
        return "Use only rectangle-focused tasks: sides, lengths, perimeter calculations, comparison of perimeters."
    if "множ" in low and "ділен" in low and number:
        return f"Use only multiplication/division tasks with {number} in актуалізація and закріплення."
    if "множ" in low and number:
        return f"Use only multiplication-by-{number} tasks in актуалізація and закріплення."
    if "ділен" in low and number:
        return f"Use only division-by-{number} tasks in актуалізація and закріплення."
    return "Use tasks directly tied to the exact topic objects/numbers."


def _subject_specificity_rule(subject: str) -> str:
    low = str(subject or "").lower()
    if "математ" in low:
        return "Математика: у кожному змістовному етапі додавай числа, вирази, рівності або короткі задачі."
    if "мова" in low:
        return "Українська мова: додавай конкретні слова, словосполучення, речення, мовні приклади або короткий текст."
    if "літера" in low or "читан" in low:
        return "Читання/література: додавай текст, героя/героїню, запитання до змісту або коротке читацьке завдання."
    if "ядс" in low or "дослідж" in low:
        return "ЯДС: додавай спостереження, дослід, практичну дію або роботу з реальною ситуацією."
    if "інформ" in low:
        return "Інформатика: додавай покрокову дію або завдання на комп'ютері/пристрої."
    return "Кожен предметний етап має містити конкретний навчальний матеріал: приклад, запитання, завдання, вправу або практичну дію."


def build_rewrite_prompt(
    *,
    topic: str,
    grade: str,
    subject: str,
    requirements: str,
    context: str,
    references: list[dict],
) -> tuple[str, str]:
    topic_kind = _topic_type(topic)
    focus_hint = _topic_focus_hint(topic)
    subject_specificity_rule = _subject_specificity_rule(subject)
    narrow_topic_rule = (
        "For narrow topics (e.g., multiplication by 6, division by 6, rectangle perimeter), at least 70-80% of tasks and questions must be directly tied to that exact topic."
        if _is_narrow_math_topic(topic, subject)
        else "Keep introduction and prior-knowledge activation directly tied to the current lesson topic."
    )
    block_usage_rule = {
        "table_mult": "Use 'Усний рахунок' if useful, but examples must be on the exact table target (e.g., ×6/×7/×8).",
        "table_div": "Use 'Усний рахунок' if useful, but examples must be on the exact division table target (÷6/÷7/÷8).",
        "mult_div": "Use short oral warm-up only if it directly supports mixed multiplication/division by the target number.",
        "word_tasks": "'Усний рахунок' is optional; main focus must be word problems and solution steps.",
        "geometry": "Do NOT use oral table drills; focus on drawings, measurements, constructions, perimeter/area reasoning.",
        "general": "Template blocks are allowed moderately and only when pedagogically relevant.",
    }.get(topic_kind, "Template blocks are allowed moderately and only when pedagogically relevant.")

    system_instruction = (
        "Ти досвідчений український учитель початкової школи та методист НУШ. "
        "Напиши практичний конспект уроку як готовий учительський документ. "
        "Не виводь JSON, markdown-таблиці або службові коментарі."
    )

    prompt = f"""
Створи новий конспект уроку для заданої теми, використовуючи референси лише як приклади стилю і педагогічної логіки.

Вхідні дані:
- Предмет: {subject}
- Клас: {grade}
- Тема: {topic}
- Побажання вчителя: {requirements}
- Додатковий контекст: {context}

Жорсткі правила структури:
0) Строго дотримуйся структури та порядку розділів. Не переставляй розділи місцями.
1) Конспект ОБОВ'ЯЗКОВО має містити такі заголовки саме в цьому порядку:
   1. Тема уроку
   2. Клас
   3. Предмет
   4. Тип уроку
   5. Мета уроку:
      - навчальна
      - розвивальна
      - виховна
   6. Очікувані результати
   7. Обладнання та матеріали
   8. Хід уроку
   9. Домашнє завдання
2) "Хід уроку" має йти одразу після "Обладнання та матеріали" і ДО "Домашнє завдання".
3) Усередині "Хід уроку" обов'язково подай етапи саме в такому порядку:
   - Організаційний момент
   - Актуалізація опорних знань
   - Мотивація навчальної діяльності
   - Вивчення нового матеріалу
   - Закріплення знань
   - Підсумок уроку
4) Для кожного етапу "Хід уроку" вкажи три короткі підпункти:
   - Учитель: що конкретно робить або говорить учитель.
   - Учні: що конкретно роблять учні.
   - Завдання/вправа: конкретне завдання, приклад, вправа, спостереження або практична дія.
5) Кожен етап "Хід уроку" має містити мінімум одну конкретну дію: приклад, запитання, завдання, коротку вправу, міні-ситуацію або практичну дію.

Вимоги до якості:
6) Педагогічний flow має бути природним і реалістичним для класу.
7) Не копіюй референси дослівно.
8) Не додавай зайвих розділів перед "Хід уроку".
9) Використовуй конкретні завдання, приклади, числа, слова, речення, тексти та дії.
10) Поверни ЛИШЕ чистий текст конспекту українською мовою, без JSON, markdown і коментарів.
11) Не використовуй шаблонні привітання й кліше: "Доброго дня, діти!", "Сьогодні ми...", "Молодці" без потреби.
12) Заборонені порожні методичні формулювання без конкретної дії: "формувати вміння", "розвивати мислення", "виховувати інтерес", "ознайомити учнів", "закріпити знання", "обговорити тему", "виконати вправу", "провести бесіду".
13) Якщо така фраза потрібна, одразу заміни її конкретною дією учня: що саме учень обчислює, читає, пояснює, порівнює, спостерігає, складає або виконує.
14) Не пиши "виконати вправу" без назви/змісту вправи, номерів, слів, речень, прикладів або задач.
15) Не пиши "провести бесіду" без 2-3 конкретних запитань.
16) Не пиши абстрактні завдання типу "обговорити тему", "виконати завдання", "попрацювати в групах" без змісту завдання.
17) Мета уроку має бути сформульована через конкретні дії учнів, а не через абстрактні дієслова.
    Погано: "формувати вміння ділити на 6".
    Добре: "навчити учнів застосовувати таблицю ділення на 6 для обчислення виразів і розв'язування простих задач".
18) {subject_specificity_rule}
19) Актуалізація опорних знань має прямо підводити до теми, а не бути загальною розминкою.
    У цьому блоці використовуй ті самі числа/об'єкти/мовні одиниці, що в темі: {focus_hint}
20) Мета уроку має бути короткою, конкретною і прямо пов'язаною з темою.
21) Дозволені блоки "Усний рахунок", "Фізкультхвилинка", "Робота з підручником" використовуй лише тоді, коли вони доречні для теми.
22) Тип теми: {topic_kind}. Правило: {block_usage_rule}
23) "Фізкультхвилинка" необов'язкова; не вставляй її автоматично.
24) {narrow_topic_rule}
25) Для вузьких тем у "Актуалізація опорних знань" і "Закріплення знань" щонайменше 80% завдань мають бути прямо за темою.
26) Критичне правило для "Закріплення знань": УСІ завдання мають бути строго за темою.
    - "множення на 6" -> all tasks with 6 multiplication only.
    - "ділення на 6" -> all tasks with division by 6 only.
    - "множення і ділення на 8" -> all tasks only with 8.
    - "периметр прямокутника" -> all tasks only about rectangles, sides, perimeter.
    Змішування сторонніх чисел/тем у "Закріплення знань" заборонене.
27) Для геометричних тем не використовуй табличні тренажі; потрібні фігури, сторони, довжини, вимірювання, конкретні розміри.
28) Конспект не має бути довгим діалогом. Уникай ланцюжків питань і рольових реплік.
29) Обмеж повтори фраз "Пригадайте", "Давайте", "Що ми можемо", "Як ви думаєте" до 1-2 разів на блок.
30) У "Вивчення нового матеріалу" поясни новий матеріал один раз чітко, потім переходь до практики.
31) У "Підсумок уроку" коротко зафіксуй:
    - що вивчили;
    - яке правило/спосіб дії застосовували.
32) Усі ключові завдання мають бути прямо пов'язані з темою уроку, а не просто з предметом.
33) Не підміняй вузьку тему загальною практикою: для математики використовуй числа й вирази саме за темою; для мови - мовні приклади саме за темою; для ЯДС - спостереження, дослід або практичну дію саме за темою.
34) Якщо тема "Ділення на 6", у завданнях регулярно мають бути вирази з діленням на 6, наприклад 24:6, 36:6, 42:6; не замінюй їх додаванням, відніманням або загальним усним рахунком.
35) "Домашнє завдання" має бути конкретним і пов'язаним з темою:
    - математика: 4-6 конкретних виразів або коротка задача за темою;
    - українська мова: конкретні слова, речення або міні-завдання за темою;
    - читання/література: конкретне читацьке запитання до тексту/героя;
    - ЯДС: спостереження, міні-дослід або практична дія;
    - інформатика: конкретне покрокове завдання.
36) Не пиши домашнє завдання лише як "виконати вправу", "виконати завдання", "опрацювати матеріал", "повторити тему" або "завдання за підручником" без конкретних прикладів чи інструкцій.

Референси:
{_reference_block(references)}
""".strip()
    return system_instruction, prompt


def build_refinement_prompt(
    *,
    draft_text: str,
    requirements: str,
    topic: str,
    subject: str,
    grade: str,
    refinement_reasons: list[str] | None = None,
    weak_role_lines: list[str] | None = None,
) -> tuple[str, str]:
    reasons = set(refinement_reasons or [])
    weak_role_targets = [str(line).strip() for line in (weak_role_lines or []) if str(line).strip()]
    focus_hint = _topic_focus_hint(topic)
    subject_specificity_rule = _subject_specificity_rule(subject)
    topic_focus_block = ""
    if "topic_coverage_low" in reasons or "section_topic_coverage_low" in reasons:
        topic_focus_block = (
            "Topic-coverage repair mode:\n"
            "- Rewrite only tasks, examples, questions and short stage lines that drift away from the lesson topic.\n"
            "- Do not rewrite the whole lesson if local replacements are enough.\n"
            "- Keep section order, headings and 'Хід уроку' position intact.\n"
            f"- Replace off-topic examples with topic-aligned ones: {focus_hint}\n"
            "- Every key task must train the exact topic, not only the general subject.\n"
            "- For math, use numbers/expressions tied to the topic; for language, use linguistic examples tied to the topic; for ЯДС, use observation/experiment/practical action tied to the topic.\n"
            "- If the topic is 'Ділення на 6', replace off-topic arithmetic with division-by-6 expressions such as 24:6, 36:6, 42:6 and short word problems with groups of 6.\n"
        )
    artifact_cleanup_block = ""
    if reasons & {
        "placeholder_artifact_excess",
        "malformed_math_notation",
        "broken_fill_pattern",
        "topic_echo_excess",
        "generic_topic_tail_excess",
    }:
        artifact_cleanup_block = (
            "Artifact-cleanup mode:\n"
            "- Remove broken placeholders and malformed math fragments (examples: '=. +.', '. + .', unfinished decomposition rows).\n"
            "- Remove repeated topic tails after expressions (e.g., ': (<topic>)', '= (<topic>)', trailing '(<topic>)').\n"
            "- Remove generic topic placeholders in tails: '(теми уроку)', '(тема уроку)', '(за темою уроку)'.\n"
            "- Rewrite only broken lines into valid, concrete math lines while preserving section structure and topic.\n"
            "- Do not add meta comments, only cleaned lesson content.\n"
        )
    weak_methodical_block = ""
    if reasons & {"weak_methodical_phrases", "low_specificity", "goal_too_generic", "generic_phrase_ratio_high"}:
        weak_methodical_block = (
            "Режим усунення методичної води:\n"
            "- Знайди фрази 'формувати вміння', 'розвивати мислення', 'виховувати інтерес', 'ознайомити учнів', 'закріпити знання', 'обговорити тему', 'виконати вправу', 'провести бесіду'.\n"
            "- Не просто перефразовуй їх, а замінюй конкретними діями, прикладами, запитаннями або завданнями.\n"
            "- Мету уроку перепиши через конкретні дії учнів: обчислюють, складають речення, читають текст, пояснюють явище, проводять спостереження.\n"
            f"- Предметна конкретизація: {subject_specificity_rule}\n"
        )
    structure_repair_block = ""
    if reasons & {"nush_structure_missing", "structure_missing", "lesson_flow_after_homework"}:
        structure_repair_block = (
            "Режим виправлення структури:\n"
            "- Насамперед віднови порядок головних розділів: Тема уроку; Клас; Предмет; Тип уроку; Мета уроку; Очікувані результати; Обладнання та матеріали; Хід уроку; Домашнє завдання.\n"
            "- Якщо 'Хід уроку' стоїть після 'Домашнє завдання', перенеси 'Хід уроку' перед 'Домашнє завдання'.\n"
            "- Якщо немає 'Мета уроку', 'Обладнання та матеріали' або 'Хід уроку', додай ці розділи з конкретним змістом за темою.\n"
            "- Не додавай нові головні розділи перед 'Хід уроку'.\n"
        )
    weak_role_targets_block = ""
    if weak_role_targets:
        weak_role_targets_block = (
            "Validator-detected weak role lines to replace exactly:\n"
            + "\n".join(f"- {line}" for line in weak_role_targets[:10])
            + "\nDo not leave these lines semantically unchanged. Replace each listed line with a concrete "
            "role line that includes numbers/examples, exact words/sentences, a specific question, "
            "an observation/experiment, or a step-by-step instruction. For math, include actual "
            "expressions or numbers in the replacement line."
        )
    weak_role_block = ""
    if "weak_role_lines" in reasons:
        weak_role_block = (
            "Режим точкового посилення рядків ролей:\n"
            "- Не переписуй увесь конспект. Знайди лише слабкі рядки, що починаються з 'Завдання/вправа:', 'Учитель:' або 'Учні:'.\n"
            "- Якщо рядок містить 'виконати завдання', 'виконати вправу', 'обговорити', 'провести бесіду', 'дати відповідь', 'працюють із завданням' без конкретики, заміни саме цей рядок.\n"
            "- Для 'Завдання/вправа:' дай конкретне завдання: числа/вирази, слова/речення, питання, текст, дослід, спостереження або покрокову дію.\n"
            "- Для 'Учитель:' додай конкретну інструкцію або 1-2 точні запитання.\n"
            "- Для 'Учні:' додай конкретну дію: що саме читають, обчислюють, записують, порівнюють, спостерігають або пояснюють.\n"
        )
    homework_block = ""
    if "weak_homework" in reasons:
        homework_block = (
            "Режим виправлення домашнього завдання:\n"
            "- Перепиши лише розділ 'Домашнє завдання'. Не переписуй увесь конспект.\n"
            "- Домашнє завдання має бути конкретним і прямо пов'язаним з темою уроку.\n"
            "- Не залишай формулювання 'виконати вправу', 'виконати завдання', 'опрацювати матеріал', 'повторити тему', 'завдання за підручником' без конкретики.\n"
            "- Для математики дай 4-6 конкретних виразів або коротку задачу за темою; для мови - конкретні слова/речення; для читання - конкретне запитання до тексту; для ЯДС - спостереження/міні-дослід; для інформатики - покрокове завдання.\n"
            "- Збережи розділ 'Домашнє завдання' після 'Хід уроку' і не змінюй порядок інших розділів.\n"
        )
    system_instruction = (
        "Ти редактор педагогічних матеріалів НУШ. Виправ слабкі місця, але збережи порядок розділів. "
        "Поверни лише фінальний текст конспекту без передмов, коментарів і службових фраз."
    )
    prompt = f"""
Відредагуй чернетку конспекту мінімальними точковими правками:
- Предмет: {subject}
- Клас: {grade}
- Тема: {topic}
- Побажання: {requirements}

Обов'язкові обмеження:
1) Не переписуй увесь документ з нуля, якщо можна виправити точково.
2) Прибери meta-фрази й assistant-talk.
3) Збережи офіційний тон учительського конспекту.
4) Посиль слабкі місця конкретними прикладами, числами, словами, реченнями, вправами і діями.
5) Якщо мета уроку загальна, заміни її на конкретну за темою.
6) Для вузьких тем збережи прямий фокус на темі.
7) Строго дотримуйся структури та порядку розділів. Не переставляй розділи місцями.
8) Забезпеч такий порядок головних розділів:
   Тема уроку; Клас; Предмет; Тип уроку; Мета уроку; Очікувані результати; Обладнання та матеріали; Хід уроку; Домашнє завдання.
9) "Хід уроку" має бути після "Обладнання та матеріали" і перед "Домашнє завдання". Не перенось "Хід уроку" в кінець.
10) Усередині "Хід уроку" збережи або додай етапи:
   Організаційний момент; Актуалізація опорних знань; Мотивація навчальної діяльності; Вивчення нового матеріалу; Закріплення знань; Підсумок уроку.
11) У кожному етапі мають бути конкретні рядки:
   Учитель: ...
   Учні: ...
   Завдання/вправа: ...
12) Не перетворюй конспект на діалог; тримай стислий стиль учительської нотатки.
13) Уникай надмірного повтору: "Пригадайте", "Спробуйте", "Що помітили".
14) У "Вивчення нового матеріалу" поясни один раз чітко; у "Закріплення знань" дай практику без дублювання пояснення.
15) У "Підсумок уроку" додай коротке узагальнення вивченого і правила/способу дії.
16) Поверни лише фінальний текст українською мовою.
17) Не додавай шаблонні фрази: "Сьогодні ми...", "Доброго дня...", "Молодці".
18) Не пиши загальні фрази без конкретики і не залишай абстрактні завдання типу "обговорити тему".
19) Якщо бачиш "формувати вміння", "розвивати мислення", "ознайомити учнів", "закріпити знання" або подібні фрази без конкретної дії, заміни їх предметним завданням.
20) Кожне "Завдання/вправа" має містити конкретний зміст: числа/вирази, слова/речення, текст/героя, дослід/спостереження або покрокову дію.
21) Кожне ключове завдання має бути прив'язане до теми уроку. Не залишай загальні вправи з предмета, якщо вони не тренують саме заявлену тему.
22) Для математики добирай числа й вирази саме за темою; для мови - слова, речення й мовні приклади саме за темою; для ЯДС - спостереження, дослід або практичну дію саме за темою.
23) "Домашнє завдання" має бути конкретним: не залишай "виконати вправу/завдання", "опрацювати матеріал", "повторити тему" або "завдання за підручником" без прикладів, слів, речень, запитань, досліду чи покрокової інструкції.

{topic_focus_block}
{artifact_cleanup_block}
{structure_repair_block}
{weak_methodical_block}
{weak_role_targets_block}
{weak_role_block}
{homework_block}

Чернетка:
{draft_text}
""".strip()
    return system_instruction, prompt


def build_prompt_diagnostics(*, references: list[dict], prompt: str) -> dict:
    return {
        "references_count": len(references),
        "reference_titles": [str(item.get("title") or "") for item in references],
        "prompt_chars": len(prompt or ""),
        "prompt_lines": (prompt or "").count("\n") + 1 if prompt else 0,
    }
