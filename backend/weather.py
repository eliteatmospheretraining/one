"""Current weather for the home dashboard (Miami / Brickell default).

Served at GET /api/weather — Open-Meteo with NOAA NWS fallback.
"""
from __future__ import annotations

import logging
import os
import re
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

# WMO weather interpretation codes (Open-Meteo) → coach-friendly label
WMO_DESCRIPTIONS: Dict[int, str] = {
    0: "Sunny",
    1: "Mostly sunny",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Foggy",
    48: "Icy fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Light snow showers",
    86: "Snow showers",
    95: "Thunderstorms",
    96: "Thunderstorms & hail",
    99: "Severe thunderstorms",
}


def _coords() -> tuple[float, float]:
    lat = float(os.environ.get("WEATHER_LAT", DEFAULT_LAT))
    lon = float(os.environ.get("WEATHER_LON", DEFAULT_LON))
    return lat, lon


def description_for_weathercode(code: int) -> str:
    return WMO_DESCRIPTIONS.get(int(code), "Mixed conditions")


def _nws_weathercode(short_forecast: str) -> int:
    s = short_forecast.lower()
    if "thunder" in s or "t-storm" in s:
        return 95
    if "hail" in s:
        return 96
    if "snow" in s or "sleet" in s or "flurr" in s:
        return 73
    if "freezing rain" in s or "freezing drizzle" in s:
        return 67
    if "rain" in s or "shower" in s or "drizzle" in s:
        return 63
    if "fog" in s or "haze" in s or "mist" in s:
        return 45
    if "partly" in s and ("sun" in s or "clear" in s):
        return 2
    if "partly" in s and "cloud" in s:
        return 2
    if "mostly sunny" in s or "mostly clear" in s:
        return 1
    if "mostly cloudy" in s:
        return 3
    if "overcast" in s or "cloudy" in s:
        return 3
    if "clear" in s or "sunny" in s:
        return 0
    return 1


def _nws_description(short_forecast: str) -> str:
    """Map NWS shortForecast to the same vocabulary as Open-Meteo labels."""
    s = short_forecast.lower().strip()
    code = _nws_weathercode(short_forecast)

    if "thunder" in s:
        return "Thunderstorms & hail" if "hail" in s else "Thunderstorms"
    if "snow" in s:
        if "light" in s or "slight" in s:
            return "Light snow"
        if "heavy" in s:
            return "Heavy snow"
        return "Snow"
    if "freezing rain" in s:
        return "Freezing rain"
    if "freezing drizzle" in s:
        return "Freezing drizzle"
    if "drizzle" in s:
        return "Light drizzle" if "light" in s else "Drizzle"
    if "shower" in s:
        if "light" in s or "slight" in s:
            return "Light showers"
        if "heavy" in s:
            return "Heavy showers"
        return "Showers"
    if "rain" in s:
        if "light" in s or "slight" in s:
            return "Light rain"
        if "heavy" in s:
            return "Heavy rain"
        return "Rain"
    if "fog" in s or "haze" in s:
        return "Foggy"

    if re.search(r"partly\s+(sunny|clear)", s):
        return "Partly cloudy"
    if "partly cloudy" in s:
        return "Partly cloudy"
    if "mostly sunny" in s or "mostly clear" in s:
        return "Mostly sunny"
    if "mostly cloudy" in s:
        return "Cloudy"
    if "overcast" in s:
        return "Cloudy"
    if "cloudy" in s:
        return "Cloudy"
    if "sunny" in s or "clear" in s:
        return "Sunny"

    return description_for_weathercode(code)


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
        return {
            "temp_f": round((c * 9) / 5 + 32),
            "weathercode": code,
            "description": description_for_weathercode(code),
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
        code = _nws_weathercode(short)
        return {
            "temp_f": int(period["temperature"]),
            "weathercode": code,
            "description": _nws_description(short),
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
