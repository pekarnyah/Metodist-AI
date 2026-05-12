import os
import smtplib
from email.message import EmailMessage


class SupportMailConfigError(RuntimeError):
    pass


def is_smtp_configured() -> bool:
    required = [
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
        "SMTP_FROM_EMAIL",
    ]
    return all((os.getenv(key) or "").strip() for key in required)


def _smtp_config() -> dict:
    host = (os.getenv("SMTP_HOST") or "").strip()
    port_raw = (os.getenv("SMTP_PORT") or "").strip()
    username = (os.getenv("SMTP_USERNAME") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    from_email = (os.getenv("SMTP_FROM_EMAIL") or "").strip()
    from_name = (os.getenv("SMTP_FROM_NAME") or "Metodist Support").strip()

    missing = [
        key
        for key, value in {
            "SMTP_HOST": host,
            "SMTP_PORT": port_raw,
            "SMTP_USERNAME": username,
            "SMTP_PASSWORD": password,
            "SMTP_FROM_EMAIL": from_email,
        }.items()
        if not value
    ]
    if missing:
        raise SupportMailConfigError(f"SMTP is not configured: missing {', '.join(missing)}")

    try:
        port = int(port_raw)
    except ValueError as exc:
        raise SupportMailConfigError("SMTP_PORT must be an integer") from exc

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "from_email": from_email,
        "from_name": from_name,
    }


def send_support_email(*, to_email: str, subject: str, message: str) -> None:
    cfg = _smtp_config()
    email = EmailMessage()
    email["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    email["To"] = to_email
    email["Subject"] = subject
    email.set_content(message, subtype="plain", charset="utf-8")

    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as smtp:
        smtp.starttls()
        smtp.login(cfg["username"], cfg["password"])
        smtp.send_message(email)
