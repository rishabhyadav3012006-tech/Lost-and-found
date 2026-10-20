"""Admin dashboard routes."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from pydantic import BaseModel

from ...core.database import get_db
from ...core.security import get_current_admin
from ...models.user import User, Report, Match, ReportStatus, MatchStatus
from ...schemas.schemas import ReportOut, UserOut, ReportUpdate, PaginatedReports
from ...services.matching import run_matching_for_report

router = APIRouter(prefix="/admin", tags=["admin"])


class StatusUpdate(BaseModel):
    status: ReportStatus


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    from ...models.user import ReportType
    return {
        "total_users": db.query(User).count(),
        "total_reports": db.query(Report).count(),
        "missing_reports": db.query(Report).filter(Report.report_type == ReportType.missing).count(),
        "found_reports": db.query(Report).filter(Report.report_type == ReportType.found).count(),
        "active_reports": db.query(Report).filter(Report.status == ReportStatus.active).count(),
        "reunited_reports": db.query(Report).filter(Report.status == ReportStatus.reunited).count(),
        "total_matches": db.query(Match).count(),
        "confirmed_matches": db.query(Match).filter(Match.status == MatchStatus.confirmed).count(),
        "pending_matches": db.query(Match).filter(Match.status == MatchStatus.suggested).count(),
    }


@router.get("/users", response_model=list[UserOut])
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    return (
        db.query(User)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )


@router.patch("/users/{user_id}/toggle-active", response_model=UserOut)
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current_admin.id:
        raise HTTPException(400, "Cannot deactivate yourself")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/make-admin", response_model=UserOut)
def make_admin(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_admin = True
    db.commit()
    db.refresh(user)
    return user


@router.get("/reports/pending", response_model=list[ReportOut])
def pending_reports(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    return (
        db.query(Report)
        .filter(Report.status == ReportStatus.pending_review)
        .order_by(Report.created_at.desc())
        .all()
    )


@router.get("/reports/all", response_model=PaginatedReports)
def list_all_reports(
    report_type: Optional[str] = None,
    status: Optional[ReportStatus] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Paginated list of ALL reports regardless of is_public or status."""
    from ...models.user import ReportType  # noqa: used only in filter branch
    q = db.query(Report).options(joinedload(Report.photos))
    if report_type:
        q = q.filter(Report.report_type == report_type)
    if status:
        q = q.filter(Report.status == status)
    total = q.count()
    items = (
        q.order_by(Report.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    pages = (total + page_size - 1) // page_size
    return {"items": items, "total": total, "page": page, "pages": pages}


@router.patch("/reports/{report_id}/approve")
def approve_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    report.status = ReportStatus.active
    db.commit()
    run_matching_for_report(report, db)
    return {"message": "Report approved"}


@router.patch("/reports/{report_id}/close")
def close_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    report.status = ReportStatus.closed
    db.commit()
    run_matching_for_report(report, db)
    return {"message": "Report closed"}


@router.patch("/reports/{report_id}/status", response_model=ReportOut)
def set_report_status(
    report_id: int,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Set any status on any report (admin-only). Used for marking reports as
    reunited, active, closed, or pending_review without owner restrictions."""
    report = (
        db.query(Report)
        .options(joinedload(Report.photos))
        .filter(Report.id == report_id)
        .first()
    )
    if not report:
        raise HTTPException(404, "Report not found")
    report.status = payload.status
    db.commit()
    run_matching_for_report(report, db)
    db.refresh(report)
    return report


