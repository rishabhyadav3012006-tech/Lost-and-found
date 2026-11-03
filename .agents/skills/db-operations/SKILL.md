---
name: db-operations
description: >-
  Use this skill whenever the user asks to seed the database, run migrations,
  reset local SQLite/PostgreSQL schemas, or inspect test data fixtures for ReUnite AI.
---

# Database Operations & Seeding Skill

## Overview
This skill provides runbooks and commands for managing the ReUnite AI database, executing schema migrations, creating default admin/demo accounts, and loading sample missing/found reports.

Detailed table models and fields:
[schema_reference.md](./references/schema_reference.md)

## Prerequisites
- Working directory: `Lost and found`
- Python environment with dependencies installed:
  ```bash
  pip install -r requirements.txt
  ```

## Procedures

### 1. Seed Database with Initial Admin & Reports
Run the idempotent seed script to create:
- Admin user: `admin@reunite.ai` / `admin1234`
- Demo user: `demo@example.com` / `demo1234`
- Sample missing and found person reports

```bash
python seed.py
```

### 2. Inspect Database Records
Run the inspection script to dump all users, active reports, and generated matches:

```bash
python .agents/skills/db-operations/scripts/inspect_db.py
```

### 3. Reset Local SQLite Database
If the local `backend/reunite.db` becomes corrupted or needs a clean wipe:
```powershell
# Backup existing database
if (Test-Path "backend\reunite.db") { Copy-Item "backend\reunite.db" "backend\reunite.db.bak" }

# Remove old database
if (Test-Path "backend\reunite.db") { Remove-Item "backend\reunite.db" }

# Re-run migrations and seeding
python seed.py
```

### 4. Verify Database Integrity & Records Count
Run quick inspection to verify records:
```bash
python -c "from backend.app.core.database import SessionLocal; from backend.app.models.user import User, Report, Match; db=SessionLocal(); print(f'Users: {db.query(User).count()} | Reports: {db.query(Report).count()} | Matches: {db.query(Match).count()}')"
```
