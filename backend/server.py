"""Elite Atmosphere Training — backend entry point."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Imports that need env loaded
from auth import ensure_admin_seeded, router as auth_router  # noqa: E402
from models import RATE_CARD  # noqa: E402
from routes_athletes import router as athletes_router  # noqa: E402
from routes_families import router as families_router  # noqa: E402
from routes_invoices import router as invoices_router  # noqa: E402
from routes_sessions import router as sessions_router  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Elite Atmosphere Training Portal")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"app": "EAT Portal", "status": "ok"}


@api_router.get("/rate-card")
async def get_rate_card():
    return RATE_CARD


api_router.include_router(auth_router)
api_router.include_router(families_router)
api_router.include_router(athletes_router)
api_router.include_router(sessions_router)
api_router.include_router(invoices_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await ensure_admin_seeded()
    logger.info("EAT Portal backend ready.")
