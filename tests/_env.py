"""Point the app at a throwaway SQLite database before any backend import."""
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

if "backend.app.core.config" not in sys.modules:
    _db_dir = tempfile.mkdtemp(prefix="reunite-test-")
    os.environ["DATABASE_URL"] = f"sqlite:///{_db_dir}/test.db"
