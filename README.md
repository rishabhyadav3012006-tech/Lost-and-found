# 🕊️ ReUnite AI — Intelligent Missing Persons & Found Platform

> **An AI-powered family reunification and lost & found matching system.**  
> Built with **FastAPI**, **SQLAlchemy**, probabilistic similarity scoring, and responsive client-side SPA.

[![Python Version](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Agent Skills Ready](https://img.shields.io/badge/Agent%20Skills-Ready-purple.svg)](.agents/skills/README.md)

---

## 📌 Table of Contents
1. [Overview](#-overview)
2. [Key Features](#-key-features)
3. [Architecture & Tech Stack](#-architecture--tech-stack)
4. [Quick Start Guide](#-quick-start-guide)
5. [Default Credentials & Test Accounts](#-default-credentials--test-accounts)
6. [API Endpoints & Documentation](#-api-endpoints--documentation)
7. [AI Matching Algorithm](#-ai-matching-algorithm)
8. [Agent Skills System](#-agent-skills-system)
9. [Deployment](#-deployment)
10. [Directory Structure](#-directory-structure)

---

## 🌟 Overview

**ReUnite AI** is a specialized platform designed to bridge the critical gap between reported missing individuals and found persons. By combining multi-factor demographic, biometric, physical description, and text-token similarity scoring, ReUnite AI helps authorities and families discover high-confidence candidate matches quickly and accurately.

---

## ✨ Key Features

- **Dual Reporting Pipelines**: Submit detailed records for either missing persons or found individuals.
- **Probabilistic Similarity Engine**: Multi-factor scoring taking into account age overlap, height range, gender match, hair/eye color, build, and tokenized clothing/distinguishing features.
- **Admin Moderation Portal**: Administrative dashboard for report verification, match confirmation, and user access management.
- **Privacy & Security First**: Submitter contact details are masked; JWT authentication with bcrypt password hashing.
- **Photo Attachments**: Multi-file photo upload with file type and size validation.
- **AI Agent Skills Ready**: Pre-packaged runbooks in `.agents/skills/` for autonomous agents like Google Antigravity and Claude Code.

---

## 🏗️ Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend SPA                          │
│     Vanilla HTML5 / Modern CSS (Dark Mode) / Vanilla JS     │
└──────────────────────────────┬──────────────────────────────┘
                               │ REST / JSON (JWT Auth)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend Core                     │
│   ├── /api/auth    (Registration, Login, User Profiles)     │
│   ├── /api/reports (CRUD, Image Uploads, Filtering)         │
│   ├── /api/matches (Similarity Scoring & Review)            │
│   └── /api/admin   (Metrics, Moderation, User Controls)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│     SQLAlchemy ORM DB       │ │   AI Similarity Engine      │
│  (SQLite dev / Postgres prod)│ │  • Age & Height Overlap     │
└─────────────────────────────┘ │  • Text Jaccard Similarity  │
                                │  • Attribute Normalization  │
                                └─────────────────────────────┘
```

- **Backend**: FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, Passlib (bcrypt), PyJWT, Uvicorn.
- **Frontend**: Clean Vanilla JavaScript SPA, responsive CSS with CSS variables, client-side routing.
- **Deployment**: Docker, Docker Compose, Netlify frontend, Render backend.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10+
- `pip` package manager

### 2. Clone and Setup Environment
```bash
git clone https://github.com/rishabhyadav3012006-tech/Lost-and-found.git
cd "Lost and found"

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Initialize Database & Demo Seed Data
```bash
python seed.py
```
*This initializes the SQLite database (`backend/reunite.db`) with tables, admin accounts, demo users, and realistic sample reports.*

### 4. Start the Application
```bash
python run.py
```
Or with Uvicorn directly:
```bash
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Access the application in your browser:
- **Frontend App**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **API Health Check**: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

---

## 🔑 Default Credentials & Test Accounts

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@reunite.ai` | `admin1234` | Full access: stats, moderation, review |
| **Demo User** | `demo@example.com` | `demo1234` | Standard report submission & view |

---

## 📡 API Endpoints & Documentation

| Prefix | Endpoint | Method | Description |
| :--- | :--- | :---: | :--- |
| `/api/auth` | `/login` | `POST` | Authenticate and obtain JWT bearer token |
| `/api/auth` | `/register` | `POST` | Register a new user account |
| `/api/auth` | `/me` | `GET` | Retrieve authenticated user profile |
| `/api/reports` | `/` | `GET` | List active missing & found reports (filterable) |
| `/api/reports` | `/` | `POST` | Create a new report |
| `/api/reports` | `/{id}` | `GET` | Fetch detailed report information |
| `/api/reports` | `/{id}/photos` | `POST` | Upload photo attachments |
| `/api/matches` | `/` | `GET` | List potential matches for current user's reports |
| `/api/matches` | `/rematch/{id}` | `POST` | Re-run similarity algorithm on demand |
| `/api/admin` | `/stats` | `GET` | System dashboard metrics & summary counts |
| `/api/admin` | `/reports/pending` | `GET` | Reports awaiting administrative approval |

---

## 🧠 AI Matching Algorithm

The matching engine computes a multi-factor score $S \in [0.0, 1.0]$ between missing and found reports using weighted sub-scores:

```
Score = (0.25 × Age) + (0.20 × Gender) + (0.10 × Height) + (0.10 × Hair) 
      + (0.10 × Eyes) + (0.10 × Clothing) + (0.05 × Distinguishing) 
      + (0.05 × Skin) + (0.05 × Build)
```

- **Overlapping Range Factors**: Evaluates mathematical span overlap between estimated age and height intervals with progressive gap penalties.
- **Token-Level Jaccard Similarity**: Measures word-set overlap across descriptions and identifying marks.
- **Detailed Specifications**: See [Algorithm Reference](.agents/skills/matching-engine/references/algorithm_weights.md).

---

## 🤖 Agent Skills System

This repository is equipped with **Agent Skills**—standardized, progressive-disclosure runbooks for AI coding agents:

- 📖 **[Agent Skills Specification & Guide](.agents/skills/README.md)**
- 🗄️ **[db-operations Skill](.agents/skills/db-operations/SKILL.md)**: Database inspection, seeding, and migration routines.
- 🎯 **[matching-engine Skill](.agents/skills/matching-engine/SKILL.md)**: Algorithm evaluation suite and benchmark runners.
- 🌐 **[api-testing Skill](.agents/skills/api-testing/SKILL.md)**: FastAPI routing and schema verification tools.

---

## 🚢 Deployment

### Docker & Docker Compose
```bash
docker-compose up --build
```

### Netlify Frontend
The frontend is pre-configured with `netlify.toml` and `_redirects` for single-click deployment via Netlify or Netlify Drop.

---

## 📂 Directory Structure

```text
Lost and found/
├── .agents/
│   └── skills/                   # Standardized AI Agent Skills
│       ├── README.md             # Agent Skills Specification
│       ├── api-testing/          # API verification skill
│       ├── db-operations/        # Database management skill
│       └── matching-engine/      # AI matching algorithm skill
├── backend/
│   ├── app/
│   │   ├── api/routes/           # FastAPI route controllers
│   │   ├── core/                 # Config, security & database engine
│   │   ├── models/               # SQLAlchemy ORM models
│   │   ├── schemas/              # Pydantic validation schemas
│   │   ├── services/             # Matching engine & email notification
│   │   └── main.py               # Application entry point
│   └── reunite.db                # SQLite local database
├── frontend/
│   ├── index.html                # Single Page Application
│   └── src/                      # JS logic and CSS design system
├── seed.py                       # Database seeder script
├── run.py                        # Local dev runner
├── Dockerfile                    # Containerization definition
└── requirements.txt              # Python dependencies
```

---

*Authored for ReUnite AI.*
