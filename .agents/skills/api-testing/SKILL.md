---
name: api-testing
description: >-
  Use this skill when the user asks to test backend API endpoints, verify authentication
  tokens, inspect OpenAPI documentation, or validate HTTP routes for ReUnite AI.
---

# FastAPI API Testing Skill

## Overview
This skill guides the agent in starting the local development backend, inspecting interactive OpenAPI/Swagger schemas, and verifying authentication, report submission, and match retrieval endpoints.

## Procedures

### 1. Verify Route Schema & Mounting
Run the automated schema inspector script:

```bash
python .agents/skills/api-testing/scripts/verify_api.py
```

### 2. Launch the Backend Server
Start the Uvicorn development server:
```powershell
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Check Server Health
Verify the health check endpoint:
```bash
curl -I http://127.0.0.1:8000/api/health
```

### 4. Test Authentication Flow
Obtain a JWT access token for the admin user:
```bash
curl -X POST "http://127.0.0.1:8000/api/auth/login" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin@reunite.ai&password=admin1234"
```

### 5. Fetch Active Reports
Query list of recent reports:
```bash
curl -X GET "http://127.0.0.1:8000/api/reports/"
```
