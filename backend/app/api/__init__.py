from fastapi import APIRouter
from .routes import auth, reports, matches, admin

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(reports.router)
api_router.include_router(matches.router)
api_router.include_router(admin.router)
