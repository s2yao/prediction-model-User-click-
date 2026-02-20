from __future__ import annotations
from fastapi import WebSocket
import asyncio


class WSManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast_json(self, payload: dict) -> None:
        async with self._lock:
            clients = list(self._clients)

        dead: list[WebSocket] = []
        for c in clients:
            try:
                await c.send_json(payload)
            except Exception:
                dead.append(c)

        if dead:
            async with self._lock:
                for d in dead:
                    self._clients.discard(d)
