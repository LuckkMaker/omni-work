"""Flash 操作 API 路由"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.pyocd_backend import backend
from core.events import event_manager

router = APIRouter()


class EraseRequest(BaseModel):
    type: str = "chip"  # "chip" | "sector"
    address: int = 0
    size: int = 0


class ProgramRequest(BaseModel):
    file_path: str
    verify: bool = True
    reset: bool = True


class VerifyRequest(BaseModel):
    file_path: str


class ResetRequest(BaseModel):
    type: str = "hw"  # "hw" | "sw"
    run: bool = True


class ReadRequest(BaseModel):
    address: int
    size: int
    output_path: str | None = None


@router.post("/probes/{uid}/flash/erase")
async def erase_flash(uid: str, req: EraseRequest):
    """擦除 Flash"""
    result = backend.erase(uid, req.type, req.address, req.size)
    return result.__dict__


@router.post("/probes/{uid}/flash/program")
async def program_flash(uid: str, req: ProgramRequest):
    """烧录固件"""
    result = backend.program(uid, req.file_path, req.verify, req.reset)
    event_manager.emit("flash.complete", result.__dict__)
    return result.__dict__


@router.post("/probes/{uid}/flash/verify")
async def verify_flash(uid: str, req: VerifyRequest):
    """校验 Flash 内容"""
    result = backend.verify(uid, req.file_path)
    return result.__dict__


@router.post("/probes/{uid}/flash/read")
async def read_flash(uid: str, req: ReadRequest):
    """读取 Flash 内容"""
    data = backend.read_memory(uid, req.address, req.size)
    if req.output_path:
        with open(req.output_path, "wb") as f:
            f.write(data)
        return {"success": True, "bytes_read": len(data), "output_path": req.output_path}
    return {"success": True, "bytes_read": len(data)}


@router.post("/probes/{uid}/reset")
async def reset_target(uid: str, req: ResetRequest):
    """复位目标"""
    success = backend.reset(uid, req.type, req.run)
    return {"success": success}
