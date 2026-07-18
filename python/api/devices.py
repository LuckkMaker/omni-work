"""设备目录 API 路由

提供设备元数据的 CRUD 操作，数据存储在 SQLite 数据库中。
首次运行时自动从 device_info.json 导入初始数据。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from core import database

router = APIRouter()


# ── 请求模型 ─────────────────────────────


class FlashRegionCreate(BaseModel):
    start: str
    length: str
    sector_size: str
    page_size: str
    is_boot_memory: bool = False


class DeviceCreate(BaseModel):
    part_number: str
    vendor: str
    display_name: str
    core: str
    num_cores: int = 1
    flash_size: int  # KB
    ram_size: int  # KB
    flash_base_address: str
    ram_base_address: str
    flash_regions: list[FlashRegionCreate] = Field(default_factory=list)


# ── 路由 ─────────────────────────────────


@router.get("")
async def list_devices():
    """列出所有支持的设备（完整目录）"""
    return {"devices": database.list_devices()}


@router.get("/{part_number}")
async def get_device(part_number: str):
    """获取指定设备的详细信息"""
    device = database.get_device(part_number)
    if device is None:
        raise HTTPException(status_code=404, detail=f"Unknown device: {part_number}")
    return device


@router.post("")
async def create_device(req: DeviceCreate):
    """新增设备"""
    device = database.add_device(req.model_dump())
    return device


@router.put("/{part_number}")
async def update_device(part_number: str, req: DeviceCreate):
    """更新设备信息"""
    device = database.update_device(part_number, req.model_dump())
    if device is None:
        raise HTTPException(status_code=404, detail=f"Unknown device: {part_number}")
    return device


@router.delete("/{part_number}")
async def delete_device(part_number: str):
    """删除设备"""
    success = database.delete_device(part_number)
    if not success:
        raise HTTPException(status_code=404, detail=f"Unknown device: {part_number}")
    return {"success": True, "part_number": part_number}


@router.post("/reimport")
async def reimport_devices():
    """从 device_info.json 重新导入数据（覆盖同名设备）"""
    count = database.reimport_from_json()
    return {"success": True, "imported": count}
