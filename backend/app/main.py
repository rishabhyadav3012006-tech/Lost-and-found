"""
ReUnite AI – FastAPI Application Entry Point
"""
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .core.config import settings
from .core.database import engine, Base
from .api import api_router

# ─── Create tables ────────────────────────────────────────────────────────────
# Import all models so Base knows about them before create_all
from .models import User, Report, Photo, Match  # noqa: F401

Base.metadata.create_all(bind=engine)

# ─── Ensure upload dir exists ─────────────────────────────────────────────────
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Smart Lost & Found Family Reunification Platform",
    # Disable interactive docs in production for security
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
)

# ─── Security Headers Middleware ─────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── API Routes ──────────────────────────────────────────────────────────────
app.include_router(api_router, prefix=settings.API_PREFIX)

# ─── Serve uploaded photos ───────────────────────────────────────────────────
# UPLOAD_DIR points to backend/uploads/photos/ — mount its parent so files are
# accessible at /uploads/photos/<filename> which matches photoUrl() in frontend.
UPLOAD_PARENT = settings.UPLOAD_DIR.parent  # backend/uploads/
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_PARENT)), name="uploads")

# ─── Health check ────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "version": settings.VERSION}


# ─── Serve frontend ──────────────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/src", StaticFiles(directory=str(FRONTEND_DIR / "src")), name="src")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "src")), name="static_src")
    app.mount("/public", StaticFiles(directory=str(FRONTEND_DIR / "public")), name="public")

    @app.get("/", response_class=FileResponse)
    async def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/{full_path:path}", response_class=FileResponse)
    async def serve_spa(full_path: str, request: Request):
        """Serve frontend for all non-API routes (SPA fallback)."""
        # Don't intercept API routes — return 404 for unmatched /api/* paths
        if full_path.startswith("api/"):
            from fastapi import Response
            return Response(status_code=404)
        index_path = FRONTEND_DIR / "index.html"
        return FileResponse(str(index_path))
