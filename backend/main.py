import os
import logging
from pathlib import Path
from logging.handlers import RotatingFileHandler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

from api import endpoints
from db.database import engine
from db import models

def configure_logging():
    os.makedirs("storage/logs", exist_ok=True)
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s")

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers.clear()

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)

    file_handler = RotatingFileHandler(
        "storage/logs/backend.log",
        maxBytes=2 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    root_logger.addHandler(stream_handler)
    root_logger.addHandler(file_handler)

configure_logging()
logger = logging.getLogger(__name__)
logger.info(
    "startup_generation_env env_path=%s GENERATION_TOTAL_TIMEOUT_SEC=%s GENERATION_QUEUE_WAIT_TIMEOUT_SEC=%s GENERATION_QUEUE_MAX_WAITING=%s",
    str(ENV_PATH),
    os.getenv("GENERATION_TOTAL_TIMEOUT_SEC"),
    os.getenv("GENERATION_QUEUE_WAIT_TIMEOUT_SEC"),
    os.getenv("GENERATION_QUEUE_MAX_WAITING"),
)


def ensure_runtime_schema():
    models.Base.metadata.create_all(bind=engine)

    dialect = engine.dialect.name
    boolean_default = "TRUE" if dialect in {"postgresql", "mysql", "mariadb"} else "1"
    datetime_type = "TIMESTAMP" if dialect == "postgresql" else "DATETIME"

    inspector = inspect(engine)
    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    required_user_columns = {
        "telegram_user_id": "ALTER TABLE users ADD COLUMN telegram_user_id VARCHAR",
        "telegram_username": "ALTER TABLE users ADD COLUMN telegram_username VARCHAR",
        "telegram_first_name": "ALTER TABLE users ADD COLUMN telegram_first_name VARCHAR",
        "telegram_linked_at": f"ALTER TABLE users ADD COLUMN telegram_linked_at {datetime_type}",
        "telegram_notifications_enabled": f"ALTER TABLE users ADD COLUMN telegram_notifications_enabled BOOLEAN DEFAULT {boolean_default}",
    }

    with engine.begin() as connection:
        for column_name, statement in required_user_columns.items():
            if column_name not in existing_columns:
                connection.execute(text(statement))
                logger.info("runtime_schema_added_column", extra={"column": column_name, "table": "users"})

    if inspector.has_table("news_posts"):
        news_columns = {column["name"] for column in inspector.get_columns("news_posts")}
        required_news_columns = {
            "image_url": "ALTER TABLE news_posts ADD COLUMN image_url VARCHAR",
        }
        with engine.begin() as connection:
            for column_name, statement in required_news_columns.items():
                if column_name not in news_columns:
                    connection.execute(text(statement))
                    logger.info("runtime_schema_added_column", extra={"column": column_name, "table": "news_posts"})


ensure_runtime_schema()

app = FastAPI(title="METODIST AI API")

allowed_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "")
if allowed_origins_env.strip():
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/avatars/"):
        response.headers["Cache-Control"] = "no-store"
    return response

os.makedirs("storage/avatars", exist_ok=True)
os.makedirs("storage/news", exist_ok=True)
app.mount("/api/avatars", StaticFiles(directory="storage/avatars"), name="avatars")
app.mount("/api/news-media", StaticFiles(directory="storage/news"), name="news-media")

@app.get("/")
async def root():
    return {"status": "online"}


@app.get("/health/live")
async def health_live():
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
    return {"status": "ok"}

app.include_router(endpoints.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
