"""Monitor REST API

下位机变量实时监控与波形采样接口。
对标 STM32CubeMonitor Direct 模式：加载 ELF -> 勾选变量 -> 启动采样 -> 波形显示。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core.monitor_backend import monitor_backend
from core.pyocd_backend import backend

router = APIRouter()


class ElfLoadRequest(BaseModel):
    path: str


class AddVariableRequest(BaseModel):
    name: str
    address: int
    type: str                          # int8/uint8/int16/uint16/int32/uint32/float
    remark: str = ""
    refresh_sec: float = 0
    # 数组元素索引。传入时实际地址 = address + elem_index * elem_size，
    # 监视变量名变为 name[elem_index]，type/size 用元素类型/大小。
    elem_index: Optional[int] = None


class WriteVariableRequest(BaseModel):
    value: int


class StartSamplingRequest(BaseModel):
    rate_hz: float = 1000.0
    max_points: int = 100000
    transport: str = "swd"             # swd | rtt


# ── 状态 ──────────────────────────────────────────────

@router.get("/probes/{uid}/monitor/status")
def monitor_status(uid: str):
    """查询 Monitor 状态"""
    return monitor_backend.get_status(uid)


# ── ELF 符号 ──────────────────────────────────────────────

@router.post("/probes/{uid}/monitor/elf/load")
def load_elf(uid: str, req: ElfLoadRequest):
    """加载 ELF/AXF 文件，解析 DWARF 符号表"""
    result = monitor_backend.load_elf(uid, req.path)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "ELF load failed"))
    return result


@router.get("/probes/{uid}/monitor/elf/changed")
def check_elf_changed(uid: str):
    """检测已加载 ELF 文件是否在磁盘上变化（供前端轮询提醒重载）"""
    return monitor_backend.check_elf_changed(uid)


@router.get("/probes/{uid}/monitor/symbols")
def get_symbols(uid: str, filter: str = "", type: str = "object",
                page: int = 1, page_size: int = 200):
    """查询符号列表（分页）"""
    result = monitor_backend.get_symbols(uid, filter, type, page, page_size)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "No ELF loaded"))
    return result


# ── 变量管理 ──────────────────────────────────────────────

@router.get("/probes/{uid}/monitor/variables")
def list_variables(uid: str):
    """获取监视变量列表"""
    return {"variables": monitor_backend.get_variables(uid)}


@router.post("/probes/{uid}/monitor/variables")
def add_variable(uid: str, req: AddVariableRequest):
    """添加监视变量"""
    result = monitor_backend.add_variable(
        uid, req.name, req.address, req.type, req.remark, req.refresh_sec, req.elem_index
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Add variable failed"))
    return result


@router.delete("/probes/{uid}/monitor/variables/{var_id}")
def remove_variable(uid: str, var_id: str):
    """移除监视变量"""
    result = monitor_backend.remove_variable(uid, var_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail="Variable not found")
    return result


@router.put("/probes/{uid}/monitor/variables/{var_id}/value")
def write_variable(uid: str, var_id: str, req: WriteVariableRequest):
    """写入变量值到下位机（实时改参）"""
    result = monitor_backend.write_variable(uid, var_id, req.value)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Write failed"))
    return result


# ── 采样控制 ──────────────────────────────────────────────

@router.post("/probes/{uid}/monitor/start")
def start_sampling(uid: str, req: StartSamplingRequest):
    """启动采样"""
    result = monitor_backend.start(uid, req.rate_hz, req.max_points, req.transport)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Start failed"))
    return result


@router.post("/probes/{uid}/monitor/stop")
def stop_sampling(uid: str):
    """停止采样"""
    return monitor_backend.stop(uid)


# ── 录制导出 ──────────────────────────────────────────────

@router.get("/probes/{uid}/monitor/record/export")
def export_record(uid: str, format: str = "csv"):
    """导出录制数据"""
    if format != "csv":
        raise HTTPException(status_code=400, detail="Only csv format supported")
    result = monitor_backend.export_csv(uid)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Export failed"))
    return result
