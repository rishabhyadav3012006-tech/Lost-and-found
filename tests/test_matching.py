"""
Accuracy tests for the matching engine.

Run from the repo root:  python -m unittest discover -s tests -v
"""
import unittest
from types import SimpleNamespace

from _env import ROOT  # noqa: F401  (sets up sys.path / test DB)
from backend.app.core.config import settings
from backend.app.models.user import Gender
from backend.app.services.matching import compute_match_score

FIELDS = [
    "approximate_age_min", "approximate_age_max", "height_cm_min", "height_cm_max",
    "hair_color", "eye_color", "skin_tone", "build",
    "clothing_description", "distinguishing_features",
]


def report(**kw):
    data = {f: None for f in FIELDS}
    data["gender"] = Gender.unknown
    data.update(kw)
    return SimpleNamespace(**data)


RAHUL = report(
    approximate_age_min=28, approximate_age_max=32, gender=Gender.male,
    height_cm_min=168, height_cm_max=175, hair_color="Black", eye_color="Brown",
    skin_tone="Medium", build="Slim",
    clothing_description="Blue jeans, white t-shirt and a black jacket.",
    distinguishing_features="Scar on left cheek, wears glasses",
)
PRIYA = report(
    approximate_age_min=8, approximate_age_max=10, gender=Gender.female,
    height_cm_min=125, height_cm_max=135, hair_color="Black", eye_color="Brown",
    build="Slim", clothing_description="Pink school uniform with a red backpack",
    distinguishing_features="Birthmark on right arm",
)
GRANDFATHER = report(
    approximate_age_min=72, approximate_age_max=78, gender=Gender.male,
    height_cm_min=160, height_cm_max=166, hair_color="Grey", eye_color="Brown",
    build="Thin", clothing_description="White kurta and brown sandals",
    distinguishing_features="Walks with a cane, hearing aid",
)

# (missing, found, should_match, description)
LABELED_PAIRS = [
    # ── same person, described differently by the finder ──
    (RAHUL, report(
        approximate_age_min=27, approximate_age_max=33, gender=Gender.male,
        height_cm_min=170, height_cm_max=175, hair_color="black", eye_color="brown",
        build="slim", clothing_description="white T-shirt, blue jeans, black jacket",
        distinguishing_features="scar on his left cheek; glasses",
    ), True, "rahul: detailed found report"),
    (RAHUL, report(approximate_age_min=30, gender=Gender.unknown, hair_color="black",
                   clothing_description="black jacket"),
     True, "rahul: sparse found report, gender not recorded"),
    (RAHUL, report(approximate_age_min=25, approximate_age_max=35, gender=Gender.male),
     True, "rahul: only age and gender known"),
    (PRIYA, report(approximate_age_min=9, approximate_age_max=9, gender=Gender.female,
                   hair_color="black", clothing_description="school uniform, red backpack"),
     True, "priya: child found near school"),
    (GRANDFATHER, report(approximate_age_min=70, approximate_age_max=80, gender=Gender.male,
                         hair_color="Gray", build="skinny",
                         distinguishing_features="uses a cane"),
     True, "grandfather: gray/grey + skinny/thin spelling variants"),
    (GRANDFATHER, report(approximate_age_max=75, gender=Gender.male, hair_color="white grey",
                         clothing_description="kurta"),
     True, "grandfather: only upper age bound given"),

    # ── different people ──
    (RAHUL, PRIYA, False, "adult man vs girl"),
    (RAHUL, GRANDFATHER, False, "30-year-old vs 75-year-old"),
    (RAHUL, report(approximate_age_min=6, approximate_age_max=8, gender=Gender.male,
                   height_cm_min=110, height_cm_max=120, hair_color="black",
                   clothing_description="school uniform"),
     False, "rahul vs a young boy"),
    (RAHUL, report(approximate_age_min=29, approximate_age_max=31, gender=Gender.female,
                   hair_color="black", eye_color="brown", build="slim"),
     False, "same age and looks, opposite gender"),
    (RAHUL, report(approximate_age_min=28, approximate_age_max=32, gender=Gender.male,
                   hair_color="blond", eye_color="blue", skin_tone="light", build="heavy",
                   clothing_description="red hoodie and shorts",
                   distinguishing_features="tattoo on neck"),
     False, "same age/gender but every other attribute differs"),
    (PRIYA, report(approximate_age_min=40, approximate_age_max=45, gender=Gender.unknown,
                   clothing_description="pink school uniform"),
     False, "matching clothing text but adult age"),
    (RAHUL, report(), False, "empty found report"),
    (report(), report(), False, "two empty reports"),
    (RAHUL, report(hair_color="black"), False, "only one field known"),
]


class TestMatchingAccuracy(unittest.TestCase):
    def test_labeled_pairs(self):
        threshold = settings.MATCH_SCORE_THRESHOLD
        tp = fp = fn = tn = 0
        failures = []
        for missing, found, expected, desc in LABELED_PAIRS:
            score, details = compute_match_score(missing, found)
            predicted = score >= threshold
            tp += predicted and expected
            fp += predicted and not expected
            fn += expected and not predicted
            tn += not predicted and not expected
            if predicted != expected:
                failures.append(f"{desc}: score={score} details={details}")
        accuracy = (tp + tn) / len(LABELED_PAIRS)
        print(f"\nmatching accuracy {accuracy:.0%}  TP={tp} FP={fp} FN={fn} TN={tn}")
        self.assertEqual(failures, [], "\n".join(failures))

    def test_true_matches_outrank_false_ones(self):
        true_scores = [compute_match_score(m, f)[0] for m, f, ok, _ in LABELED_PAIRS if ok]
        false_scores = [compute_match_score(m, f)[0] for m, f, ok, _ in LABELED_PAIRS if not ok]
        self.assertGreater(min(true_scores), max(false_scores))

    def test_identical_reports_score_near_one(self):
        score, _ = compute_match_score(RAHUL, RAHUL)
        self.assertGreaterEqual(score, 0.95)

    def test_score_is_bounded(self):
        for m, f, _, _ in LABELED_PAIRS:
            score, _ = compute_match_score(m, f)
            self.assertGreaterEqual(score, 0.0)
            self.assertLessEqual(score, 1.0)


class TestFactors(unittest.TestCase):
    def test_unknown_gender_is_neutral_not_a_mismatch(self):
        _, d = compute_match_score(report(gender=Gender.male), report(gender=Gender.unknown))
        self.assertIsNone(d["gender"])

    def test_unknown_genders_do_not_count_as_agreement(self):
        _, d = compute_match_score(report(), report())
        self.assertIsNone(d["gender"])

    def test_gender_accepts_plain_strings(self):
        _, d = compute_match_score(report(gender="female"), report(gender=Gender.female))
        self.assertEqual(d["gender"], 1.0)

    def test_reversed_age_bounds(self):
        _, d = compute_match_score(
            report(approximate_age_min=32, approximate_age_max=28),
            report(approximate_age_min=28, approximate_age_max=32),
        )
        self.assertEqual(d["age"], 1.0)

    def test_text_ignores_punctuation_and_order(self):
        _, d = compute_match_score(
            report(clothing_description="Blue jeans, white T-shirt."),
            report(clothing_description="white t-shirt and blue jeans"),
        )
        self.assertEqual(d["clothing"], 1.0)

    def test_left_and_right_are_distinguished(self):
        _, d = compute_match_score(
            report(distinguishing_features="scar on left cheek"),
            report(distinguishing_features="scar on right cheek"),
        )
        self.assertLess(d["distinguishing"], 1.0)

    def test_partial_colour_match(self):
        _, d = compute_match_score(report(hair_color="light brown"), report(hair_color="Brown"))
        self.assertEqual(d["hair_color"], 0.7)


if __name__ == "__main__":
    unittest.main()
