# Bus Booking Webapp — Docker image for Render
FROM node:20-slim AS frontend-builder

WORKDIR /app

COPY package.json vite.config.js ./
COPY scripts/ ./scripts/
COPY webapp/ ./webapp/

RUN npm install && npm run build


FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Backend code and already built frontend artifacts.
COPY backend/ ./backend/
COPY --from=frontend-builder /app/dist/ ./dist/

WORKDIR /app/backend

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

# Apply migrations then start app (Render sets PORT). --log-level debug для логов в Render.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level debug"]
