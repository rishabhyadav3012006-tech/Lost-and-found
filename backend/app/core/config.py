import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings:
    PROJECT_NAME: str = "ReUnite AI"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    # ─── Database ────────────────────────────────────────────────────────────
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/reunite.db")

    # ─── JWT ─────────────────────────────────────────────────────────────────
    # In production, set SECRET_KEY in your .env or environment
    SECRET_KEY: str = os.getenv("SECRET_KEY", "reunite-ai-production-secret-key-replace-with-env-secret-32b")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # ─── File uploads ─────────────────────────────────────────────────────────
    UPLOAD_DIR: Path = BASE_DIR / "uploads" / "photos"
    MAX_FILE_SIZE: int = 5 * 1024 * 1024  # 5 MB
    ALLOWED_IMAGE_TYPES: list = ["image/jpeg", "image/png", "image/webp", "image/gif"]

    # ─── CORS ────────────────────────────────────────────────────────────────
    # In production set ALLOWED_ORIGINS in .env as a comma-separated list:
    #   ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
    @property
    def ALLOWED_ORIGINS(self) -> list:
        env_val = os.getenv("ALLOWED_ORIGINS", "")
        if env_val:
            return [o.strip() for o in env_val.split(",") if o.strip()]
        # Development fallback
        return [
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "http://localhost:3000",
            "null",  # allow file:// opened pages
        ]

    # ─── Matching ─────────────────────────────────────────────────────────────
    MATCH_SCORE_THRESHOLD: float = 0.3

    # ─── Email / SMTP ──────────────────────────────────────────────────────────
    # Set EMAIL_ENABLED=true and provide SMTP_* vars in .env to enable emails.
    EMAIL_ENABLED: bool = os.getenv("EMAIL_ENABLED", "false").lower() == "true"
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "ReUnite AI")
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "")

    # ─── App URL ──────────────────────────────────────────────────────────────
    APP_URL: str = os.getenv("APP_URL", "http://localhost:8000")

    # ─── Debug ────────────────────────────────────────────────────────────────
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

settings = Settings()
