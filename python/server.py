"""DAPLink Work - Python 后端入口

启动 FastAPI 服务器，通过 stdout 输出端口信息供 Electron 主进程读取。
"""

import sys
import json
import argparse
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import probes, flash, targets, files
from core.events import event_manager

app = FastAPI(title="DAPLink Work Backend", version="0.1.0")

# 允许本地前端访问
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
app.include_router(flash.router, prefix="/api", tags=["flash"])
app.include_router(files.router, prefix="/api/files", tags=["files"])

# WebSocket 端点
@app.websocket("/ws")
async def websocket_endpoint(websocket):
    await event_manager.handle_websocket(websocket)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


def main():
    parser = argparse.ArgumentParser(description="DAPLink Work Backend Server")
    parser.add_argument("--port", type=int, default=0, help="监听端口 (0=自动分配)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="监听地址")
    args = parser.parse_args()

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
    )


if __name__ == "__main__":
    main()
