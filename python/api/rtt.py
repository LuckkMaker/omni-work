"""RTT Viewer REST API

对标 J-Link RTT Viewer，提供 RTT 会话的启动/停止、通道查询、数据发送接口。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core.rtt_backend import rtt_backend
from core.pyocd_backend import backend

router = APIRouter()


class RttStartRequest(BaseModel):
    """RTT 启动请求"""
    address: Optional[int] = None     # 控制块搜索起始地址（hex），None 则自动检测
    size: Optional[int] = None        # 搜索范围
    up_channel: int = 0               # 监听的 up channel（target -> host）
    down_channel: int = 0             # 发送的 down channel（host -> target）


class RttSendRequest(BaseModel):
    """RTT 发送数据请求"""
    data: str                         # base64 编码的原始字节数据
    channel: Optional[int] = None     # down channel 索引，None 则用启动时选中的


class RttSendTextRequest(BaseModel):
    """RTT 发送文本请求"""
    text: str
    channel: Optional[int] = None
    append_newline: bool = True       # 是否追加换行符


@router.get("/probes/{uid}/rtt/status")
def rtt_status(uid: str):
    """查询 RTT 状态"""
    return {
        "running": rtt_backend.is_running(uid),
        "connected": backend.is_connected(uid),
    }


@router.post("/probes/{uid}/rtt/start")
def rtt_start(uid: str, req: RttStartRequest):
    """启动 RTT 会话

    在目标 RAM 中搜索 SEGGER RTT 控制块，解析通道，恢复目标运行并开始轮询。
    注意：使用同步函数（非 async），FastAPI 会自动放入线程池执行，
    避免 time.sleep 和 SWD 操作阻塞事件循环。
    """
    result = rtt_backend.start(
        uid,
        address=req.address,
        size=req.size,
        up_channel=req.up_channel,
        down_channel=req.down_channel,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "RTT start failed"))
    return result


@router.post("/probes/{uid}/rtt/stop")
def rtt_stop(uid: str):
    """停止 RTT 会话"""
    return rtt_backend.stop(uid)


@router.get("/probes/{uid}/rtt/channels")
def rtt_channels(uid: str):
    """获取 RTT 通道信息"""
    result = rtt_backend.get_channels(uid)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "RTT not started"))
    return result


@router.post("/probes/{uid}/rtt/send")
def rtt_send(uid: str, req: RttSendRequest):
    """发送二进制数据到 down channel"""
    import base64
    try:
        data = base64.b64decode(req.data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")
    result = rtt_backend.send(uid, data, req.channel)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Send failed"))
    return result


@router.post("/probes/{uid}/rtt/send-text")
def rtt_send_text(uid: str, req: RttSendTextRequest):
    """发送文本数据到 down channel"""
    result = rtt_backend.send_text(uid, req.text, req.channel, req.append_newline)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Send failed"))
    return result
