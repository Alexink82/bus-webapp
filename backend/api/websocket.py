"""WebSocket for dispatcher real-time notifications."""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, dispatcher_id: int):
        await websocket.accept()
        self.active_connections[dispatcher_id] = websocket
        logger.info("Dispatcher %s connected", dispatcher_id)

    def disconnect(self, dispatcher_id: int):
        self.active_connections.pop(dispatcher_id, None)
        logger.info("Dispatcher %s disconnected", dispatcher_id)

    async def send_to_dispatcher(self, dispatcher_id: int, message: dict):
        ws = self.active_connections.get(dispatcher_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning("Send to %s failed: %s", dispatcher_id, e)

    async def broadcast_new_booking(self, booking: dict, route_ids: list):
        from database import AsyncSessionLocal
        from models import Dispatcher
        from sqlalchemy import select
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Dispatcher).where(Dispatcher.is_active == True)
            )
            for disp in result.scalars().all():
                if not disp.routes:
                    continue
                if any(rid in (disp.routes or []) for rid in route_ids):
                    await self.send_to_dispatcher(disp.telegram_id, {
                        "type": "new_booking",
                        "data": booking,
                    })


manager = ConnectionManager()


@router.websocket("/ws/dispatcher/{dispatcher_id}")
async def websocket_dispatcher(websocket: WebSocket, dispatcher_id: int):
    await manager.connect(websocket, int(dispatcher_id))
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(int(dispatcher_id))
