"""Flash 操作 API 路由"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.pyocd_backend import backend
from core.events import event_manager

router = APIRouter()


class EraseRequest(BaseModel):
    type: str = "chip"  # "chip" | "sector" | "sector_range"
    address: int = 0
    size: int = 0


class ProgramRequest(BaseModel):
    file_path: str
    verify: bool = True
    reset: bool = True
    base_address: int | None = None


class VerifyRequest(BaseModel):
    file_path: str


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
    result = backend.erase(uid, req.type, req.address, req.size)
    return result.__dict__


@router.post("/probes/{uid}/flash/program")
async def program_flash(uid: str, req: ProgramRequest):
    """烧录固件"""
    result = backend.program(uid, req.file_path, req.verify, req.reset, req.base_address)
    event_manager.emit("flash.complete", result.__dict__)
    return result.__dict__


@router.post("/probes/{uid}/flash/verify")
async def verify_flash(uid: str, req: VerifyRequest):
    """校验 Flash 内容"""
    result = backend.verify(uid, req.file_path)
    return result.__dict__


@router.post("/probes/{uid}/flash/blank-check")
async def blank_check(uid: str, req: BlankCheckRequest):
    """检查 Flash 是否为空白"""
    result = backend.check_blank(uid, req.address, req.size)
    return result


@router.post("/probes/{uid}/flash/read")
async def read_flash(uid: str, req: ReadBackRequest):
    """读取 Flash 内容并保存到文件"""
    result = backend.read_back(uid, req.type, req.address, req.size, req.output_path)
    return result


@router.post("/probes/{uid}/reset")
async def reset_target(uid: str, req: ResetRequest):
    """复位目标"""
    success = backend.reset(uid, req.type, req.run)
    return {"success": success}
