"""SQLAlchemy models for ReUnite AI."""
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean,
    DateTime, ForeignKey, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..core.database import Base


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    unknown = "unknown"
    other = "other"


class ReportType(str, enum.Enum):
    missing = "missing"   # Situation A – searching for someone
    found = "found"       # Situation B – found someone


class ReportStatus(str, enum.Enum):
    active = "active"
    closed = "closed"
    pending_review = "pending_review"
    reunited = "reunited"


class MatchStatus(str, enum.Enum):
    suggested = "suggested"
    confirmed = "confirmed"
    rejected = "rejected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reports = relationship("Report", back_populates="submitter")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(SAEnum(ReportType), nullable=False)
    status = Column(SAEnum(ReportStatus), default=ReportStatus.active)

    # Basic info
    person_name = Column(String(255), nullable=True)  # may not be known for found
    approximate_age_min = Column(Integer, nullable=True)
    approximate_age_max = Column(Integer, nullable=True)
    gender = Column(SAEnum(Gender), default=Gender.unknown)

    # Physical description
    height_cm_min = Column(Integer, nullable=True)
    height_cm_max = Column(Integer, nullable=True)
    build = Column(String(100), nullable=True)
    hair_color = Column(String(100), nullable=True)
    eye_color = Column(String(100), nullable=True)
    skin_tone = Column(String(100), nullable=True)
    distinguishing_features = Column(Text, nullable=True)
    clothing_description = Column(Text, nullable=True)

    # Location / time
    location_description = Column(String(500), nullable=True)
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)
    incident_date = Column(DateTime, nullable=True)

    # Additional info
    additional_info = Column(Text, nullable=True)
    is_public = Column(Boolean, default=True)

    # Submitter details (contact stored separately for privacy)
    submitter_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    contact_name = Column(String(255), nullable=True)
    contact_phone = Column(String(30), nullable=True)
    contact_email = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    submitter = relationship("User", back_populates="reports")
    photos = relationship("Photo", back_populates="report", cascade="all, delete-orphan")
    matches_as_source = relationship(
        "Match",
        foreign_keys="Match.missing_report_id",
        back_populates="missing_report",
        cascade="all, delete-orphan",
    )
    matches_as_target = relationship(
        "Match",
        foreign_keys="Match.found_report_id",
        back_populates="found_report",
        cascade="all, delete-orphan",
    )


class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=True)
    content_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    report = relationship("Report", back_populates="photos")


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    missing_report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    found_report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    score = Column(Float, nullable=False)  # 0.0 – 1.0
    match_details = Column(JSON, nullable=True)  # breakdown of match factors
    status = Column(SAEnum(MatchStatus), default=MatchStatus.suggested)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    missing_report = relationship(
        "Report", foreign_keys=[missing_report_id], back_populates="matches_as_source"
    )
    found_report = relationship(
        "Report", foreign_keys=[found_report_id], back_populates="matches_as_target"
    )
