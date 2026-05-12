import re

SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def sanitize_filename(name: str, default: str = "file") -> str:
    if not name:
        return default
    cleaned = name.strip().replace("\x00", "")
    cleaned = cleaned.replace("\\", "_").replace("/", "_")
    cleaned = SAFE_FILENAME_RE.sub("_", cleaned).strip("._")
    if not cleaned:
        cleaned = default
    return cleaned[:120]
