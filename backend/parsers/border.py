"""Border status parser (GPC Belarus) - stub."""
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def fetch_border_status():
    """Fetch border status. Stub returns static message."""
    try:
        return {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "message_ru": "Актуальную информацию уточняйте на границе.",
            "message_en": "Check actual info at the border.",
            "source": "stub",
        }
    except Exception as e:
        logger.warning("border fetch failed: %s", e)
        return None
