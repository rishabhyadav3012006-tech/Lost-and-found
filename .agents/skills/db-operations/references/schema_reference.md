# 🗄️ Database Schema Reference (ReUnite AI)

## Database Overview
- **Default ORM**: SQLAlchemy 2.0
- **Supported Engines**: SQLite (development: `backend/reunite.db`), PostgreSQL (production via `DATABASE_URL`)
- **Connection Configuration**: `backend/app/core/database.py`

---

## Tables & Entities

### 1. `users`
Represents administrators and registered public users.
- `id` (INTEGER, PK, auto-increment)
- `email` (VARCHAR(255), UNIQUE, indexed, non-null)
- `full_name` (VARCHAR(255), non-null)
- `hashed_password` (VARCHAR(255), non-null, bcrypt)
- `phone` (VARCHAR(30), nullable)
- `is_active` (BOOLEAN, default: true)
- `is_admin` (BOOLEAN, default: false)
- `created_at` (DATETIME, default: utcnow)
- `updated_at` (DATETIME, default: utcnow, onupdate: utcnow)

### 2. `reports`
Represents reported missing or found persons.
- `id` (INTEGER, PK, auto-increment)
- `report_type` (ENUM: `missing`, `found`, non-null)
- `status` (ENUM: `active`, `closed`, `pending_review`, `reunited`)
- `person_name` (VARCHAR(255), nullable for found cases)
- `approximate_age_min` (INTEGER, nullable)
- `approximate_age_max` (INTEGER, nullable)
- `gender` (ENUM: `male`, `female`, `unknown`, `other`)
- `height_cm_min` / `height_cm_max` (INTEGER, nullable)
- `build`, `hair_color`, `eye_color`, `skin_tone` (VARCHAR(100), nullable)
- `distinguishing_features` (TEXT, nullable)
- `clothing_description` (TEXT, nullable)
- `location_description` (VARCHAR(500), nullable)
- `location_lat`, `location_lng` (FLOAT, nullable)
- `incident_date` (DATETIME, nullable)
- `additional_info` (TEXT, nullable)
- `is_public` (BOOLEAN, default: true)
- `submitter_id` (INTEGER, FK -> `users.id`, nullable)
- `contact_name`, `contact_phone`, `contact_email` (VARCHAR, nullable)

### 3. `photos`
Images attached to missing or found reports.
- `id` (INTEGER, PK)
- `report_id` (INTEGER, FK -> `reports.id`, cascade delete)
- `filename` (VARCHAR(500), non-null)
- `original_filename` (VARCHAR(500), nullable)
- `content_type` (VARCHAR(100), nullable)
- `created_at` (DATETIME, default: utcnow)

### 4. `matches`
Computed similarity records between missing and found reports.
- `id` (INTEGER, PK)
- `missing_report_id` (INTEGER, FK -> `reports.id`)
- `found_report_id` (INTEGER, FK -> `reports.id`)
- `score` (FLOAT, `0.0` - `1.0`, non-null)
- `match_details` (JSON, nullable breakdown of factors)
- `status` (ENUM: `suggested`, `confirmed`, `rejected`)
- `reviewed_by_id` (INTEGER, FK -> `users.id`, nullable)
- `created_at` / `updated_at` (DATETIME)
