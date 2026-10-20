"""
Matching Engine for ReUnite AI.

Computes a similarity score (0.0 – 1.0) between a missing-person report
and a found-person report based on overlapping descriptive attributes.

IMPORTANT: A high score is NOT proof of identity. It is a signal for
human review only. The system never claims a match is definitive.
"""
from typing import Optional
import math


def _age_overlap(
    a_min: Optional[int], a_max: Optional[int],
    b_min: Optional[int], b_max: Optional[int],
) -> float:
    """Returns how much two age ranges overlap (0.0 – 1.0)."""
    if None in (a_min, a_max, b_min, b_max):
        return 0.5  # partial credit when data is unknown
    # normalise
    if a_min > a_max:
        a_min, a_max = a_max, a_min
    if b_min > b_max:
        b_min, b_max = b_max, b_min
    overlap = min(a_max, b_max) - max(a_min, b_min)
    span_a = max(a_max - a_min, 1)
    span_b = max(b_max - b_min, 1)
    if overlap <= 0:
        # Gap penalty: score decreases as gap grows
        gap = max(a_min, b_min) - min(a_max, b_max)
        return max(0.0, 1.0 - gap / 20.0)
    return overlap / ((span_a + span_b) / 2)


def _height_overlap(
    a_min: Optional[int], a_max: Optional[int],
    b_min: Optional[int], b_max: Optional[int],
) -> float:
    return _age_overlap(a_min, a_max, b_min, b_max)


def _text_similarity(a: Optional[str], b: Optional[str]) -> float:
    """Simple token-overlap Jaccard similarity."""
    if not a or not b:
        return 0.5
    set_a = set(a.lower().split())
    set_b = set(b.lower().split())
    if not set_a or not set_b:
        return 0.5
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def _field_match(a: Optional[str], b: Optional[str]) -> float:
    """Exact-ish field comparison (e.g. hair colour)."""
    if not a or not b:
        return 0.5  # unknown → neutral
    if a.lower() == b.lower():
        return 1.0
    # partial: check if one string contains the other
    if a.lower() in b.lower() or b.lower() in a.lower():
        return 0.7
    return 0.0


def _gender_match(a: str, b: str) -> float:
    if "unknown" in (a, b):
        return 0.5
    return 1.0 if a == b else 0.0


def compute_match_score(missing, found) -> tuple[float, dict]:
    """
    Compute match score between a missing-person report and a found-person report.
    Returns (score, details_dict).
    """
    weights = {
        "age": 0.25,
        "gender": 0.20,
        "height": 0.10,
        "hair_color": 0.10,
        "eye_color": 0.10,
        "skin_tone": 0.05,
        "build": 0.05,
        "clothing": 0.10,
        "distinguishing": 0.05,
    }

    factors = {
        "age": _age_overlap(
            missing.approximate_age_min, missing.approximate_age_max,
            found.approximate_age_min, found.approximate_age_max,
        ),
        "gender": _gender_match(
            str(missing.gender), str(found.gender)
        ),
        "height": _height_overlap(
            missing.height_cm_min, missing.height_cm_max,
            found.height_cm_min, found.height_cm_max,
        ),
        "hair_color": _field_match(missing.hair_color, found.hair_color),
        "eye_color": _field_match(missing.eye_color, found.eye_color),
        "skin_tone": _field_match(missing.skin_tone, found.skin_tone),
        "build": _field_match(missing.build, found.build),
        "clothing": _text_similarity(
            missing.clothing_description, found.clothing_description
        ),
        "distinguishing": _text_similarity(
            missing.distinguishing_features, found.distinguishing_features
        ),
    }

    score = sum(weights[k] * v for k, v in factors.items())
    score = round(min(max(score, 0.0), 1.0), 4)

    details = {k: round(v, 3) for k, v in factors.items()}
    details["weighted_score"] = score

    return score, details


def run_matching_for_report(report, db) -> list:
    """
    After a new report is saved, find potential matches and store them.
    Returns list of created Match objects.
    """
    from ..models.user import Report, Match, ReportType, ReportStatus, MatchStatus
    from ..core.config import settings

    created_matches = []

    if report.report_type == ReportType.missing:
        candidates = (
            db.query(Report)
            .filter(
                Report.report_type == ReportType.found,
                Report.status == ReportStatus.active,
                Report.id != report.id,
            )
            .all()
        )
        for candidate in candidates:
            score, details = compute_match_score(report, candidate)
            if score >= settings.MATCH_SCORE_THRESHOLD:
                # avoid duplicates
                existing = (
                    db.query(Match)
                    .filter(
                        Match.missing_report_id == report.id,
                        Match.found_report_id == candidate.id,
                    )
                    .first()
                )
                if not existing:
                    m = Match(
                        missing_report_id=report.id,
                        found_report_id=candidate.id,
                        score=score,
                        match_details=details,
                        status=MatchStatus.suggested,
                    )
                    db.add(m)
                    created_matches.append(m)

    elif report.report_type == ReportType.found:
        candidates = (
            db.query(Report)
            .filter(
                Report.report_type == ReportType.missing,
                Report.status == ReportStatus.active,
                Report.id != report.id,
            )
            .all()
        )
        for candidate in candidates:
            score, details = compute_match_score(candidate, report)
            if score >= settings.MATCH_SCORE_THRESHOLD:
                existing = (
                    db.query(Match)
                    .filter(
                        Match.missing_report_id == candidate.id,
                        Match.found_report_id == report.id,
                    )
                    .first()
                )
                if not existing:
                    m = Match(
                        missing_report_id=candidate.id,
                        found_report_id=report.id,
                        score=score,
                        match_details=details,
                        status=MatchStatus.suggested,
                    )
                    db.add(m)
                    created_matches.append(m)

    db.commit()
    return created_matches
