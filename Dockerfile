# Bus Booking Webapp — Docker image for Render
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy backend and webapp (sibling dirs so main.py finds ../webapp)
COPY backend/ ./backend/
COPY webapp/ ./webapp/

WORKDIR /app/backend

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

# Apply migrations then start app (Render sets PORT). --log-level debug для логов в Render.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level debug"]
