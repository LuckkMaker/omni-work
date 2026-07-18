"""探针管理 API 路由"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.pyocd_backend import backend, ProbeState
from core.events import event_manager

router = APIRouter()


class SetTargetRequest(BaseModel):
    part_number: str


class ConnectRequest(BaseModel):
    target: str | None = None
    interface: str = "swd"
    speed: int | None = None


@router.get("")
async def list_probes():
    """列出所有已连接探针（含连接状态）"""
    probes = backend.get_probe_states()
    return {"probes": probes}


@router.get("/states")
async def get_probe_states():
    """获取所有探针状态（轻量级，仅返回 uid + state）"""
    probes = backend.get_probe_states()
    return {
        "probes": [
            {"uid": p["uid"], "state": p["state"]}
            for p in probes
        ]
    }


@router.post("/{uid}/connect")
async def connect_probe(uid: str, req: ConnectRequest | None = None):
    """连接指定探针（可指定目标型号、接口、速度）"""
    target = req.target if req else None
    interface = req.interface if req else "swd"
    speed = req.speed if req else None
    success = backend.connect(uid, target=target, interface=interface, speed=speed)
    if not success:
        raise HTTPException(status_code=500, detail="Connection failed")

    target = backend.get_target_info(uid)
    return {
        "connected": True,
        "uid": uid,
        "target": target.to_dict() if target else None,
    }


@router.post("/{uid}/disconnect")
async def disconnect_probe(uid: str):
    """断开探针"""
    backend.disconnect(uid)
    # 清理 Commander 命令上下文
    from core.commander_backend import commander_backend
    commander_backend.reset_context(uid)
    return {"disconnected": True, "uid": uid}


@router.get("/{uid}/target")
async def get_target(uid: str):
    """获取当前连接的目标信息"""
    target = backend.get_target_info(uid)
    if not target:
        raise HTTPException(status_code=404, detail="No target connected")
    return target.to_dict()


@router.post("/{uid}/target")
async def set_target(uid: str, req: SetTargetRequest):
    """手动设置目标芯片型号"""
    success = backend.set_target(uid, req.part_number)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to set target: {req.part_number}")

    # 目标切换后 session 重建，重置 Commander 上下文
    from core.commander_backend import commander_backend
    commander_backend.reset_context(uid)

    target = backend.get_target_info(uid)
    return {
        "success": True,
        "uid": uid,
        "target": target.to_dict() if target else None,
    }


@router.get("/{uid}/status")
async def get_probe_status(uid: str):
    """获取探针连接状态"""
    state = backend.get_state(uid)
    target = backend.get_target_info(uid) if state == ProbeState.CONNECTED else None
    return {
        "uid": uid,
        "state": state.value,
        "target": target.to_dict() if target else None,
    }


@router.post("/refresh")
async def refresh_probes():
    """手动触发探针列表刷新"""
    probes = backend.get_probe_states()
    event_manager.emit("probe.list", {"probes": probes})
    return {"probes": probes}
