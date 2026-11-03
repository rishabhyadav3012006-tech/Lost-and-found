---
name: matching-engine
description: >-
  Use this skill when the user asks to test, benchmark, debug, or optimize the
  similarity matching engine in backend/app/services/matching.py for missing and found reports.
---

# Matching Engine Skill

## Overview
ReUnite AI includes a multi-factor matching engine that computes similarity scores (0.0 to 1.0) between missing and found reports using weighted factors:
- Gender alignment (weight: 0.20)
- Age range overlap (weight: 0.25)
- Height range overlap (weight: 0.10)
- Hair color & Eye color (weights: 0.10 each)
- Build & Skin tone (weights: 0.05 each)
- Clothing & Distinguishing features token similarity (weights: 0.10 & 0.05)

Detailed mathematical definitions and weights are documented in:
[algorithm_weights.md](./references/algorithm_weights.md)

## Test Matching Runbook

### 1. Run Automated Test Suite
Execute the deterministic test runner in `scripts/`:

```bash
python .agents/skills/matching-engine/scripts/test_matching.py
```

### 2. Run Interactive Matching Evaluation
Test the algorithm with two mock reports directly in Python:

```bash
python -c "
from backend.app.services.matching import compute_match_score
from backend.app.models.user import Report, ReportType, Gender

r1 = Report(report_type=ReportType.missing, gender=Gender.male, approximate_age_min=25, approximate_age_max=30)
r2 = Report(report_type=ReportType.found, gender=Gender.male, approximate_age_min=24, approximate_age_max=32)

score, details = compute_match_score(r1, r2)
print(f'Match Score: {score:.2%}')
print(f'Details: {details}')
assert score > 0.70, 'Expected high match score for similar profiles'
print('Test passed!')
"
```

### 3. Trigger Batch Matching for Existing Reports
Run matching on all database reports:
```bash
python -c "
from backend.app.core.database import SessionLocal
from backend.app.models.user import Report
from backend.app.services.matching import run_matching_for_report

db = SessionLocal()
reports = db.query(Report).all()
print(f'Running matching for {len(reports)} reports...')
for r in reports:
    matches = run_matching_for_report(r, db)
    print(f'Report #{r.id} ({r.report_type.value}): found {len(matches)} potential matches')
"
```
