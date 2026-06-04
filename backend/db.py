"""MongoDB helpers and JSON-safe (de)serialization for date/datetime."""
from __future__ import annotations

import os
from datetime import date, datetime, timezone
from typing import Any, Dict

import certifi
from motor.motor_asyncio import AsyncIOMotorClient

_client = AsyncIOMotorClient(
    os.environ["MONGO_URL"],
    tlsCAFile=certifi.where(),
)
db = _client[os.environ["DB_NAME"]]


def serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert date/datetime values to ISO strings for Mongo storage."""
    out: Dict[str, Any] = {}
    for k, v in doc.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, date):
            out[k] = v.isoformat()
        elif isinstance(v, list):
            out[k] = [serialize(i) if isinstance(i, dict) else i for i in v]
        elif isinstance(v, dict):
            out[k] = serialize(v)
        else:
            out[k] = v
    return out


def deserialize_dates(doc: Dict[str, Any], date_fields: list[str], datetime_fields: list[str]) -> Dict[str, Any]:
    for f in date_fields:
        if doc.get(f) and isinstance(doc[f], str):
            try:
                doc[f] = date.fromisoformat(doc[f][:10])
            except ValueError:
                pass
    for f in datetime_fields:
        if doc.get(f) and isinstance(doc[f], str):
            try:
                doc[f] = datetime.fromisoformat(doc[f])
            except ValueError:
                pass
    return doc


def now() -> datetime:
    return datetime.now(timezone.utc)
