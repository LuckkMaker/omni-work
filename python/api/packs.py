"""CMSIS-Pack 管理 API

提供 Pack 文件的预览、导入、列出、卸载、设备选择编辑功能。
"""

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import pack_manager

router = APIRouter()


class PackPreviewRequest(BaseModel):
    """Pack 预览请求"""
    path: str


class PackImportRequest(BaseModel):
    """Pack 导入请求"""
    path: str  # Pack 文件的本地路径
    selected_parts: list[str] | None = None  # 选择的设备 part_number 列表，None=全部


class PackImportResponse(BaseModel):
    """Pack 导入响应"""
    pack: dict
    devices: list[dict]
    device_count: int


class PackUpdateDevicesRequest(BaseModel):
    """更新 Pack 设备选择请求"""
    selected_parts: list[str]


@router.get("")
async def list_packs():
    """列出已安装的 CMSIS-Pack"""
    return pack_manager.list_installed_packs()


@router.post("/preview")
async def preview_pack(req: PackPreviewRequest):
    """预览 Pack 中的设备列表（不导入）"""
    if not os.path.exists(req.path):
        raise HTTPException(status_code=404, detail=f"Pack 文件不存在: {req.path}")

    if not req.path.lower().endswith(".pack"):
        raise HTTPException(status_code=400, detail="文件必须是 .pack 格式")

    try:
        devices = pack_manager.preview_pack(req.path)
        return {"devices": devices, "device_count": len(devices)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"预览 Pack 失败: {str(e)}")


@router.post("/import")
async def import_pack(req: PackImportRequest):
    """导入 CMSIS-Pack 文件（支持选择部分设备）"""
    if not os.path.exists(req.path):
        raise HTTPException(status_code=404, detail=f"Pack 文件不存在: {req.path}")

    if not req.path.lower().endswith(".pack"):
        raise HTTPException(status_code=400, detail="文件必须是 .pack 格式")

    try:
        result = pack_manager.import_pack(req.path, req.selected_parts)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入 Pack 失败: {str(e)}")


@router.get("/{pack_name}/devices")
async def get_pack_devices(pack_name: str):
    """获取已安装 Pack 中的所有设备（含当前导入状态）"""
    # pack_name 可能包含点号
    pack_name = pack_name.replace("%2E", ".")
    # 处理 /devices 后缀被路由解析的情况
    if pack_name.endswith("/devices"):
        pack_name = pack_name[:-8]

    try:
        return pack_manager.get_pack_devices(pack_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 Pack 设备失败: {str(e)}")


@router.put("/{pack_name}/devices")
async def update_pack_devices(pack_name: str, req: PackUpdateDevicesRequest):
    """更新 Pack 的设备选择（添加新选设备、移除取消选择的设备）"""
    pack_name = pack_name.replace("%2E", ".")
    if pack_name.endswith("/devices"):
        pack_name = pack_name[:-8]

    try:
        return pack_manager.update_pack_devices(pack_name, req.selected_parts)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新 Pack 设备失败: {str(e)}")


@router.delete("/{pack_name}")
async def remove_pack(pack_name: str):
    """卸载 CMSIS-Pack"""
    # pack_name 可能包含点号，需要 URL 解码
    pack_name = pack_name.replace("%2E", ".")

    success = pack_manager.remove_pack(pack_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"未找到 Pack: {pack_name}")

    return {"message": f"Pack {pack_name} 已卸载", "success": True}
