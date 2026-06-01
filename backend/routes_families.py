"""Families CRUD."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_coach
from db import db, serialize
from models import Family, FamilyCreate, FamilyUpdate

router = APIRouter(prefix="/families", tags=["families"], dependencies=[Depends(get_current_coach)])


@router.get("", response_model=List[Family])
async def list_families():
    docs = await db.families.find({}, {"_id": 0}).sort("family_name", 1).to_list(1000)
    return docs


@router.post("", response_model=Family)
async def create_family(payload: FamilyCreate):
    fam = Family(**payload.model_dump())
    await db.families.insert_one(serialize(fam.model_dump()))
    return fam


@router.get("/{family_id}", response_model=Family)
async def get_family(family_id: str):
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not fam:
        raise HTTPException(404, "Family not found")
    return fam


@router.patch("/{family_id}", response_model=Family)
async def update_family(family_id: str, payload: FamilyUpdate):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if updates:
        res = await db.families.update_one({"id": family_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Family not found")
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    return fam


@router.delete("/{family_id}")
async def delete_family(family_id: str):
    # don't allow if athletes exist
    count = await db.athletes.count_documents({"family_id": family_id})
    if count > 0:
        raise HTTPException(400, f"Cannot delete family — {count} athlete(s) attached")
    res = await db.families.delete_one({"id": family_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Family not found")
    return {"status": "ok"}
