"""Match routes: list, view, update status, and trigger re-matching."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from ...core.database import get_db
from ...core.security import get_current_active_user, get_current_admin
from ...models.user import User, Match, Report, MatchStatus
from ...schemas.schemas import MatchOut, MatchUpdate, PaginatedMatches
from ...services.matching import run_matching_for_report

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("/", response_model=PaginatedMatches)
def list_matches(
    status: Optional[MatchStatus] = None,
    min_score: float = Query(0.0, ge=0.0, le=1.0),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Returns matches relevant to the current user's reports.
    Admins see all matches.
    """
    q = (
        db.query(Match)
        .options(
            joinedload(Match.missing_report).joinedload(Report.photos),
            joinedload(Match.found_report).joinedload(Report.photos),
        )
        .filter(Match.score >= min_score)
    )

    if not current_user.is_admin:
        from ...models.user import Report as R
        user_report_ids = [
            r[0] for r in db.query(R.id).filter(R.submitter_id == current_user.id).all()
        ]
        q = q.filter(
            (Match.missing_report_id.in_(user_report_ids)) |
            (Match.found_report_id.in_(user_report_ids))
        )

    if status:
        q = q.filter(Match.status == status)

    total = q.count()
    items = (
        q.order_by(Match.score.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    pages = (total + page_size - 1) // page_size
    return {"items": items, "total": total, "page": page, "pages": pages}


@router.get("/admin/all", response_model=PaginatedMatches)
def admin_list_matches(
    status: Optional[MatchStatus] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    q = db.query(Match).options(
        joinedload(Match.missing_report).joinedload(Report.photos),
        joinedload(Match.found_report).joinedload(Report.photos),
    )
    if status:
        q = q.filter(Match.status == status)
    total = q.count()
    items = q.order_by(Match.score.desc()).offset((page - 1) * page_size).limit(page_size).all()
    pages = (total + page_size - 1) // page_size
    return {"items": items, "total": total, "page": page, "pages": pages}


@router.get("/{match_id}", response_model=MatchOut)
def get_match(
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    match = db.query(Match).options(
        joinedload(Match.missing_report).joinedload(Report.photos),
        joinedload(Match.found_report).joinedload(Report.photos),
    ).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")
    return match


@router.patch("/{match_id}", response_model=MatchOut)
def update_match(
    match_id: int,
    payload: MatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")
    match.status = payload.status
    match.reviewed_by_id = current_user.id
    db.commit()
    db.refresh(match)
    return match


@router.post("/rematch/{report_id}")
def rematch(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from ...models.user import Report
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.submitter_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Not authorized")
    matches = run_matching_for_report(report, db)
    return {"message": f"Re-matching complete. {len(matches)} new match(es) found."}
