"""Roster sync from Notion Master Client Directory."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import get_current_coach
from notion_clients import clients_configured, refresh_roster_from_notion
from roster_sync_store import get_roster_sync_status

router = APIRouter(prefix="/roster", tags=["roster"], dependencies=[Depends(get_current_coach)])


@router.get("/sync/status")
async def roster_sync_status():
    status = get_roster_sync_status()
    status["configured"] = clients_configured()
    return status


@router.post("/sync/refresh")
async def roster_sync_refresh():
    return await refresh_roster_from_notion()
