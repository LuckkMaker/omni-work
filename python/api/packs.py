"""CMSIS-Pack 管理 API

提供 Pack 文件的导入、列出、卸载功能。
"""

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import pack_manager

router = APIRouter()


class PackImportRequest(BaseModel):
    """Pack 导入请求"""
    path: str  # Pack 文件的本地路径


class PackImportResponse(BaseModel):
    """Pack 导入响应"""
    pack: dict
    devices: list[dict]
    device_count: int


@router.get("")
async def list_packs():
    """列出已安装的 CMSIS-Pack"""
    return pack_manager.list_installed_packs()


@router.post("/import")
async def import_pack(req: PackImportRequest):
    """导入 CMSIS-Pack 文件"""
    if not os.path.exists(req.path):
        raise HTTPException(status_code=404, detail=f"Pack 文件不存在: {req.path}")

    if not req.path.lower().endswith(".pack"):
        raise HTTPException(status_code=400, detail="文件必须是 .pack 格式")

    try:
        result = pack_manager.import_pack(req.path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入 Pack 失败: {str(e)}")


@router.delete("/{pack_name}")
async def remove_pack(pack_name: str):
    """卸载 CMSIS-Pack"""
    # pack_name 可能包含点号，需要 URL 解码
    pack_name = pack_name.replace("%2E", ".")

    success = pack_manager.remove_pack(pack_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"未找到 Pack: {pack_name}")

    return {"message": f"Pack {pack_name} 已卸载", "success": True}
