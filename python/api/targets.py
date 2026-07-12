"""目标芯片 API 路由"""

from fastapi import APIRouter, HTTPException
from core.pyocd_backend import backend

router = APIRouter()


@router.get("")
async def list_targets():
    """列出所有支持的 MCU 型号"""
    from pyocd.target import TARGET
    targets = sorted(TARGET.keys())
    return {"targets": targets}


@router.get("/{part_number}")
async def get_target_info(part_number: str):
    """获取指定 MCU 的详细信息"""
    from pyocd.target import TARGET
    if part_number not in TARGET:
        raise HTTPException(status_code=404, detail=f"Unknown target: {part_number}")
    # 返回基本信息，实际 Flash 布局需要连接后才能获取
    return {"part_number": part_number, "supported": True}
