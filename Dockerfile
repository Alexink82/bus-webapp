# Bus Booking Webapp — Docker image for Render
FROM python:3.11-slim

WORKDIR /app

# Copy backend and webapp (sibling dirs so main.py finds ../webapp)
COPY backend/ ./backend/
COPY webapp/ ./webapp/

WORKDIR /app/backend

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
