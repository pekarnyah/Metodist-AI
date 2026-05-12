from collections import Counter, defaultdict


class LessonStructureAnalyzer:
    HEADER_PRIORITY = ['Дата', 'Клас', 'Предмет', 'Тема', 'Мета', 'Обладнання', 'Тип уроку', 'Освітня галузь']

    @staticmethod
    def _unique_in_order(items):
        seen = set()
        result = []
        for item in items:
            if not item or item in seen:
                continue
            seen.add(item)
            result.append(item)
        return result

    @staticmethod
    def _ordered_common(sequences, limit):
        counter = Counter()
        positions = defaultdict(list)

        for sequence in sequences:
            seen = set()
            for index, item in enumerate(sequence):
                if not item or item in seen:
                    continue
                counter[item] += 1
                positions[item].append(index)
                seen.add(item)

        ranked = sorted(
            counter.keys(),
            key=lambda item: (-counter[item], sum(positions[item]) / len(positions[item]), item.lower()),
        )
        return ranked[:limit]

    @staticmethod
    def _truncate(text: str, limit: int = 180) -> str:
        text = ' '.join(str(text or '').split())
        if len(text) <= limit:
            return text
        return f"{text[:limit - 1].rstrip()}…"

    @staticmethod
    def _collect_primary_examples(parsed_doc):
        section_examples = []
        stage_examples = []

        header_map = {item['label']: item['value'] for item in parsed_doc.get('header_fields', []) if item.get('value')}
        for label in ['Мета', 'Обладнання', 'Тип уроку']:
            value = header_map.get(label)
            if value:
                section_examples.append((label, [LessonStructureAnalyzer._truncate(value)]))

        for section in parsed_doc.get('sections', []):
            title = section.get('title')
            if not title or title == 'Хід уроку':
                continue
            items = [LessonStructureAnalyzer._truncate(item) for item in section.get('items', [])[:2] if item]
            if items:
                section_examples.append((title, items))

        for stage in parsed_doc.get('stages', [])[:6]:
            title = stage.get('title')
            items = [LessonStructureAnalyzer._truncate(item) for item in stage.get('items', [])[:3] if item]
            if title and items:
                stage_examples.append((title, items))

        return section_examples[:6], stage_examples[:6]

    @staticmethod
    def get_structure(parsed_docs):
        if not parsed_docs:
            return (
                'Шаблони не знайдено. Використай стандартну логіку НУШ із чіткими розділами та послідовним ходом уроку.'
            )

        primary = parsed_docs[0]

        primary_header = [item.get('label') for item in primary.get('header_fields', [])]
        primary_sections = [item.get('title') for item in primary.get('sections', [])]
        primary_stages = [item.get('title') for item in primary.get('stages', [])]

        all_header_sequences = [[item.get('label') for item in doc.get('header_fields', [])] for doc in parsed_docs]
        all_section_sequences = [[item.get('title') for item in doc.get('sections', [])] for doc in parsed_docs]
        all_stage_sequences = [[item.get('title') for item in doc.get('stages', [])] for doc in parsed_docs]

        common_headers = LessonStructureAnalyzer._ordered_common(all_header_sequences, 10)
        common_sections = LessonStructureAnalyzer._ordered_common(all_section_sequences, 10)
        common_stages = LessonStructureAnalyzer._ordered_common(all_stage_sequences, 12)

        header_order = LessonStructureAnalyzer._unique_in_order(primary_header + common_headers)
        header_order = [item for item in LessonStructureAnalyzer.HEADER_PRIORITY if item in header_order] + [
            item for item in header_order if item not in LessonStructureAnalyzer.HEADER_PRIORITY
        ]
        section_order = LessonStructureAnalyzer._unique_in_order(primary_sections + common_sections)
        stage_order = LessonStructureAnalyzer._unique_in_order(primary_stages + common_stages)

        section_examples, stage_examples = LessonStructureAnalyzer._collect_primary_examples(primary)

        lines = [
            'ОБОВ\'ЯЗКОВО будуй документ на основі шаблонів із base_docs, а не лише за загальною логікою НУШ.',
            f"Основний шаблон-орієнтир: {primary.get('file_name', 'невідомий шаблон')}",
            'Адаптуй зміст під нову тему, але зберігай порядок блоків, назви етапів і рівень деталізації, близький до шаблону.',
        ]

        if header_order:
            lines.append('')
            lines.append('Типова шапка документа:')
            lines.extend(f'{index}. {item}' for index, item in enumerate(header_order, start=1))

        if section_order:
            lines.append('')
            lines.append('Типові основні розділи документа:')
            lines.extend(f'{index}. {item}' for index, item in enumerate(section_order, start=1))

        if stage_order:
            lines.append('')
            lines.append('Типові етапи ходу уроку:')
            lines.extend(f'{index}. {item}' for index, item in enumerate(stage_order, start=1))

        if section_examples:
            lines.append('')
            lines.append('Приклади подачі матеріалу з основного шаблону:')
            for title, items in section_examples:
                lines.append(f'[{title}]')
                lines.extend(f'- {item}' for item in items)

        if stage_examples:
            lines.append('')
            lines.append('Приклади наповнення етапів з основного шаблону:')
            for title, items in stage_examples:
                lines.append(f'[{title}]')
                lines.extend(f'- {item}' for item in items)

        lines.append('')
        lines.append('Формуй lesson_flow максимально близько до цих етапів і способу подачі матеріалу.')
        return '\n'.join(lines)
