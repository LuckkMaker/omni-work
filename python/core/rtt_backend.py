"""RTT (Real-Time Transfer) 后端

封装 pyOCD 的 RTTControlBlock，为每个已连接探针维护 RTT 会话。
后台轮询线程持续读取 up channel 数据，通过 WebSocket 推送到前端。
支持向 down channel 发送数据。

复用 pyOCD 的 RTT 实现（python/pyocd/debug/rtt.py），对标 J-Link RTT Viewer。
"""

import time
import base64
import threading
import logging
from typing import Optional

from core.pyocd_backend import backend
from core.events import event_manager

logger = logging.getLogger(__name__)

# 轮询间隔（秒）。10ms 平衡了实时性与 CPU 占用。
# pyOCD 的 rtt_cmd.py 用 1ms，但那是 CLI 单线程场景；
# 我们通过 WebSocket 推送，10ms 足够流畅且降低 CPU/USB 压力。
POLL_INTERVAL = 0.01


class RTTBackend:
    """RTT 后端

    为每个探针维护一个 RTTControlBlock 和轮询线程。
    线程安全：每个探针一把锁，协调 read（轮询线程）与 write（发送数据）。
    """

    def __init__(self):
        # uid -> RTTControlBlock
        self._control_blocks: dict[str, object] = {}
        # uid -> 轮询线程
        self._poll_threads: dict[str, threading.Thread] = {}
        # uid -> 运行标志（Event）
        self._running: dict[str, threading.Event] = {}
        # uid -> 锁（协调 up channel read 与 down channel write）
        self._locks: dict[str, threading.Lock] = {}
        # uid -> 选中的 up/down channel 索引
        self._up_channel: dict[str, int] = {}
        self._down_channel: dict[str, int] = {}
        # 全局锁，保护字典操作
        self._global_lock = threading.Lock()

    def start(
        self,
        uid: str,
        address: Optional[int] = None,
        size: Optional[int] = None,
        up_channel: int = 0,
        down_channel: int = 0,
    ) -> dict:
        """启动 RTT

        在目标 RAM 中搜索 RTT 控制块（SEGGER RTT 标识），解析 up/down 通道。
        搜索完成后恢复目标运行，使固件可以写入 RTT 缓冲区。

        Args:
            address: 控制块搜索起始地址，None 则自动扫描默认 RAM 区域
            size: 控制块搜索范围大小，None 则自动
            up_channel: 监听的 up channel 索引（target -> host）
            down_channel: 发送的 down channel 索引（host -> target）

        Returns:
            {success, up_channels, down_channels, error?}
        """
        # 已在运行则先返回当前状态
        with self._global_lock:
            if uid in self._control_blocks and self._running.get(uid, threading.Event()).is_set():
                cb = self._control_blocks[uid]
                return self._build_start_result(cb, uid, up_channel, down_channel)

        session = backend._get_session(uid)
        if not session:
            return {"success": False, "error": "Probe not connected"}

        target = session.target

        try:
            from pyocd.debug.rtt import RTTControlBlock

            event_manager.log("info", f"RTT: searching for control block" +
                              (f" at 0x{address:08X}" if address is not None else " (auto-detect)") +
                              "...")

            # halt 目标以便安全地搜索控制块
            target.halt()

            cb = RTTControlBlock.from_target(
                target,
                address=address,
                size=size,
                control_block_id=b'SEGGER RTT',
            )
            cb.start()

            num_up = len(cb.up_channels)
            num_down = len(cb.down_channels)

            if num_up == 0:
                event_manager.log("error", "RTT: no up channels found")
                return {"success": False, "error": "No up channels found. Ensure firmware has RTT initialized."}

            event_manager.log("info", f"RTT: control block found, {num_up} up channels, {num_down} down channels")

            # 验证 channel 索引有效性
            if up_channel >= num_up:
                up_channel = 0
            if down_channel >= num_down:
                down_channel = 0

            with self._global_lock:
                self._control_blocks[uid] = cb
                self._up_channel[uid] = up_channel
                self._down_channel[uid] = down_channel
                running = threading.Event()
                running.set()
                self._running[uid] = running
                self._locks[uid] = threading.Lock()

            # 恢复目标运行，使固件可以写入 RTT 缓冲区
            target.resume()

            event_manager.log("info", f"RTT: started (up={up_channel}, down={down_channel})")
            event_manager.emit("rtt.started", {"uid": uid})

            # 启动轮询线程
            thread = threading.Thread(target=self._poll_loop, args=(uid,), daemon=True)
            with self._global_lock:
                self._poll_threads[uid] = thread
            thread.start()

            return self._build_start_result(cb, uid, up_channel, down_channel)

        except Exception as e:
            logger.exception("RTT start failed")
            event_manager.log("error", f"RTT: start failed: {e}")
            event_manager.emit("rtt.error", {"uid": uid, "error": str(e)})
            return {"success": False, "error": str(e)}

    def _build_start_result(self, cb, uid: str, up_channel: int, down_channel: int) -> dict:
        """构建 start 成功返回结果"""
        up_channels = []
        for i, ch in enumerate(cb.up_channels):
            up_channels.append({
                "index": i,
                "name": ch.name if ch.name else "",
                "size": ch.size,
            })
        down_channels = []
        for i, ch in enumerate(cb.down_channels):
            down_channels.append({
                "index": i,
                "name": ch.name if ch.name else "",
                "size": ch.size,
            })
        return {
            "success": True,
            "up_channels": up_channels,
            "down_channels": down_channels,
            "up_channel": up_channel,
            "down_channel": down_channel,
        }

    def _poll_loop(self, uid: str):
        """轮询线程：持续读取 up channel 数据并推送到前端"""
        poll_interval = POLL_INTERVAL
        consecutive_errors = 0

        while True:
            running = self._running.get(uid)
            if running is None or not running.is_set():
                break

            lock = self._locks.get(uid)
            cb = self._control_blocks.get(uid)
            if lock is None or cb is None:
                break

            # 探针已断开
            if not backend.is_connected(uid):
                event_manager.emit("rtt.stopped", {"uid": uid, "reason": "disconnected"})
                break

            try:
                up_idx = self._up_channel.get(uid, 0)
                with lock:
                    if up_idx < len(cb.up_channels):
                        data = cb.up_channels[up_idx].read()
                        if data:
                            # 推送到前端
                            event_manager.emit("rtt.data", {
                                "uid": uid,
                                "channel": up_idx,
                                "data": base64.b64encode(data).decode("ascii"),
                                "size": len(data),
                            })
                consecutive_errors = 0
                time.sleep(poll_interval)
            except Exception as e:
                consecutive_errors += 1
                if consecutive_errors <= 3:
                    logger.warning(f"RTT poll error (#{consecutive_errors}): {e}")
                if consecutive_errors == 1:
                    event_manager.emit("rtt.error", {"uid": uid, "error": str(e)})
                # 错误时退避，避免刷屏
                time.sleep(min(0.5, poll_interval * (2 ** consecutive_errors)))

        # 线程退出时清理
        event_manager.log("info", f"RTT: polling stopped for probe {uid[:16]}")

    def send(self, uid: str, data: bytes, channel: Optional[int] = None) -> dict:
        """向 down channel 发送数据

        Args:
            data: 原始字节数据
            channel: down channel 索引，None 则使用启动时选中的
        """
        cb = self._control_blocks.get(uid)
        if cb is None:
            return {"success": False, "error": "RTT not started"}

        lock = self._locks.get(uid)
        if lock is None:
            return {"success": False, "error": "RTT not started"}

        down_idx = channel if channel is not None else self._down_channel.get(uid, 0)

        try:
            with lock:
                if down_idx >= len(cb.down_channels):
                    return {"success": False, "error": f"Invalid down channel {down_idx}"}
                if not cb.down_channels:
                    return {"success": False, "error": "No down channels available"}
                written = cb.down_channels[down_idx].write(data)
                return {"success": True, "bytes_written": written}
        except Exception as e:
            logger.exception("RTT send failed")
            return {"success": False, "error": str(e)}

    def send_text(self, uid: str, text: str, channel: Optional[int] = None, append_newline: bool = False) -> dict:
        """发送文本数据（UTF-8 编码）"""
        if append_newline:
            text += "\n"
        data = text.encode("utf-8")
        return self.send(uid, data, channel)

    def get_channels(self, uid: str) -> dict:
        """获取当前 RTT 通道信息"""
        cb = self._control_blocks.get(uid)
        if cb is None:
            return {"success": False, "error": "RTT not started"}
        return self._build_start_result(cb, uid, self._up_channel.get(uid, 0), self._down_channel.get(uid, 0))

    def is_running(self, uid: str) -> bool:
        """RTT 是否正在运行"""
        running = self._running.get(uid)
        return running is not None and running.is_set()

    def stop(self, uid: str) -> dict:
        """停止 RTT"""
        with self._global_lock:
            running = self._running.pop(uid, None)
            thread = self._poll_threads.pop(uid, None)
            self._control_blocks.pop(uid, None)
            self._locks.pop(uid, None)
            self._up_channel.pop(uid, None)
            self._down_channel.pop(uid, None)

        if running:
            running.clear()
        if thread:
            thread.join(timeout=2)

        event_manager.log("info", f"RTT: stopped")
        event_manager.emit("rtt.stopped", {"uid": uid, "reason": "user"})
        return {"success": True}

    def on_probe_disconnected(self, uid: str):
        """探针断开时调用，清理 RTT 会话"""
        if uid in self._control_blocks:
            self.stop(uid)

    def cleanup_all(self):
        """清理所有 RTT 会话（应用退出时调用）"""
        for uid in list(self._control_blocks.keys()):
            self.stop(uid)


# 全局单例
rtt_backend = RTTBackend()
