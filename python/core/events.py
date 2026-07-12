"""事件系统：WebSocket 推送管理

管理 WebSocket 连接，向前端推送实时事件（进度、日志等）。
"""

import asyncio
import json
from datetime import datetime
from typing import Any
from fastapi import WebSocket


class EventManager:
    """WebSocket 事件推送管理器"""

    def __init__(self):
        self._connections: list[WebSocket] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    async def handle_websocket(self, websocket: WebSocket):
        """处理 WebSocket 连接"""
        await websocket.accept()
        self._connections.append(websocket)
        self._loop = asyncio.get_event_loop()
        try:
            while True:
                await websocket.receive_text()
        except Exception:
            pass
        finally:
            if websocket in self._connections:
                self._connections.remove(websocket)

    def emit(self, event: str, data: dict[str, Any]):
        """同步接口：向所有连接推送事件（从非 async 上下文调用）"""
        if not self._connections:
            return
        message = json.dumps({"event": event, "data": data})
        if self._loop:
            asyncio.run_coroutine_threadsafe(self._broadcast(message), self._loop)

    async def _broadcast(self, message: str):
        """异步广播消息"""
        dead = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self._connections:
                self._connections.remove(ws)

    def log(self, level: str, message: str):
        """推送日志事件"""
        self.emit("log", {
            "timestamp": datetime.now().isoformat(timespec="milliseconds"),
            "level": level,
            "message": message,
        })


# 全局单例
event_manager = EventManager()
