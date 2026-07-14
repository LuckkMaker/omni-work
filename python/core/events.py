"""事件系统：WebSocket 推送管理

管理 WebSocket 连接，向前端推送实时事件（进度、日志、探针变更等）。
"""

import asyncio
import json
from datetime import datetime
from typing import Any
from fastapi import WebSocket, WebSocketDisconnect


class EventManager:
    """WebSocket 事件推送管理器"""

    def __init__(self):
        self._connections: list[WebSocket] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    async def handle_websocket(self, websocket: WebSocket):
        """处理 WebSocket 连接"""
        await websocket.accept()
        self._connections.append(websocket)
        if self._loop is None:
            self._loop = asyncio.get_event_loop()

        # 推送欢迎消息
        await websocket.send_text(json.dumps({
            "event": "ws.connected",
            "data": {"message": "WebSocket connected"}
        }))

        try:
            while True:
                # 接收客户端消息（心跳 / 命令）
                raw = await websocket.receive_text()
                msg = json.loads(raw) if raw.startswith("{") else {"action": raw}
                action = msg.get("action")

                if action == "ping":
                    await websocket.send_text(json.dumps({
                        "event": "pong",
                        "data": {"timestamp": datetime.now().isoformat()}
                    }))
                elif action == "refresh_probes":
                    # 客户端请求立即刷新探针列表
                    from core.pyocd_backend import backend
                    probes = backend.get_probe_states()
                    await websocket.send_text(json.dumps({
                        "event": "probe.list",
                        "data": {"probes": probes}
                    }))

        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            if websocket in self._connections:
                self._connections.remove(websocket)

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        """设置事件循环引用（供后台线程使用）"""
        self._loop = loop

    def emit(self, event: str, data: dict[str, Any]):
        """同步接口：向所有连接推送事件（从非 async 上下文调用）"""
        if not self._connections:
            return
        message = json.dumps({"event": event, "data": data})
        if self._loop:
            asyncio.run_coroutine_threadsafe(self._broadcast(message), self._loop)

    async def emit_async(self, event: str, data: dict[str, Any]):
        """异步接口：向所有连接推送事件（从 async 上下文调用）"""
        if not self._connections:
            return
        message = json.dumps({"event": event, "data": data})
        await self._broadcast(message)

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

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# 全局单例
event_manager = EventManager()
