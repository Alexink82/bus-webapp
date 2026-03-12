"""WebSocket for dispatcher real-time notifications."""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import get_settings
from services.telegram_auth import get_user_id_from_init_data
from services.roles import get_dispatcher_route_ids
from database import AsyncSessionLocal
from models import Dispatcher
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}
        # Маршруты по диспетчеру: пустой список = все маршруты
        self.dispatcher_routes: dict[int, list] = {}

    async def connect(
        self,
        websocket: WebSocket,
        dispatcher_id: int,
        already_accepted: bool = False,
        route_ids: list | None = None,
    ):
        if not already_accepted:
            await websocket.accept()
        self.active_connections[dispatcher_id] = websocket
        self.dispatcher_routes[dispatcher_id] = list(route_ids) if route_ids is not None else []
        logger.info("Dispatcher %s connected", dispatcher_id)

    def disconnect(self, dispatcher_id: int):
        self.active_connections.pop(dispatcher_id, None)
        self.dispatcher_routes.pop(dispatcher_id, None)
        logger.info("Dispatcher %s disconnected", dispatcher_id)

    async def send_to_dispatcher(self, dispatcher_id: int, message: dict):
        ws = self.active_connections.get(dispatcher_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning("Send to %s failed: %s", dispatcher_id, e)

    async def broadcast_new_booking(self, booking: dict, route_id: str):
        """Уведомить только диспетчеров, у которых в зоне маршрут route_id (пустой список = все)."""
        for did in list(self.active_connections.keys()):
            allowed = self.dispatcher_routes.get(did, [])
            if not allowed or route_id in allowed:
                await self.send_to_dispatcher(did, {"type": "new_booking", "data": booking})


manager = ConnectionManager()


@router.websocket("/ws/dispatcher/{dispatcher_id}")
async def websocket_dispatcher(websocket: WebSocket, dispatcher_id: int):
    did = int(dispatcher_id)
    await websocket.accept()
    settings = get_settings()
    if (settings.bot_token or "").strip():
        try:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            if msg.get("type") != "auth" or not msg.get("init_data"):
                await websocket.close(code=4001)
                return
            uid = get_user_id_from_init_data(msg["init_data"])
            if uid is None or uid != did:
                await websocket.close(code=4003)
                return
        except Exception as e:
            logger.warning("WS auth failed: %s", e)
            await websocket.close(code=4000)
            return
    else:
        async with AsyncSessionLocal() as db:
            if await get_dispatcher_route_ids(db, did) is None:
                await websocket.close(code=4003)
                return
    async with AsyncSessionLocal() as db:
        route_ids = await get_dispatcher_route_ids(db, did)
    if route_ids is None:
        await websocket.close(code=4003)
        return
    await manager.connect(websocket, did, already_accepted=True, route_ids=route_ids)
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
        manager.disconnect(did)
