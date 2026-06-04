"""Current weather for the home dashboard (Miami / Brickell default).

Served at GET /api/weather — Open-Meteo with NOAA NWS fallback.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_coach

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/weather", tags=["weather"])

# Brickell, Miami — override with WEATHER_LAT / WEATHER_LON on Railway if needed
DEFAULT_LAT = 25.7617
DEFAULT_LON = -80.1918
NWS_USER_AGENT = "EAT Portal (noreply@eliteatmospheretraining.com)"


def _coords() -> tuple[float, float]:
    lat = float(os.environ.get("WEATHER_LAT", DEFAULT_LAT))
    lon = float(os.environ.get("WEATHER_LON", DEFAULT_LON))
    return lat, lon


def _nws_weathercode(short_forecast: str) -> int:
    s = short_forecast.lower()
    if "thunder" in s:
        return 95
    if "rain" in s or "shower" in s or "drizzle" in s:
        return 63
    if "fog" in s:
        return 45
    if "overcast" in s or "cloudy" in s:
        return 3
    if "partly" in s:
        return 2
    if "clear" in s or "sunny" in s:
        return 0
    return 1


def _fetch_open_meteo(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}&current_weather=true&timezone=America%2FNew_York"
    )
    try:
        resp = requests.get(url, timeout=12)
        if not resp.ok:
            return None
        cw = resp.json().get("current_weather")
        if not cw:
            return None
        c = float(cw["temperature"])
        code = int(cw["weathercode"])
        desc_map = {
            0: "Clear",
            1: "Mainly clear",
            2: "Partly cloudy",
            3: "Overcast",
            45: "Fog",
            48: "Depositing rime fog",
            51: "Light drizzle",
            53: "Moderate drizzle",
            55: "Dense drizzle",
            61: "Slight rain",
            63: "Moderate rain",
            65: "Heavy rain",
            80: "Rain showers",
            95: "Thunderstorm",
        }
        return {
            "temp_f": round((c * 9) / 5 + 32),
            "weathercode": code,
            "description": desc_map.get(code, "Weather"),
            "source": "open-meteo",
        }
    except Exception as exc:
        logger.warning("Open-Meteo weather failed: %s", exc)
        return None


def _fetch_nws(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    headers = {"User-Agent": NWS_USER_AGENT, "Accept": "application/geo+json"}
    try:
        points = requests.get(
            f"https://api.weather.gov/points/{lat},{lon}",
            headers=headers,
            timeout=12,
        )
        points.raise_for_status()
        hourly_url = points.json()["properties"]["forecastHourly"]
        hourly = requests.get(hourly_url, headers=headers, timeout=12)
        hourly.raise_for_status()
        period = hourly.json()["properties"]["periods"][0]
        short = period.get("shortForecast") or "Weather"
        return {
            "temp_f": int(period["temperature"]),
            "weathercode": _nws_weathercode(short),
            "description": short,
            "source": "nws",
        }
    except Exception as exc:
        logger.warning("NWS weather failed: %s", exc)
        return None


@router.get("")
async def current_weather(_coach: dict = Depends(get_current_coach)):
    lat, lon = _coords()
    data = _fetch_open_meteo(lat, lon) or _fetch_nws(lat, lon)
    if not data:
        raise HTTPException(503, "Weather unavailable")
    return data
