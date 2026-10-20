"""Pydantic schemas for ReUnite AI API."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, field_validator
from ..models.user import Gender, ReportType, ReportStatus, MatchStatus


# ─── Auth ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    phone: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    is_active: bool
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ─── Reports ─────────────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    report_type: ReportType
    person_name: Optional[str] = None
    approximate_age_min: Optional[int] = None
    approximate_age_max: Optional[int] = None
    gender: Gender = Gender.unknown
    height_cm_min: Optional[int] = None
    height_cm_max: Optional[int] = None
    build: Optional[str] = None
    hair_color: Optional[str] = None
    eye_color: Optional[str] = None
    skin_tone: Optional[str] = None
    distinguishing_features: Optional[str] = None
    clothing_description: Optional[str] = None
    location_description: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    incident_date: Optional[datetime] = None
    additional_info: Optional[str] = None
    is_public: bool = True
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None


class ReportUpdate(BaseModel):
    person_name: Optional[str] = None
    approximate_age_min: Optional[int] = None
    approximate_age_max: Optional[int] = None
    gender: Optional[Gender] = None
    height_cm_min: Optional[int] = None
    height_cm_max: Optional[int] = None
    build: Optional[str] = None
    hair_color: Optional[str] = None
    eye_color: Optional[str] = None
    skin_tone: Optional[str] = None
    distinguishing_features: Optional[str] = None
    clothing_description: Optional[str] = None
    location_description: Optional[str] = None
    incident_date: Optional[datetime] = None
    additional_info: Optional[str] = None
    is_public: Optional[bool] = None
    status: Optional[ReportStatus] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None


class PhotoOut(BaseModel):
    id: int
    filename: str
    original_filename: Optional[str] = None
    model_config = {"from_attributes": True}


class ReportOut(BaseModel):
    id: int
    report_type: ReportType
    status: ReportStatus
    person_name: Optional[str] = None
    approximate_age_min: Optional[int] = None
    approximate_age_max: Optional[int] = None
    gender: Gender
    height_cm_min: Optional[int] = None
    height_cm_max: Optional[int] = None
    build: Optional[str] = None
    hair_color: Optional[str] = None
    eye_color: Optional[str] = None
    skin_tone: Optional[str] = None
    distinguishing_features: Optional[str] = None
    clothing_description: Optional[str] = None
    location_description: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    incident_date: Optional[datetime] = None
    additional_info: Optional[str] = None
    is_public: bool
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    submitter_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    photos: List[PhotoOut] = []

    model_config = {"from_attributes": True}


class ReportListItem(BaseModel):
    id: int
    report_type: ReportType
    status: ReportStatus
    person_name: Optional[str] = None
    approximate_age_min: Optional[int] = None
    approximate_age_max: Optional[int] = None
    gender: Gender
    location_description: Optional[str] = None
    incident_date: Optional[datetime] = None
    created_at: datetime
    photos: List[PhotoOut] = []

    model_config = {"from_attributes": True}


# ─── Matches ─────────────────────────────────────────────────────────────────

class MatchOut(BaseModel):
    id: int
    missing_report_id: int
    found_report_id: int
    score: float
    match_details: Optional[dict] = None
    status: MatchStatus
    created_at: datetime
    missing_report: Optional[ReportListItem] = None
    found_report: Optional[ReportListItem] = None

    model_config = {"from_attributes": True}


class MatchUpdate(BaseModel):
    status: MatchStatus


# ─── Pagination ──────────────────────────────────────────────────────────────

class PaginatedReports(BaseModel):
    items: List[ReportListItem]
    total: int
    page: int
    pages: int


class PaginatedMatches(BaseModel):
    items: List[MatchOut]
    total: int
    page: int
    pages: int
