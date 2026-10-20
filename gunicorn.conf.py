# Gunicorn config for production (used with uvicorn workers)
# Run: gunicorn -c gunicorn.conf.py backend.app.main:app
import os

# Worker class – uvicorn's async worker for FastAPI
worker_class = "uvicorn.workers.UvicornWorker"

# Number of workers: (2 × CPU cores) + 1 is a common rule of thumb
workers = int(os.getenv("GUNICORN_WORKERS", "3"))

# Bind address
bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"

# Logging
loglevel = "info"
accesslog = "-"   # stdout
errorlog  = "-"   # stdout

# Timeouts
timeout = 120
keepalive = 5

# Graceful restart
graceful_timeout = 30
