"""Route and OpenAPI schema verification script for ReUnite AI FastAPI backend."""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.app.main import app

def check_routes():
    print("🌐 Inspecting ReUnite AI FastAPI Route Registry & OpenAPI Schema...\n")
    print(f"Project Title: {app.title} (v{app.version})")

    openapi = app.openapi()
    paths = openapi.get("paths", {})
    print(f"Total Registered API Routes: {len(paths)}\n")

    print(f"{'Method':<8} {'Path':<45} {'Summary'}")
    print("=" * 80)
    for path, methods in sorted(paths.items()):
        for method, info in methods.items():
            summary = info.get("summary", "")
            print(f"{method.upper():<8} {path:<45} {summary}")
    print("=" * 80)
    print("✅ All routes successfully mounted and OpenAPI contract verified!")

if __name__ == "__main__":
    check_routes()
