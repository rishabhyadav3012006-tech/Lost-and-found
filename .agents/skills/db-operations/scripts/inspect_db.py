"""Quick inspection utility for the ReUnite AI database."""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.app.core.database import SessionLocal, engine
from backend.app.models.user import User, Report, Match, Photo

def inspect():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        reports = db.query(Report).all()
        matches = db.query(Match).all()
        photos = db.query(Photo).all()

        print(f"Database Engine: {engine.url}")
        print("=" * 50)
        print(f"Users:   {len(users)}")
        for u in users:
            role = "Admin" if u.is_admin else "User"
            print(f"  - [{role}] {u.email} ({u.full_name})")

        print("-" * 50)
        print(f"Reports: {len(reports)}")
        for r in reports:
            print(f"  - #{r.id} [{r.report_type.value.upper()}] {r.person_name or 'Unknown'} | {r.status.value} | Age: {r.approximate_age_min}-{r.approximate_age_max}")

        print("-" * 50)
        print(f"Matches: {len(matches)}")
        for m in matches:
            print(f"  - Match #{m.id}: Missing #{m.missing_report_id} <-> Found #{m.found_report_id} | Score: {m.score:.1%} | Status: {m.status.value}")

        print("-" * 50)
        print(f"Photos:  {len(photos)}")
        print("=" * 50)
    finally:
        db.close()

if __name__ == "__main__":
    inspect()
