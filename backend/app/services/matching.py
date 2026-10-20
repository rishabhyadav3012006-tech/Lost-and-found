"""
Matching Engine for ReUnite AI.

Computes a similarity score (0.0 – 1.0) between a missing-person report
and a found-person report based on overlapping descriptive attributes.

IMPORTANT: A high score is NOT proof of identity. It is a signal for
human review only. The system never claims a match is definitive.

Scoring rules:
  * Each factor returns a value in 0.0 – 1.0, or None when either report
    leaves that attribute blank.
  * Blank attributes contribute a low prior (UNKNOWN_PRIOR) rather than a
    neutral 0.5, so sparse or empty reports can't drift above the threshold.
  * Clear contradictions (male vs female, or ages/heights far apart) are
    hard exclusions — the pair scores 0 and is never suggested.
"""
import re
from typing import Optional


WEIGHTS = {
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

# Score credited to a factor when one side left it blank.
UNKNOWN_PRIOR = 0.25

# Below this much known evidence (share of total weight) a pair is not scored.
MIN_EVIDENCE = 0.25

# Range tolerances: a gap of this size (or more) between ranges scores 0
# and excludes the pair.
AGE_TOLERANCE_YEARS = 10
HEIGHT_TOLERANCE_CM = 15

_STOPWORDS = {
    "a", "an", "and", "the", "of", "on", "in", "with", "wearing", "wears",
    "was", "is", "his", "her", "their", "he", "she", "they", "has", "had",
    "to", "at", "or", "some", "very",
}

# Common spelling variants for colour / descriptive fields.
_SYNONYMS = {
    "gray": "grey",
    "blonde": "blond",
    "fair": "light",
    "thin": "slim",
    "skinny": "slim",
    "fat": "heavy",
    "chubby": "heavy",
    "stocky": "heavy",
    "muscular": "athletic",
    "tshirt": "shirt",
    "tee": "shirt",
}


def _tokens(text: Optional[str], drop_stopwords: bool = True) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower().replace("t-shirt", "tshirt"))
    out = set()
    for w in words:
        if drop_stopwords and w in _STOPWORDS:
            continue
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]  # light plural stemming: "jeans" → "jean", "glasses" kept
        out.add(_SYNONYMS.get(w, w))
    return out


def _resolve_range(lo: Optional[int], hi: Optional[int]) -> Optional[tuple[int, int]]:
    """Accept a single bound as a point estimate; swap reversed bounds."""
    if lo is None and hi is None:
        return None
    if lo is None:
        lo = hi
    if hi is None:
        hi = lo
    return (lo, hi) if lo <= hi else (hi, lo)


def _range_similarity(
    a_min: Optional[int], a_max: Optional[int],
    b_min: Optional[int], b_max: Optional[int],
    tolerance: int,
) -> Optional[float]:
    """
    Similarity of two numeric ranges (inclusive).
    Containment → 1.0, any overlap → 0.5 – 1.0, gap → decays to 0 at `tolerance`.
    """
    a = _resolve_range(a_min, a_max)
    b = _resolve_range(b_min, b_max)
    if a is None or b is None:
        return None
    overlap = min(a[1], b[1]) - max(a[0], b[0]) + 1
    if overlap > 0:
        smaller_span = min(a[1] - a[0], b[1] - b[0]) + 1
        return 0.5 + 0.5 * min(overlap / smaller_span, 1.0)
    gap = -overlap + 1
    return max(0.0, 0.5 * (1 - gap / tolerance))


def _text_similarity(a: Optional[str], b: Optional[str]) -> Optional[float]:
    """Dice coefficient over normalised content words."""
    set_a, set_b = _tokens(a), _tokens(b)
    if not set_a or not set_b:
        return None
    return 2 * len(set_a & set_b) / (len(set_a) + len(set_b))


def _field_match(a: Optional[str], b: Optional[str]) -> Optional[float]:
    """Short descriptive field comparison (e.g. hair colour)."""
    set_a, set_b = _tokens(a, drop_stopwords=False), _tokens(b, drop_stopwords=False)
    if not set_a or not set_b:
        return None
    if set_a == set_b:
        return 1.0
    # partial: shared word, e.g. "light brown" vs "brown"
    if set_a & set_b:
        return 0.7
    return 0.0


def _gender_match(a, b) -> Optional[float]:
    a = getattr(a, "value", a) or "unknown"
    b = getattr(b, "value", b) or "unknown"
    if "unknown" in (a, b):
        return None
    return 1.0 if a == b else 0.0


def compute_match_score(missing, found) -> tuple[float, dict]:
    """
    Compute match score between a missing-person report and a found-person report.
    Returns (score, details_dict). Factors that could not be compared are None.
    """
    factors = {
        "age": _range_similarity(
            missing.approximate_age_min, missing.approximate_age_max,
            found.approximate_age_min, found.approximate_age_max,
            AGE_TOLERANCE_YEARS,
        ),
        "gender": _gender_match(missing.gender, found.gender),
        "height": _range_similarity(
            missing.height_cm_min, missing.height_cm_max,
            found.height_cm_min, found.height_cm_max,
            HEIGHT_TOLERANCE_CM,
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

    details = {k: (None if v is None else round(v, 3)) for k, v in factors.items()}
    known_weight = sum(WEIGHTS[k] for k, v in factors.items() if v is not None)

    excluded = None
    if factors["gender"] == 0.0:
        excluded = "gender_mismatch"
    elif factors["age"] == 0.0:
        excluded = "age_mismatch"
    elif factors["height"] == 0.0:
        excluded = "height_mismatch"
    elif known_weight < MIN_EVIDENCE:
        excluded = "insufficient_data"

    if excluded:
        score = 0.0
        details["excluded"] = excluded
    else:
        score = sum(
            WEIGHTS[k] * (UNKNOWN_PRIOR if v is None else v)
            for k, v in factors.items()
        )
        score = round(min(max(score, 0.0), 1.0), 4)

    details["evidence"] = round(known_weight, 3)
    details["weighted_score"] = score
    return score, details


def run_matching_for_report(report, db) -> list:
    """
    Score `report` against all active reports of the opposite type and
    store suggested matches. Existing suggestions are re-scored, and removed
    if they no longer meet the threshold; confirmed/rejected matches are
    left untouched because a human has already reviewed them.
    Returns list of newly created Match objects.
    """
    from ..models.user import Report, Match, ReportType, ReportStatus, MatchStatus
    from ..core.config import settings

    created_matches = []
    is_missing = report.report_type == ReportType.missing
    report_col = Match.missing_report_id if is_missing else Match.found_report_id
    existing = {
        (m.found_report_id if is_missing else m.missing_report_id): m
        for m in db.query(Match).filter(report_col == report.id).all()
    }

    candidates = []
    if report.status == ReportStatus.active:
        candidates = (
            db.query(Report)
            .filter(
                Report.report_type == (ReportType.found if is_missing else ReportType.missing),
                Report.status == ReportStatus.active,
                Report.id != report.id,
            )
            .all()
        )

    seen = set()
    for candidate in candidates:
        seen.add(candidate.id)
        missing, found = (report, candidate) if is_missing else (candidate, report)
        score, details = compute_match_score(missing, found)
        m = existing.get(candidate.id)
        if m is not None:
            if m.status == MatchStatus.suggested:
                if score >= settings.MATCH_SCORE_THRESHOLD:
                    m.score = score
                    m.match_details = details
                else:
                    db.delete(m)
            continue
        if score >= settings.MATCH_SCORE_THRESHOLD:
            m = Match(
                missing_report_id=missing.id,
                found_report_id=found.id,
                score=score,
                match_details=details,
                status=MatchStatus.suggested,
            )
            db.add(m)
            created_matches.append(m)

    # Suggestions whose counterpart is no longer active are stale.
    for other_id, m in existing.items():
        if other_id not in seen and m.status == MatchStatus.suggested:
            db.delete(m)

    db.commit()
    return created_matches
