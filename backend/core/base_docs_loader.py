from pathlib import Path
import re


class BaseDocsLoader:
    MASTER_TEMPLATE_HINTS = (
        '00_master',
        'master',
        'template',
        'шаблон',
        'еталон',
        'основа',
    )

    SUBJECT_MAP = {
        'математика': 'Math',
        'math': 'Math',
        'mathematics': 'Math',
        'українськамова': 'UkrMova',
        'укрмова': 'UkrMova',
        'украинскаямова': 'UkrMova',
        'ukrmova': 'UkrMova',
        'ukrainianlanguage': 'UkrMova',
        'українськалітература': 'UkrLit',
        'укрліт': 'UkrLit',
        'укрлит': 'UkrLit',
        'украинскаялитература': 'UkrLit',
        'ukrlit': 'UkrLit',
        'ukrainianliterature': 'UkrLit',
        'ядс': 'YADS',
        'yads': 'YADS',
        'ядосліджуюсвіт': 'YADS',
        'ядосліджуюсвит': 'YADS',
        'досліджуюсвіт': 'YADS',
        'досліджуюсвит': 'YADS',
        'ядосліджуюсвітінтегрованийкурс': 'YADS',
        'інтегрованийкурсядосліджуюсвіт': 'YADS',
        'integratedcourseyads': 'YADS',
        'integratedcourse': 'YADS',
        'naturalscienceintegrated': 'YADS',
    }
    SUBJECT_CONTAINS_HINTS = {
        'Math': (
            'математ',
            'math',
            'algebra',
            'geometry',
            'геометр',
        ),
        'UkrMova': (
            'українськамов',
            'укрмова',
            'ukrainianlanguage',
            'languagearts',
            'мова',
        ),
        'UkrLit': (
            'українськалітератур',
            'укрліт',
            'ukrainianliterature',
            'literature',
            'читання',
        ),
        'YADS': (
            'ядс',
            'досліджуюсвіт',
            'досліджуюсвит',
            'інтегрован',
            'integrated',
            'natural',
            'science',
            'довкілля',
            'пізнаємоприроду',
        ),
    }

    def __init__(self, base_dir: str | None = None):
        if base_dir:
            self.base_dir = Path(base_dir)
        else:
            self.base_dir = Path(__file__).resolve().parents[1] / 'base_docs'

    @staticmethod
    def _normalize_subject(subject: str) -> str:
        return re.sub(r'[^a-zA-Zа-яА-ЯіїєІЇЄґҐ]+', '', str(subject or '').strip().lower())

    def resolve_subject(self, subject: str) -> dict:
        normalized_key = self._normalize_subject(subject)
        canonical = self.SUBJECT_MAP.get(normalized_key)
        match_mode = 'exact'
        matched_hint = ''

        if not canonical:
            for folder, hints in self.SUBJECT_CONTAINS_HINTS.items():
                for hint in hints:
                    if hint in normalized_key:
                        canonical = folder
                        match_mode = 'contains'
                        matched_hint = hint
                        break
                if canonical:
                    break

        folder_path = (self.base_dir / canonical) if canonical else None
        if folder_path and not folder_path.exists():
            folder_path = None

        return {
            'input': str(subject or ''),
            'normalized_key': normalized_key,
            'canonical': canonical,
            'folder': str(folder_path) if folder_path else None,
            'match_mode': match_mode if canonical else 'none',
            'matched_hint': matched_hint,
        }

    @staticmethod
    def _extract_grade_digits(grade: str) -> set[str]:
        return set(re.findall(r'\d+', str(grade or '')))

    @staticmethod
    def _parse_requested_grade(grade_digits: set[str]) -> int | None:
        numeric = sorted(int(item) for item in grade_digits if str(item).isdigit())
        return numeric[0] if numeric else None

    def _resolve_subject_dir(self, subject: str) -> Path | None:
        resolved = self.resolve_subject(subject)
        folder = resolved.get('canonical')
        if not folder:
            return None
        path = self.base_dir / folder
        return path if path.exists() else None

    @staticmethod
    def _dedupe_paths(paths: list[Path]) -> list[Path]:
        seen = set()
        unique: list[Path] = []
        for path in paths:
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            unique.append(path)
        return unique

    def _find_grade_dirs(self, subject_dir: Path, grade_digits: set[str]) -> list[Path]:
        if not grade_digits:
            return []

        matched: list[Path] = []
        for child in subject_dir.iterdir():
            if not child.is_dir():
                continue
            folder_digits = set(re.findall(r'\d+', child.name))
            if grade_digits & folder_digits:
                matched.append(child)

        return sorted(matched, key=lambda path: path.name.lower())

    @classmethod
    def _normalize_filename(cls, value: str) -> str:
        return re.sub(r'[^a-zA-Zа-яА-ЯіїєІЇЄґҐ0-9]+', '', str(value or '').strip().lower())

    @classmethod
    def _is_master_template(cls, path: Path) -> bool:
        normalized_stem = cls._normalize_filename(path.stem)
        return any(hint in normalized_stem for hint in cls.MASTER_TEMPLATE_HINTS)

    @classmethod
    def _sort_docs(cls, paths: list[Path], grade_digits: set[str]) -> list[Path]:
        def score(path: Path) -> tuple[int, int, str]:
            normalized_name = path.name.lower()
            has_grade_match = any(digit in normalized_name for digit in grade_digits) if grade_digits else False
            return (
                0 if cls._is_master_template(path) else 1,
                0 if has_grade_match else 1,
                normalized_name,
            )

        return sorted(paths, key=score)

    @staticmethod
    def _extract_grade_candidates(path: Path) -> list[int]:
        candidates: list[int] = []
        # Closer path parts are stronger signals than distant ones.
        for part in reversed(path.parts):
            matches = re.findall(r'\d+', part)
            if matches:
                candidates.extend(int(item) for item in matches if item.isdigit())
                break
        return candidates

    def _sort_docs_with_grade_fallback(
        self,
        paths: list[Path],
        grade_digits: set[str],
        requested_grade: int | None,
    ) -> list[Path]:
        def score(path: Path) -> tuple[int, int, int, int, str]:
            normalized_name = path.name.lower()
            has_grade_match = any(digit in normalized_name for digit in grade_digits) if grade_digits else False

            candidates = self._extract_grade_candidates(path)
            if requested_grade is None:
                missing_grade = 0
                distance = 0
            elif not candidates:
                missing_grade = 1
                distance = 99
            else:
                missing_grade = 0
                distance = min(abs(candidate - requested_grade) for candidate in candidates)

            return (
                0 if self._is_master_template(path) else 1,
                0 if has_grade_match else 1,
                missing_grade,
                distance,
                normalized_name,
            )

        return sorted(paths, key=score)

    def get_master_template(self, subject: str, grade: str = '') -> Path | None:
        docs = self.load_docs_for_subject(subject, grade)
        return docs[0] if docs else None

    def load_docs_for_subject(self, subject: str, grade: str = '', limit: int = 12) -> list[Path]:
        subject_dir = self._resolve_subject_dir(subject)
        if not subject_dir:
            return []

        grade_digits = self._extract_grade_digits(grade)
        requested_grade = self._parse_requested_grade(grade_digits)
        grade_dirs = self._find_grade_dirs(subject_dir, grade_digits)

        docs: list[Path] = []
        if grade_dirs:
            for grade_dir in grade_dirs:
                docs.extend(self._sort_docs(list(grade_dir.rglob('*.docx')), grade_digits))

        if not docs:
            recursive_docs = list(subject_dir.rglob('*.docx'))
            if recursive_docs:
                docs = self._sort_docs_with_grade_fallback(
                    recursive_docs,
                    grade_digits=grade_digits,
                    requested_grade=requested_grade,
                )
            else:
                docs = self._sort_docs(list(subject_dir.glob('*.docx')), grade_digits)

        return self._dedupe_paths(docs)[: max(1, limit)]
