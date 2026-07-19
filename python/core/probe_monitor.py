"""探针热插拔监控

后台定时轮询 USB 设备列表，检测探针插入/拔出，通过 WebSocket 推送事件。
"""

import asyncio
import threading
import logging
from core.pyocd_backend import backend
from core.events import event_manager

logger = logging.getLogger(__name__)

# 轮询间隔（秒）
POLL_INTERVAL = 2.0


class ProbeMonitor:
    """探针热插拔监控器"""

    def __init__(self, interval: float = POLL_INTERVAL):
        self._interval = interval
        self._thread: threading.Thread | None = None
        self._running = False
        self._loop: asyncio.AbstractEventLoop | None = None

    def start(self, loop: asyncio.AbstractEventLoop):
        """启动监控（在后台线程中运行）"""
        if self._running:
            return

        self._loop = loop
        self._running = True

        # 先做一次初始扫描，建立基线
        try:
            added, removed = backend.detect_probe_changes()
            for probe in added:
                event_manager.log("info", f"Probe detected: {probe.vendor} {probe.product} ({probe.uid[:16]})")
                asyncio.run_coroutine_threadsafe(
                    self._emit_async("probe.added", probe.__dict__), self._loop
                )
        except Exception as e:
            logger.warning(f"Initial probe scan failed: {e}")

        self._thread = threading.Thread(target=self._poll_loop, daemon=True, name="probe-monitor")
        self._thread.start()
        logger.info("Probe monitor started (interval=%.1fs)", self._interval)

    def stop(self):
        """停止监控"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        logger.info("Probe monitor stopped")

    def _poll_loop(self):
        """轮询循环（在后台线程中执行）"""
        while self._running:
            try:
                added, removed = backend.detect_probe_changes()

                for probe in added:
                    event_manager.log("info", f"Probe connected: {probe.vendor} {probe.product} ({probe.uid[:16]})")
                    if self._loop:
                        asyncio.run_coroutine_threadsafe(
                            self._emit_async("probe.added", probe.__dict__), self._loop
                        )

                for uid in removed:
                    event_manager.log("info", f"Probe disconnected: {uid[:16]}")
                    # 清理 RTT 会话（避免轮询线程访问已失效的 session）
                    try:
                        from core.rtt_backend import rtt_backend
                        if rtt_backend.is_running(uid):
                            rtt_backend.stop(uid)
                    except Exception:
                        pass
                    # 清理 Monitor 会话（采样线程、ELF、变量列表）
                    try:
                        from core.monitor_backend import monitor_backend
                        monitor_backend.on_probe_disconnected(uid)
                    except Exception:
                        pass
                    # 清理 Commander 会话
                    try:
                        from core.commander_backend import commander_backend
                        commander_backend.reset_context(uid)
                    except Exception:
                        pass
                    # 自动断开已消失探针的会话
                    if backend.is_connected(uid):
                        backend.disconnect(uid)
                    if self._loop:
                        asyncio.run_coroutine_threadsafe(
                            self._emit_async("probe.removed", {"uid": uid}), self._loop
                        )

            except Exception as e:
                logger.warning(f"Probe poll error: {e}")

            # 等待下一次轮询
            import time
            time.sleep(self._interval)

    async def _emit_async(self, event: str, data: dict):
        """在事件循环中推送事件"""
        event_manager.emit(event, data)


# 全局单例
probe_monitor = ProbeMonitor()
