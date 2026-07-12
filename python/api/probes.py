"""探针管理 API 路由"""

from fastapi import APIRouter, HTTPException
from core.pyocd_backend import backend
from core.events import event_manager

router = APIRouter()


@router.get("")
async def list_probes():
    """列出所有已连接探针"""
    probes = backend.list_probes()
    return {"probes": [p.__dict__ for p in probes]}


@router.post("/{uid}/connect")
async def connect_probe(uid: str):
    """连接指定探针"""
    success = backend.connect(uid)
    if not success:
        raise HTTPException(status_code=500, detail="Connection failed")

    target = backend.get_target_info(uid)
    return {
        "connected": True,
        "target": target.__dict__ if target else None,
    }


@router.post("/{uid}/disconnect")
async def disconnect_probe(uid: str):
    """断开探针"""
    backend.disconnect(uid)
    return {"disconnected": True}


@router.get("/{uid}/target")
async def get_target(uid: str):
    """获取当前连接的目标信息"""
    target = backend.get_target_info(uid)
    if not target:
        raise HTTPException(status_code=404, detail="No target connected")
    return target.__dict__
