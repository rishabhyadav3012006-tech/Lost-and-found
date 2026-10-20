"""Seed the database with an admin user and sample reports for demo."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.core.database import SessionLocal, engine, Base
from backend.app.models.user import User, Report, ReportType, ReportStatus, Gender
from backend.app.core.security import get_password_hash
from backend.app.services.matching import run_matching_for_report
from datetime import datetime, timedelta

# Create all tables
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# ─── Admin User ──────────────────────────────────────────────────────────────
admin_email = "admin@reunite.ai"
admin = db.query(User).filter(User.email == admin_email).first()
if not admin:
    admin = User(
        email=admin_email,
        full_name="ReUnite Admin",
        hashed_password=get_password_hash("admin1234"),
        is_admin=True,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    print(f"✅ Admin created: {admin_email} / admin1234")
else:
    print(f"ℹ️  Admin already exists: {admin_email}")

# ─── Demo User ───────────────────────────────────────────────────────────────
demo_email = "demo@example.com"
demo = db.query(User).filter(User.email == demo_email).first()
if not demo:
    demo = User(
        email=demo_email,
        full_name="Demo User",
        hashed_password=get_password_hash("demo1234"),
        phone="+91 98765 43210",
    )
    db.add(demo)
    db.commit()
    db.refresh(demo)
    print(f"✅ Demo user created: {demo_email} / demo1234")

# ─── Sample Reports ──────────────────────────────────────────────────────────
existing = db.query(Report).count()
if existing == 0:
    reports_data = [
        dict(
            report_type=ReportType.missing,
            person_name="Rahul Sharma",
            approximate_age_min=28,
            approximate_age_max=32,
            gender=Gender.male,
            height_cm_min=168,
            height_cm_max=175,
            build="medium",
            hair_color="black",
            eye_color="brown",
            skin_tone="medium",
            clothing_description="Blue denim jeans, white polo shirt, brown leather sandals",
            distinguishing_features="Small scar on left cheek, wears glasses",
            location_description="Connaught Place, New Delhi",
            incident_date=datetime.utcnow() - timedelta(days=5),
            contact_name="Priya Sharma",
            contact_phone="+91 98765 11111",
            contact_email="priya.sharma@example.com",
            submitter_id=demo.id,
        ),
        dict(
            report_type=ReportType.found,
            approximate_age_min=25,
            approximate_age_max=35,
            gender=Gender.male,
            height_cm_min=165,
            height_cm_max=178,
            build="medium",
            hair_color="black",
            eye_color="dark brown",
            skin_tone="medium",
            clothing_description="Jeans and light-colored shirt, sandals",
            distinguishing_features="Wearing glasses, appears confused about location",
            location_description="Rajiv Chowk Metro Station, Delhi",
            incident_date=datetime.utcnow() - timedelta(days=4),
            additional_info="Found person appears disoriented, unable to communicate clearly. Currently at metro station security room.",
            contact_name="Anil Kumar",
            contact_phone="+91 98765 22222",
        ),
        dict(
            report_type=ReportType.missing,
            person_name="Meera Devi",
            approximate_age_min=65,
            approximate_age_max=75,
            gender=Gender.female,
            height_cm_min=150,
            height_cm_max=160,
            build="slim",
            hair_color="grey",
            skin_tone="fair",
            clothing_description="Green saree with gold border, bindi on forehead",
            distinguishing_features="Has a walking stick, speaks only Hindi",
            location_description="Karol Bagh Market, New Delhi",
            incident_date=datetime.utcnow() - timedelta(days=2),
            contact_name="Suresh Devi",
            contact_phone="+91 98765 33333",
            submitter_id=demo.id,
        ),
        dict(
            report_type=ReportType.found,
            approximate_age_min=60,
            approximate_age_max=70,
            gender=Gender.female,
            height_cm_min=148,
            height_cm_max=162,
            build="slim",
            hair_color="grey",
            skin_tone="fair",
            clothing_description="Green and gold traditional saree",
            distinguishing_features="Carrying a walking stick, seems lost",
            location_description="Patel Nagar, New Delhi",
            incident_date=datetime.utcnow() - timedelta(days=1),
            additional_info="Elderly woman found near vegetable market. Speaks Hindi. Safe at local police station.",
            contact_name="Sunita Rawat",
            contact_phone="+91 98765 44444",
        ),
    ]

    created = []
    for rdata in reports_data:
        r = Report(**rdata)
        db.add(r)
        db.flush()
        created.append(r)

    db.commit()
    print(f"✅ Created {len(created)} sample reports")

    # Run matching
    for r in created:
        db.refresh(r)
        matches = run_matching_for_report(r, db)
        print(f"   Report #{r.id} ({r.report_type.value}): {len(matches)} match(es)")
else:
    print(f"ℹ️  Reports already exist ({existing} found). Skipping seed data.")

db.close()
print("\n🎉 Database seeded! Run: python run.py")
print("   Admin: admin@reunite.ai / admin1234")
print("   Demo:  demo@example.com / demo1234")
