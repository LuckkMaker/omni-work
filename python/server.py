"""Luckk Work - Python 后端入口

启动 FastAPI 服务器，通过 stdout 输出端口信息供 Electron 主进程读取。
启动时自动初始化探针热插拔监控。
"""

import sys
import json
import asyncio
import argparse
import logging
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from api import probes, flash, targets, files, devices, commander
from core.events import event_manager
from core.probe_monitor import probe_monitor
from core.pyocd_backend import backend

logger = logging.getLogger("luckk-work")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化探针监控，关闭时清理资源"""
    loop = asyncio.get_event_loop()
    event_manager.set_loop(loop)

    # 启动探针热插拔监控
    probe_monitor.start(loop)
    logger.info("Application started")

    yield

    # 关闭时清理
    probe_monitor.stop()
    backend.cleanup()
    from core.commander_backend import commander_backend
    commander_backend.cleanup_all()
    logger.info("Application shutdown")


app = FastAPI(title="Luckk Work Backend", version="0.1.0", lifespan=lifespan)

# CORS 配置：允许 Electron 渲染进程（开发模式 localhost:5173/5174）访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(probes.router, prefix="/api/probes", tags=["probes"])
app.include_router(targets.router, prefix="/api/targets", tags=["targets"])
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])
app.include_router(flash.router, prefix="/api", tags=["flash"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(commander.router, prefix="/api", tags=["commander"])


# WebSocket 端点
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await event_manager.handle_websocket(websocket)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "ws_connections": event_manager.connection_count,
    }


def main():
    parser = argparse.ArgumentParser(description="Luckk Work Backend Server")
    parser.add_argument("--port", type=int, default=0, help="监听端口 (0=自动分配)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="监听地址")
    parser.add_argument("--log-level", type=str, default="info",
                        choices=["debug", "info", "warning", "error"],
                        help="日志级别")
    args = parser.parse_args()

    # 配置日志
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        stream=sys.stderr,  # 日志输出到 stderr，不干扰 stdout 的端口 JSON
    )

    actual_port = args.port

    # 如果端口为 0（自动分配），先绑定一个 socket 获取可用端口
    if actual_port == 0:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind((args.host, 0))
        actual_port = sock.getsockname()[1]
        sock.close()

    # 输出端口信息（Electron 主进程读取此行）
    print(json.dumps({"port": actual_port}), flush=True)

    # 使用 uvicorn 运行
    uvicorn.run(
        app,
        host=args.host,
        port=actual_port,
        log_level="warning",
        access_log=False,
        ws="wsproto",
    )


if __name__ == "__main__":
    main()
