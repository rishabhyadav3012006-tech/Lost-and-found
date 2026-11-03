"""Test and evaluate the similarity matching engine."""
import sys
import os

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from backend.app.models.user import Report, ReportType, Gender
from backend.app.services.matching import compute_match_score


def run_tests():
    print("🧪 Running ReUnite AI Matching Engine Test Suite...\n")

    # Test Case 1: High Similarity Pair
    rep_missing = Report(
        report_type=ReportType.missing,
        gender=Gender.male,
        approximate_age_min=25,
        approximate_age_max=30,
        height_cm_min=170,
        height_cm_max=175,
        hair_color="Black",
        eye_color="Brown",
        build="Athletic",
        skin_tone="Fair",
        distinguishing_features="Scar on left eyebrow, black watch",
        clothing_description="Blue polo t-shirt and jeans",
    )

    rep_found = Report(
        report_type=ReportType.found,
        gender=Gender.male,
        approximate_age_min=24,
        approximate_age_max=32,
        height_cm_min=168,
        height_cm_max=176,
        hair_color="Black",
        eye_color="Brown",
        build="Athletic",
        skin_tone="Fair",
        distinguishing_features="Visible facial scar near eyebrow",
        clothing_description="Blue polo t-shirt, jeans",
    )

    score_high, details_high = compute_match_score(rep_missing, rep_found)
    print(f"Case 1 (High Similarity): Score = {score_high:.2%}")
    print(f"   Breakdown: {details_high}")
    assert score_high >= 0.70, f"Expected high score >= 70%, got {score_high:.2%}"

    # Test Case 2: Divergent Gender (Incompatible)
    rep_female = Report(
        report_type=ReportType.found,
        gender=Gender.female,
        approximate_age_min=25,
        approximate_age_max=30,
    )
    score_diff_gender, details_diff = compute_match_score(rep_missing, rep_female)
    print(f"Case 2 (Different Gender): Score = {score_diff_gender:.2%}")
    assert score_diff_gender < score_high, "Different gender should score significantly lower"

    # Test Case 3: Divergent Age Ranges
    rep_elderly = Report(
        report_type=ReportType.found,
        gender=Gender.male,
        approximate_age_min=65,
        approximate_age_max=75,
    )
    score_diff_age, details_age = compute_match_score(rep_missing, rep_elderly)
    print(f"Case 3 (Divergent Age: 25-30 vs 65-75): Score = {score_diff_age:.2%}")
    assert score_diff_age < 0.60, f"Expected low score for distant age ranges, got {score_diff_age:.2%}"

    print("\n✅ All matching engine tests passed successfully!")


if __name__ == "__main__":
    run_tests()
