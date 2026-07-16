"""设备目录 API 路由

提供 device_info.json 中的设备元数据查询，供前端目标设备选择弹窗使用。
后续阶段（Flash、Commander 等）也可引用此数据。
"""

import json
import os
from fastapi import APIRouter, HTTPException

router = APIRouter()

_DEVICE_INFO_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "device_info.json")


def _load_device_info() -> list[dict]:
    """加载 device_info.json"""
    try:
        with open(_DEVICE_INFO_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError as e:
        raise RuntimeError(f"device_info.json parse error: {e}")


@router.get("")
async def list_devices():
    """列出所有支持的设备（完整目录）"""
    return {"devices": _load_device_info()}


@router.get("/{part_number}")
async def get_device(part_number: str):
    """获取指定设备的详细信息"""
    devices = _load_device_info()
    for d in devices:
        if d["part_number"] == part_number:
            return d
    raise HTTPException(status_code=404, detail=f"Unknown device: {part_number}")
