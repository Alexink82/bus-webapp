"""Weather parser - OpenWeather stub."""
import logging
from config import get_settings

logger = logging.getLogger(__name__)


async def fetch_weather(city: str = "Minsk"):
    """Fetch weather. Stub or real OpenWeather."""
    settings = get_settings()
    if not settings.openweather_api_key:
        return {
            "city": city,
            "temp": 5,
            "description_ru": "Облачно",
            "description_en": "Cloudy",
            "source": "stub",
        }
    try:
        import httpx
        url = "https://api.openweathermap.org/data/2.5/weather"
        params = {"q": city, "appid": settings.openweather_api_key, "units": "metric", "lang": "ru"}
        async with httpx.AsyncClient() as client:
            r = await client.get(url, params=params, timeout=5)
            if r.is_success:
                d = r.json()
                return {
                    "city": d.get("name", city),
                    "temp": round(d.get("main", {}).get("temp", 0), 1),
                    "description_ru": d.get("weather", [{}])[0].get("description", ""),
                    "description_en": d.get("weather", [{}])[0].get("main", ""),
                    "source": "openweather",
                }
    except Exception as e:
        logger.warning("weather fetch failed: %s", e)
    return None
