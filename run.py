"""Entry point – run from project root.

  Development:  python run.py
  Production:   gunicorn -c gunicorn.conf.py backend.app.main:app
             OR docker compose up
"""
import os
import uvicorn

if __name__ == "__main__":
    debug = os.getenv("DEBUG", "false").lower() == "true"
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=debug,
        log_level="debug" if debug else "info",
        workers=1 if debug else None,  # gunicorn handles workers in prod
    )
