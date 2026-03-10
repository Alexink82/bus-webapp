"""Bus Booking Web App - FastAPI entry point."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_settings
from database import init_db
from logging_config import setup_logging
from api.routes import router as routes_router
from api.booking import router as booking_router
from api.user import router as user_router
from api.payment import router as payment_router
from api.dispatcher import router as dispatcher_router
from api.admin import router as admin_router
from api.websocket import router as ws_router
from api.faq import router as faq_router

setup_logging()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        from parsers.scheduler import start_scheduler
        start_scheduler()
    except Exception:
        pass
    yield
    try:
        from parsers.scheduler import shutdown_scheduler
        shutdown_scheduler()
    except Exception:
        pass


app = FastAPI(
    title="Bus Booking API",
    description="API for bus ticket booking web app",
    version="1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_router)
app.include_router(booking_router)
app.include_router(user_router)
app.include_router(payment_router)
app.include_router(dispatcher_router)
app.include_router(admin_router)
app.include_router(ws_router)
app.include_router(faq_router)

# Mount static webapp (HTML/CSS/JS)
webapp_path = os.path.join(os.path.dirname(__file__), "..", "webapp")
if os.path.isdir(webapp_path):
    app.mount("/", StaticFiles(directory=webapp_path, html=True), name="webapp")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
