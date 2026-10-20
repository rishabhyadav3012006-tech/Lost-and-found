"""Reports CRUD routes with photo upload."""
import os
import uuid
from typing import Optional
from datetime import datetime
from fastapi import (
    APIRouter, Depends, HTTPException, status,
    UploadFile, File, Form, Query
)
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from ...core.database import get_db
from ...core.security import get_current_active_user, get_optional_user
from ...core.config import settings
from ...models.user import User, Report, Photo, ReportType, ReportStatus, Gender
from ...schemas.schemas import (
    ReportCreate, ReportUpdate, ReportOut, ReportListItem, PaginatedReports
)
from ...services.matching import run_matching_for_report

router = APIRouter(prefix="/reports", tags=["reports"])


def _save_photo(file: UploadFile) -> Photo:
    """Validate and save uploaded photo. Returns Photo ORM (not yet committed)."""
    if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, f"Invalid file type: {file.content_type}")
    content = file.file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(400, "File too large (max 5 MB)")
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    save_path = settings.UPLOAD_DIR / filename
    save_path.parent.mkdir(parents=True, exist_ok=True)
    with open(save_path, "wb") as f:
        f.write(content)
    return Photo(
        filename=filename,
        original_filename=file.filename,
        content_type=file.content_type,
    )


# ─── Create Report ────────────────────────────────────────────────────────────

@router.post("/", response_model=ReportOut, status_code=201)
async def create_report(
    report_type: ReportType = Form(...),
    person_name: Optional[str] = Form(None),
    approximate_age_min: Optional[int] = Form(None),
    approximate_age_max: Optional[int] = Form(None),
    gender: Gender = Form(Gender.unknown),
    height_cm_min: Optional[int] = Form(None),
    height_cm_max: Optional[int] = Form(None),
    build: Optional[str] = Form(None),
    hair_color: Optional[str] = Form(None),
    eye_color: Optional[str] = Form(None),
    skin_tone: Optional[str] = Form(None),
    distinguishing_features: Optional[str] = Form(None),
    clothing_description: Optional[str] = Form(None),
    location_description: Optional[str] = Form(None),
    location_lat: Optional[float] = Form(None),
    location_lng: Optional[float] = Form(None),
    incident_date: Optional[str] = Form(None),
    additional_info: Optional[str] = Form(None),
    # Parsed manually: newer FastAPI reads an absent bool form field as False,
    # which made every report submitted from the website private.
    is_public: Optional[str] = Form(None),
    contact_name: Optional[str] = Form(None),
    contact_phone: Optional[str] = Form(None),
    contact_email: Optional[str] = Form(None),
    photos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    inc_date = None
    if incident_date:
        try:
            inc_date = datetime.fromisoformat(incident_date)
        except ValueError:
            pass

    report = Report(
        report_type=report_type,
        person_name=person_name,
        approximate_age_min=approximate_age_min,
        approximate_age_max=approximate_age_max,
        gender=gender,
        height_cm_min=height_cm_min,
        height_cm_max=height_cm_max,
        build=build,
        hair_color=hair_color,
        eye_color=eye_color,
        skin_tone=skin_tone,
        distinguishing_features=distinguishing_features,
        clothing_description=clothing_description,
        location_description=location_description,
        location_lat=location_lat,
        location_lng=location_lng,
        incident_date=inc_date,
        additional_info=additional_info,
        is_public=(is_public or "true").strip().lower() not in ("false", "0", "off", "no"),
        contact_name=contact_name,
        contact_phone=contact_phone,
        contact_email=contact_email,
        submitter_id=current_user.id if current_user else None,
    )
    db.add(report)
    db.flush()  # get report.id

    for photo_file in photos:
        if photo_file.filename:
            photo = _save_photo(photo_file)
            photo.report_id = report.id
            db.add(photo)

    db.commit()
    db.refresh(report)

    # Run matching in background (synchronous for simplicity)
    run_matching_for_report(report, db)
    db.refresh(report)

    return report


# ─── List Reports ─────────────────────────────────────────────────────────────

@router.get("/", response_model=PaginatedReports)
def list_reports(
    report_type: Optional[ReportType] = None,
    status: Optional[ReportStatus] = None,
    gender: Optional[Gender] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(Report).options(joinedload(Report.photos))

    if report_type:
        q = q.filter(Report.report_type == report_type)
    if status:
        q = q.filter(Report.status == status)
    else:
        q = q.filter(Report.status == ReportStatus.active)
    if gender and gender != Gender.unknown:
        q = q.filter(Report.gender == gender)
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Report.person_name.ilike(term),
                Report.location_description.ilike(term),
                Report.clothing_description.ilike(term),
                Report.distinguishing_features.ilike(term),
                Report.additional_info.ilike(term),
            )
        )

    q = q.filter(Report.is_public == True)
    total = q.count()
    items = q.order_by(Report.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    pages = (total + page_size - 1) // page_size

    return {"items": items, "total": total, "page": page, "pages": pages}


@router.get("/my", response_model=list[ReportOut])
def my_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return (
        db.query(Report)
        .options(joinedload(Report.photos))
        .filter(Report.submitter_id == current_user.id)
        .order_by(Report.created_at.desc())
        .all()
    )


@router.get("/{report_id}", response_model=ReportOut)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    report = (
        db.query(Report)
        .options(joinedload(Report.photos))
        .filter(Report.id == report_id)
        .first()
    )
    is_owner_or_admin = current_user is not None and (
        current_user.is_admin or report is not None and report.submitter_id == current_user.id
    )
    if not report or (not report.is_public and not is_owner_or_admin):
        raise HTTPException(404, "Report not found")
    out = ReportOut.model_validate(report)
    if current_user is None:
        # Contact details are only shown to signed-in users
        out.contact_name = out.contact_phone = out.contact_email = None
    return out


@router.patch("/{report_id}", response_model=ReportOut)
def update_report(
    report_id: int,
    payload: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.submitter_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Not authorized")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(report, field, value)
    db.commit()
    # Descriptions or status may have changed, so refresh suggested matches
    run_matching_for_report(report, db)
    db.refresh(report)
    return report


@router.delete("/{report_id}", status_code=204)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.submitter_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Not authorized")
    db.delete(report)
    db.commit()


@router.post("/{report_id}/photos", response_model=ReportOut)
async def add_photos(
    report_id: int,
    photos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.submitter_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Not authorized")
    for photo_file in photos:
        if photo_file.filename:
            photo = _save_photo(photo_file)
            photo.report_id = report.id
            db.add(photo)
    db.commit()
    db.refresh(report)
    return report
