"""Commander 命令执行 API 路由

提供交互式命令行执行能力，复用 pyOCD Commander 的全部 REPL 命令。
"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.commander_backend import commander_backend

router = APIRouter()


class ExecRequest(BaseModel):
    command: str


@router.post("/probes/{uid}/commander/exec")
async def exec_command(uid: str, req: ExecRequest):
    """执行一条 Commander 命令

    同步执行，返回完整输出。命令在独立线程中执行以免阻塞事件循环。
    """
    result = await asyncio.to_thread(commander_backend.execute, uid, req.command)
    return result


@router.get("/probes/{uid}/commander/commands")
async def list_commands(uid: str):
    """获取该探针可用的所有 Commander 命令及帮助"""
    commands = await asyncio.to_thread(commander_backend.get_commands, uid)
    return {"commands": commands}


@router.get("/commander/commands")
async def list_all_commands():
    """获取所有 Commander 命令（不依赖探针连接）"""
    commands = await asyncio.to_thread(commander_backend.get_commands, None)
    return {"commands": commands}


@router.post("/probes/{uid}/commander/reset")
async def reset_context(uid: str):
    """重置探针的命令上下文（目标切换/重连后调用）"""
    commander_backend.reset_context(uid)
    return {"success": True}


@router.post("/probes/{uid}/commander/cancel")
async def cancel_command(uid: str):
    """取消该探针上正在执行的命令（Ctrl+C 中断）"""
    result = await asyncio.to_thread(commander_backend.cancel_command, uid)
    return {"success": result}
