# 🧠 Agent Skills Guide & Specification

> **A standardized framework for modular, progressive-disclosure AI agent capabilities.**  
> Compatible with **Google Antigravity**, **Gemini Code Assist**, and standard Agentic AI workflows.

---

## 📑 Table of Contents
1. [Overview](#-overview)
2. [What are Agent Skills?](#-what-are-agent-skills)
3. [Core Philosophy: Progressive Disclosure](#-core-philosophy-progressive-disclosure)
4. [Directory & File Hierarchy](#-directory--file-hierarchy)
5. [Anatomy of a Skill (`SKILL.md`)](#-anatomy-of-a-skill-skillmd)
6. [Frontmatter Specification](#-frontmatter-specification)
7. [Subdirectories & Supporting Assets](#-subdirectories--supporting-assets)
8. [Discovery & Loading Priority](#-discovery--loading-priority)
9. [Step-by-Step: Creating a New Skill](#-step-by-step-creating-a-new-skill)
10. [Active Repository Skills Catalog](#-active-repository-skills-catalog)
11. [Best Practices & Anti-Patterns](#-best-practices--anti-patterns)
12. [Troubleshooting & Verification](#-troubleshooting--verification)

---

## 🌟 Overview

As codebases grow, AI agents face context window limits and token degradation. Attempting to inject every runbook, test procedure, database schema, and deployment command into the global prompt leads to hallucination, slow responses, and wasted tokens.

**Agent Skills** solve this problem by transforming institutional knowledge into **modular, on-demand capabilities**. Instead of guessing or hallucinating commands, agents dynamically discover, load, and execute specialized runbooks only when a task demands them.

---

## 🎯 What are Agent Skills?

An **Agent Skill** is an encapsulated package containing:
- **`SKILL.md`**: An instructional runbook with standardized YAML frontmatter describing *what* the skill does and *when* it should be triggered.
- **Deterministic Scripts**: Python, Bash, or PowerShell scripts that eliminate hallucination during complex multi-step tasks.
- **Reference Documentation**: Technical specifications, API payloads, schemas, or architectural diagrams loaded only when needed.
- **Validation Criteria**: Concrete verification commands to ensure the agent confirms success before completing a task.

---

## ⚡ Core Philosophy: Progressive Disclosure

Agent Skills operate on a 3-tier **Progressive Disclosure** model:

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 1: Discovery (Global / Zero-Token Footprint)          │
│ • Only skill name & description are injected into prompt    │
│ • Agent searches descriptions against user intent           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ Intent Matched
┌─────────────────────────────────────────────────────────────┐
│ Tier 2: Skill Activation (Context Injection)                │
│ • Agent loads SKILL.md body into working context            │
│ • Agent follows high-level workflow & steps                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ Specific Task Execution
┌─────────────────────────────────────────────────────────────┐
│ Tier 3: Deep Context & Execution (On Demand)                │
│ • Agent executes scripts in scripts/                        │
│ • Agent reads deep schemas in references/                   │
└─────────────────────────────────────────────────────────────┘
```

This ensures the agent maintains a lightweight context window while retaining expert-level capabilities across dozens of specialized workflows.

---

## 📁 Directory & File Hierarchy

Agent skills reside inside the `.agents/skills/` directory at the project root:

```text
.agents/
└── skills/
    ├── README.md                          <-- This guide
    ├── <skill-name-1>/
    │   ├── SKILL.md                       <-- [REQUIRED] Main runbook & frontmatter
    │   ├── scripts/                       <-- [OPTIONAL] Executable helper scripts
    │   │   ├── run_task.py
    │   │   └── verify.sh
    │   ├── references/                    <-- [OPTIONAL] Deep documentation & specs
    │   │   └── api_spec.md
    │   ├── examples/                      <-- [OPTIONAL] Reference outputs & payloads
    │   │   └── sample_payload.json
    │   └── resources/                     <-- [OPTIONAL] Templates, mocks, fixtures
    │       └── test_data.csv
    └── <skill-name-2>/
        └── SKILL.md
```

---

## 📝 Anatomy of a Skill (`SKILL.md`)

Every skill folder must contain a `SKILL.md` file formatted as follows:

```markdown
---
name: db-seed-and-migrate
description: >-
  Use this skill whenever the user asks to seed the database, run Alembic migrations,
  reset local SQLite/PostgreSQL schemas, or inspect test data fixtures for ReUnite AI.
---

# Database Seed and Migration Skill

## Overview
Brief explanation of what this skill achieves and the primary environment prerequisites.

## Prerequisites
- Active Python virtual environment (`.venv`)
- Configured `.env` file with `DATABASE_URL`

## Step-by-Step Procedure
1. Verify database connectivity:
   ```bash
   python -c "from backend.app.core.database import engine; print(engine.url)"
   ```
2. Execute migration or seeding:
   [seed_runner.py](./scripts/seed_runner.py)

## Verification
Confirm the database state with:
```bash
python -c "from backend.app.core.database import SessionLocal; from backend.app.models.user import User; db=SessionLocal(); print('Users:', db.query(User).count())"
```
```

---

## 🏷️ Frontmatter Specification

The YAML frontmatter at the top of `SKILL.md` is strictly parsed:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | string | **Yes** | Unique identifier. Must be lowercase, numbers, and hyphens only (e.g. `matching-service-eval`). |
| `description` | string | **Yes** | **The trigger clause.** Written in 3rd person. Explains *what* the skill does and *explicit conditions* when the agent must activate it. |

### 💡 Writing Effective Triggers

- **Good**: `"Use this skill when the user asks to benchmark, troubleshoot, or tune the AI person matching algorithm in backend/app/services/matching.py."`
- **Bad**: `"Matching algorithm."` *(Too vague; agent will not know when to invoke it).*
- **Bad**: `"I can help you test code."` *(First person; ambiguous intent).*

---

## 🛠️ Subdirectories & Supporting Assets

| Subdirectory | Purpose | Recommended File Types |
| :--- | :--- | :--- |
| `scripts/` | Deterministic automation scripts. Agents can execute these directly instead of generating shell commands on the fly. | `.py`, `.sh`, `.ps1`, `.js` |
| `references/` | Extended reference manuals, database ER diagrams, API specs, and error code tables. | `.md`, `.json`, `.yaml` |
| `examples/` | Golden input/output samples demonstrating expected behavior. | `.json`, `.txt`, `.py` |
| `resources/` | Static fixtures, templates, mock images, or CSV test datasets. | `.csv`, `.png`, `.j2` |

---

## 🔍 Discovery & Loading Priority

When an agent initializes or evaluates a request, skills are discovered and loaded according to the following precedence hierarchy (highest to lowest):

1. **Workspace Project Root** (`<workspace>/.agents/skills/`): Project-specific skills checked into git.
2. **Explicit Declared Configs** (`skills.json`): Explicitly registered external skill paths.
3. **User Global Config** (`~/.gemini/config/skills/`): Personal skills accessible across all projects.
4. **Built-in System Skills**: Bundled IDE and platform skills (e.g. `agy-customizations`).

> **Collision Rule**: If a workspace skill shares the same name as a global or built-in skill, the **workspace skill overrides** the global one.

---

## 🚀 Step-by-Step: Creating a New Skill

Follow these steps to add a skill to this repository:

### Step 1: Create the Folder
```bash
mkdir -p .agents/skills/<your-skill-name>
```

### Step 2: Draft `SKILL.md`
Create `.agents/skills/<your-skill-name>/SKILL.md` with:
- Valid YAML frontmatter (`name`, `description`).
- High-level overview.
- Sequential, verifiable steps.
- Failure handling / troubleshooting section.

### Step 3: Add Helper Scripts (Optional but Recommended)
Place complex command pipelines in `.agents/skills/<your-skill-name>/scripts/`:
- Keep scripts parameterized or self-contained.
- Include proper error exits (`exit 1` on failure).

### Step 4: Validate Skill Discovery
Ask your agent:
> *"What skills do you have available for database management?"*  
The agent should read the frontmatter description and recommend the skill.

---

## 📚 Active Repository Skills Catalog

The following skills are configured for the **ReUnite AI (Lost and Found)** workspace:

| Skill | Path | Description & Trigger |
| :--- | :--- | :--- |
| **`db-operations`** | [db-operations/](./db-operations/SKILL.md) | Database migrations, schema resets, and seeding admin/demo users and test reports. |
| **`matching-engine`** | [matching-engine/](./matching-engine/SKILL.md) | Evaluating, debugging, and benchmarking the AI person & item similarity matching engine. |
| **`api-testing`** | [api-testing/](./api-testing/SKILL.md) | End-to-end testing of backend FastAPI endpoints (Auth, Reports, Matches, Admin). |

---

## 🛡️ Best Practices & Anti-Patterns

### ✅ Do
- **Keep `SKILL.md` lean**: Keep instructions concise; offload bulky details to `references/`.
- **Use deterministic scripts**: When a multi-step task involves regex, complex SQL, or chaining 5+ shell commands, write a python script in `scripts/`.
- **Include verification steps**: Every procedure should conclude with an explicit assertion (e.g. HTTP 200 check, SQL count check).
- **Use relative links**: Link references and scripts using markdown relative links (e.g. `[seed.py](../../seed.py)`).

### ❌ Don't
- **Don't duplicate basic agent knowledge**: Do not instruct the agent on standard Python syntax or basic Git commands.
- **Don't hardcode credentials**: Always instruct the agent to read secrets from `.env` or environment variables.
- **Don't write monolithic skills**: Split large workflows into focused, composable skills (e.g. separate `db-operations` from `docker-deployment`).

---

## 🩺 Troubleshooting & Verification

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **Agent ignores skill** | Frontmatter description does not match user query keywords. | Broaden the `description` with explicit trigger phrases and domain terms. |
| **YAML parsing error** | Syntax error in frontmatter block. | Ensure valid YAML, proper 2-space indentation, and closed quotes. |
| **Script execution failure** | Missing permissions or dependencies. | Include prerequisite validation commands before executing scripts. |

---

*Authored for ReUnite AI & Antigravity Agentic Development Standards.*
