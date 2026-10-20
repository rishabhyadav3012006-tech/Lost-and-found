# ── ReUnite AI – Production Dockerfile ───────────────────────────────────────
FROM python:3.11-slim

# System deps for Pillow / bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project source
COPY . .

# Ensure upload dir exists
RUN mkdir -p uploads/photos

EXPOSE 8000

# Run with uvicorn (no --reload in production)
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
