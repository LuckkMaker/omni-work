"""Flash 操作 API 路由"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.pyocd_backend import backend
from core.events import event_manager
from core.monitor_backend import monitor_backend

router = APIRouter()


class EraseRequest(BaseModel):
    type: str = "chip"  # "chip" | "sector" | "sector_range"
    address: int = 0
    size: int = 0


class ProgramRequest(BaseModel):
    file_path: str = ""
    data: str = ""  # base64 编码的数据（与 file_path 二选一）
    verify: bool = True
    reset: bool = True
    base_address: int | None = None


class VerifyRequest(BaseModel):
    file_path: str = ""
    data: str = ""  # base64 编码的数据（与 file_path 二选一）
    base_address: int | None = None


class ResetRequest(BaseModel):
    type: str = "hw"  # "hw" | "sw"
    run: bool = True


class BlankCheckRequest(BaseModel):
    address: int | None = None
    size: int | None = None


class ReadBackRequest(BaseModel):
    type: str = "chip"  # "chip" | "range"
    address: int = 0
    size: int = 0
    output_path: str = ""


@router.post("/probes/{uid}/flash/erase")
async def erase_flash(uid: str, req: EraseRequest):
    """擦除 Flash"""
    with monitor_backend.pause_during(uid):
        result = await asyncio.to_thread(backend.erase, uid, req.type, req.address, req.size)
    return result.__dict__


@router.post("/probes/{uid}/flash/program")
async def program_flash(uid: str, req: ProgramRequest):
    """烧录固件（支持文件路径或 base64 数据）"""
    with monitor_backend.pause_during(uid):
        result = await asyncio.to_thread(
            backend.program, uid, req.file_path, req.verify, req.reset, req.base_address, req.data
        )
    event_manager.emit("flash.complete", result.__dict__)
    return result.__dict__


@router.post("/probes/{uid}/flash/verify")
async def verify_flash(uid: str, req: VerifyRequest):
    """校验 Flash 内容（支持文件路径或 base64 数据）"""
    with monitor_backend.pause_during(uid):
        result = await asyncio.to_thread(backend.verify, uid, req.file_path, req.data, req.base_address)
    return result.__dict__


@router.post("/probes/{uid}/flash/blank-check")
async def blank_check(uid: str, req: BlankCheckRequest):
    """检查 Flash 是否为空白"""
    with monitor_backend.pause_during(uid):
        result = await asyncio.to_thread(backend.check_blank, uid, req.address, req.size)
    return result


@router.post("/probes/{uid}/flash/read")
async def read_flash(uid: str, req: ReadBackRequest):
    """读取 Flash 内容，返回 base64 数据"""
    with monitor_backend.pause_during(uid):
        result = await asyncio.to_thread(
            backend.read_back, uid, req.type, req.address, req.size, req.output_path
        )
    return result


@router.post("/probes/{uid}/reset")
async def reset_target(uid: str, req: ResetRequest):
    """复位目标"""
    with monitor_backend.pause_during(uid):
        success = await asyncio.to_thread(backend.reset, uid, req.type, req.run)
    return {"success": success}


@router.post("/probes/{uid}/flash/cancel")
async def cancel_flash_operation(uid: str):
    """取消正在进行的 Flash 操作"""
    backend.cancel_operation()
    return {"success": True}
