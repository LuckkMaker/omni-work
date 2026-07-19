"""Monitor 后端：下位机变量实时监控与采样

对标 STM32CubeMonitor Direct 模式 + J-Scope，通过 SWD 非侵入读取目标 RAM 变量，
后台采样线程按固定频率批量读取，通过 WebSocket 推送到前端波形显示。

核心约束：
- 采样线程直接调用 session.target.read_memory_block8/block32，绝不调用 target.halt()，
  避免暂停 CPU（现有 PyOCDBackend.read_memory 会 halt，不能复用）。
- 多变量按地址排序后合并邻近地址为批量读，减少 SWD 事务开销。
- 与 RTT 互斥运行（同一探针下两者只能运行其一），避免 SWD 并发冲突。
- Flash/Commander 操作时自动暂停采样，操作完成后恢复。
"""

import time
import struct
import threading
import logging
from typing import Optional
from collections import deque
from dataclasses import dataclass, field

from core.pyocd_backend import backend
from core.events import event_manager

logger = logging.getLogger(__name__)

# 数据类型 -> (struct 格式, 字节大小)
TYPE_MAP = {
    "int8":   ("<b", 1),
    "uint8":  ("<B", 1),
    "int16":  ("<h", 2),
    "uint16": ("<H", 2),
    "int32":  ("<i", 4),
    "uint32": ("<I", 4),
    "float":  ("<f", 4),
}

# 批量读合并阈值：相邻变量地址间隔 <= 此值时合并为一次 USB 事务（字节）
MERGE_GAP = 4
# 高频推送批量阈值：当待推送样本数达到此值时打包一次 WS 推送
PUSH_BATCH = 8
# 错误退避上限
MAX_BACKOFF = 0.5


@dataclass
class MonitoredVariable:
    """被监视的变量"""
    id: str
    name: str
    address: int
    type: str               # int8/uint8/int16/uint16/int32/uint32/float
    size: int               # 字节数
    remark: str = ""        # 用户备注
    refresh_sec: float = 0  # 独立刷新周期（0=跟随全局采样率）


@dataclass
class SamplePoint:
    """单个采样点"""
    t_ms: float             # 相对采样起点的毫秒时间戳
    values: dict            # {var_id: value}


class RingBuffer:
    """环形缓冲区，存储最近 N 个采样点

    高频采样时自动覆盖最旧数据。支持暂停后回看、CSV 导出。
    """

    def __init__(self, max_points: int = 100000):
        self._buf: deque = deque(maxlen=max_points)
        self._lock = threading.Lock()

    def push(self, t_ms: float, values: dict):
        with self._lock:
            self._buf.append(SamplePoint(t_ms, values))

    def get_recent(self, n: int) -> list:
        """获取最近 n 个采样点"""
        with self._lock:
            n = min(n, len(self._buf))
            return list(self._buf)[-n:] if n > 0 else []

    def get_all(self) -> list:
        with self._lock:
            return list(self._buf)

    def clear(self):
        with self._lock:
            self._buf.clear()

    def __len__(self):
        with self._lock:
            return len(self._buf)


class MonitorBackend:
    """Monitor 采样后端

    为每个探针维护一个采样线程。线程安全：每探针一把锁，协调读/写变量与采样。
    """

    def __init__(self):
        # uid -> 变量列表
        self._variables: dict[str, list[MonitoredVariable]] = {}
        # uid -> 采样线程
        self._threads: dict[str, threading.Thread] = {}
        # uid -> 运行标志（Event，set=运行中）
        self._running: dict[str, threading.Event] = {}
        # uid -> 暂停标志（Event，set=未暂停；clear=已暂停）
        self._paused: dict[str, threading.Event] = {}
        # uid -> 锁（保护变量列表与采样协调）
        self._locks: dict[str, threading.Lock] = {}
        # uid -> 采样率
        self._rate_hz: dict[str, float] = {}
        # uid -> RingBuffer
        self._ring_buffers: dict[str, RingBuffer] = {}
        # uid -> ELF 符号解码器（缓存）
        self._elf_decoders: dict[str, object] = {}
        # uid -> ELF 文件句柄（保持打开以复用 decoder）
        self._elf_files: dict[str, object] = {}
        # uid -> 采样起点（monotonic）
        self._start_time: dict[str, float] = {}
        # 全局锁，保护字典操作
        self._global_lock = threading.Lock()

    # ── 采样控制 ──────────────────────────────────────────────

    def start(self, uid: str, rate_hz: float = 1000.0,
              max_points: int = 100000, transport: str = "swd") -> dict:
        """启动采样

        Args:
            rate_hz: 采样率（Hz）
            max_points: RingBuffer 容量
            transport: 传输模式（当前仅支持 "swd" 轮询；"rtt" 留待 5.4 阶段实现）
        """
        # 互斥检查：同一探针下 RTT 与 Monitor 不能同时运行
        try:
            from core.rtt_backend import rtt_backend
            if rtt_backend.is_running(uid):
                return {"success": False,
                        "error": "RTT 正在运行，请先停止 RTT 再启动 Monitor 采样"}
        except Exception:
            pass

        session = backend._get_session(uid)
        if not session:
            return {"success": False, "error": "探针未连接"}

        with self._global_lock:
            # 已在运行则先停止
            if uid in self._running and self._running[uid].is_set():
                self._stop_internal(uid)

            self._rate_hz[uid] = rate_hz
            self._ring_buffers[uid] = RingBuffer(max_points)
            running = threading.Event()
            running.set()
            self._running[uid] = running
            paused = threading.Event()
            paused.set()  # 初始未暂停
            self._paused[uid] = paused
            self._locks[uid] = threading.Lock()
            self._start_time[uid] = time.monotonic()

        variables = self._variables.get(uid, [])
        event_manager.log("info",
                          f"Monitor: 启动采样 (rate={rate_hz}Hz, vars={len(variables)}, "
                          f"transport={transport})")
        event_manager.emit("monitor.started", {
            "uid": uid,
            "rate_hz": rate_hz,
            "transport": transport,
            "variables": [self._var_to_dict(v) for v in variables],
        })

        thread = threading.Thread(target=self._sample_loop, args=(uid,), daemon=True,
                                  name=f"monitor-{uid[:8]}")
        with self._global_lock:
            self._threads[uid] = thread
        thread.start()

        return {"success": True, "rate_hz": rate_hz, "transport": transport}

    def stop(self, uid: str) -> dict:
        """停止采样"""
        with self._global_lock:
            self._stop_internal(uid)
        event_manager.log("info", "Monitor: 采样已停止")
        event_manager.emit("monitor.stopped", {"uid": uid, "reason": "user"})
        return {"success": True}

    def _stop_internal(self, uid: str):
        """内部停止（不加锁，调用方持有全局锁）"""
        running = self._running.pop(uid, None)
        thread = self._threads.pop(uid, None)
        self._paused.pop(uid, None)
        self._locks.pop(uid, None)
        self._rate_hz.pop(uid, None)
        self._start_time.pop(uid, None)
        # 保留 ring_buffer 供回看，直到下次 start 或探针断开
        if running:
            running.clear()
        if thread:
            thread.join(timeout=2)

    def pause(self, uid: str):
        """暂停采样（Flash/Commander 操作前调用）

        采样线程保持运行但跳过实际读取，保留会话状态。
        """
        paused = self._paused.get(uid)
        if paused and paused.is_set():
            paused.clear()
            event_manager.emit("monitor.info", {
                "uid": uid, "paused": True, "reason": "flash/commander 操作",
            })

    def resume(self, uid: str):
        """恢复采样"""
        paused = self._paused.get(uid)
        if paused and not paused.is_set():
            paused.set()
            event_manager.emit("monitor.info", {"uid": uid, "paused": False})

    def pause_during(self, uid: str):
        """上下文管理器：在 Flash/Commander 等独占操作期间自动暂停/恢复采样

        用法：
            with monitor_backend.pause_during(uid):
                await asyncio.to_thread(backend.erase, ...)
        """
        import contextlib

        @contextlib.contextmanager
        def _ctx():
            was_running = self.is_running(uid)
            if was_running and not self.is_paused(uid):
                self.pause(uid)
                try:
                    yield
                finally:
                    self.resume(uid)
            else:
                yield

        return _ctx()

    def is_running(self, uid: str) -> bool:
        running = self._running.get(uid)
        return running is not None and running.is_set()

    def is_paused(self, uid: str) -> bool:
        paused = self._paused.get(uid)
        return paused is not None and not paused.is_set()

    # ── 采样循环 ──────────────────────────────────────────────

    def _sample_loop(self, uid: str):
        """采样线程主循环

        按固定频率批量读取所有变量，推送到前端并写入 RingBuffer。
        """
        rate = self._rate_hz.get(uid, 1000.0)
        interval = 1.0 / rate if rate > 0 else 0.01
        consecutive_errors = 0
        pending_samples: list = []  # 批量推送缓冲

        while True:
            running = self._running.get(uid)
            if running is None or not running.is_set():
                break

            lock = self._locks.get(uid)
            if lock is None:
                break

            # 探针已断开
            if not backend.is_connected(uid):
                event_manager.emit("monitor.stopped", {"uid": uid, "reason": "disconnected"})
                break

            t0 = time.monotonic()

            # 暂停状态：跳过采样但保持线程存活
            paused = self._paused.get(uid)
            if paused is not None and not paused.is_set():
                time.sleep(min(0.1, interval))
                continue

            try:
                with lock:
                    values = self._read_variables(uid)

                if values:
                    start_t = self._start_time.get(uid, t0)
                    t_ms = (t0 - start_t) * 1000.0
                    sample = {"t_ms": t_ms, "values": values}
                    pending_samples.append(sample)

                    # 写入 RingBuffer
                    rb = self._ring_buffers.get(uid)
                    if rb:
                        rb.push(t_ms, dict(values))

                    # 批量推送，降低 WS 消息数
                    if len(pending_samples) >= PUSH_BATCH:
                        self._emit_samples(uid, pending_samples)
                        pending_samples.clear()

                consecutive_errors = 0
            except Exception as e:
                consecutive_errors += 1
                if consecutive_errors <= 3:
                    logger.warning(f"Monitor sample error (#{consecutive_errors}): {e}")
                if consecutive_errors == 1:
                    event_manager.emit("monitor.error", {"uid": uid, "error": str(e)})
                time.sleep(min(MAX_BACKOFF, interval * (2 ** consecutive_errors)))
                continue

            # 精确间隔控制
            elapsed = time.monotonic() - t0
            sleep_time = interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

        # 线程退出前刷出残留样本
        if pending_samples:
            self._emit_samples(uid, pending_samples)
        event_manager.log("info", f"Monitor: 采样线程退出 (probe {uid[:16]})")

    def _read_variables(self, uid: str) -> list:
        """批量读取所有变量

        按地址排序后合并邻近变量为批量 read_memory_block8，减少 SWD 事务。
        关键：直接用 session.target.read_memory_block8，绝不 halt。
        """
        variables = self._variables.get(uid, [])
        if not variables:
            return []

        session = backend._get_session(uid)
        if not session:
            return []
        target = session.target

        # 按地址排序
        sorted_vars = sorted(variables, key=lambda v: v.address)
        results: list = []
        i = 0
        n = len(sorted_vars)

        while i < n:
            # 合并邻近变量为一组（gap <= MERGE_GAP 字节）
            j = i
            group_end = sorted_vars[i].address + sorted_vars[i].size
            while j + 1 < n and sorted_vars[j + 1].address - group_end <= MERGE_GAP:
                j += 1
                group_end = max(group_end, sorted_vars[j].address + sorted_vars[j].size)

            # 4 字节对齐起止，便于 block32 读取（这里用 block8 兼容非对齐变量）
            start_addr = sorted_vars[i].address
            length = group_end - start_addr

            try:
                raw = bytes(target.read_memory_block8(start_addr, length))
                for v in sorted_vars[i:j + 1]:
                    offset = v.address - start_addr
                    val_bytes = raw[offset:offset + v.size]
                    if len(val_bytes) < v.size:
                        continue
                    value = self._decode(val_bytes, v.type)
                    results.append({"id": v.id, "value": value})
            except Exception as e:
                logger.debug(f"Monitor read failed @0x{start_addr:08X}: {e}")
                raise

            i = j + 1

        return results

    def _decode(self, raw: bytes, var_type: str):
        """按数据类型解码原始字节（小端）"""
        fmt, _ = TYPE_MAP.get(var_type, ("<I", 4))
        try:
            return struct.unpack(fmt, raw)[0]
        except struct.error:
            return None

    def _emit_samples(self, uid: str, samples: list):
        """批量推送采样点到前端"""
        event_manager.emit("monitor.sample", {"uid": uid, "samples": samples})

    # ── 变量管理 ──────────────────────────────────────────────

    def add_variable(self, uid: str, name: str, address: int, var_type: str,
                     remark: str = "", refresh_sec: float = 0) -> dict:
        """添加监视变量"""
        if var_type not in TYPE_MAP:
            return {"success": False, "error": f"不支持的数据类型: {var_type}"}
        _, size = TYPE_MAP[var_type]

        import uuid
        var_id = uuid.uuid4().hex[:12]
        var = MonitoredVariable(
            id=var_id, name=name, address=address, type=var_type,
            size=size, remark=remark, refresh_sec=refresh_sec,
        )

        with self._global_lock:
            self._variables.setdefault(uid, []).append(var)

        return {"success": True, "variable": self._var_to_dict(var)}

    def remove_variable(self, uid: str, var_id: str) -> dict:
        with self._global_lock:
            vars_list = self._variables.get(uid, [])
            before = len(vars_list)
            self._variables[uid] = [v for v in vars_list if v.id != var_id]
            removed = before - len(self._variables[uid])
        return {"success": removed > 0}

    def get_variables(self, uid: str) -> list:
        with self._global_lock:
            return [self._var_to_dict(v) for v in self._variables.get(uid, [])]

    def write_variable(self, uid: str, var_id: str, value: int) -> dict:
        """写入变量值到目标内存（P1：实时改参）"""
        with self._global_lock:
            var = next((v for v in self._variables.get(uid, []) if v.id == var_id), None)
        if not var:
            return {"success": False, "error": "变量不存在"}

        session = backend._get_session(uid)
        if not session:
            return {"success": False, "error": "探针未连接"}

        try:
            fmt, size = TYPE_MAP[var.type]
            # 数值钳制到类型范围
            packed = struct.pack(fmt, value)
            session.target.write_memory_block8(var.address, list(packed))
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ── ELF 符号解析 ──────────────────────────────────────────────

    def load_elf(self, uid: str, path: str) -> dict:
        """加载 ELF/AXF 文件，构建符号解码器

        复用 pyOCD 的 ElfSymbolDecoder（python/pyocd/debug/elf/decoder.py）。
        """
        try:
            from elftools.elf.elffile import ELFFile
            from pyocd.debug.elf.decoder import ElfSymbolDecoder

            # 关闭旧文件句柄
            old_file = self._elf_files.pop(uid, None)
            if old_file:
                try:
                    old_file.close()
                except Exception:
                    pass

            f = open(path, "rb")
            elf = ELFFile(f)
            decoder = ElfSymbolDecoder(elf)

            with self._global_lock:
                self._elf_decoders[uid] = decoder
                self._elf_files[uid] = f

            # 统计变量符号数
            var_count = sum(
                1 for info in decoder.symbol_dict.values()
                if info.type == "STT_OBJECT"
            )
            event_manager.log("info",
                              f"Monitor: ELF 已加载 ({path}), {var_count} 个变量符号")
            return {"success": True, "symbol_count": var_count, "path": path}
        except Exception as e:
            logger.exception("ELF load failed")
            return {"success": False, "error": str(e)}

    def get_symbols(self, uid: str, filter_str: str = "",
                    sym_type: str = "object", page: int = 1,
                    page_size: int = 200) -> dict:
        """查询符号列表（分页）

        Args:
            filter_str: 名称模糊过滤
            sym_type: "object"=仅变量, "func"=仅函数, "all"=全部
            page: 页码（1-based）
            page_size: 每页条数
        """
        decoder = self._elf_decoders.get(uid)
        if not decoder:
            return {"success": False, "error": "未加载 ELF 文件"}

        # 过滤
        symbols = []
        for name, info in decoder.symbol_dict.items():
            if sym_type == "object" and info.type != "STT_OBJECT":
                continue
            if sym_type == "func" and info.type != "STT_FUNC":
                continue
            if filter_str and filter_str.lower() not in name.lower():
                continue
            symbols.append({
                "name": name,
                "address": info.address,
                "size": info.size,
                "type": self._type_from_symbol(info),
            })

        # 排序：按地址
        symbols.sort(key=lambda s: s["address"])

        total = len(symbols)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = symbols[start:end]

        return {
            "success": True,
            "symbols": page_items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def _type_from_symbol(self, info) -> str:
        """从符号信息推断 Monitor 数据类型

        DWARF 详细类型信息需要解析 DIE，这里按 size 简单映射，
        默认按有符号处理（用户可在 UI 修正为 unsigned）。
        """
        size = info.size
        if size == 1:
            return "int8"
        if size == 2:
            return "int16"
        if size == 4:
            return "int32"  # 也可能是 float，用户可在 UI 切换
        return "int32"

    # ── 录制导出 ──────────────────────────────────────────────

    def export_csv(self, uid: str) -> dict:
        """导出 RingBuffer 数据为 CSV 字符串"""
        rb = self._ring_buffers.get(uid)
        if not rb:
            return {"success": False, "error": "无录制数据"}

        variables = self._variables.get(uid, [])
        var_map = {v.id: v for v in variables}

        lines = ["t_ms," + ",".join(v.name for v in variables)]
        for pt in rb.get_all():
            row = [f"{pt.t_ms:.3f}"]
            for v in variables:
                val = pt.values.get(v.id, "")
                row.append(str(val) if val is not None else "")
            lines.append(",".join(row))

        return {"success": True, "csv": "\n".join(lines), "count": len(lines) - 1}

    # ── 工具 ──────────────────────────────────────────────

    def _var_to_dict(self, v: MonitoredVariable) -> dict:
        return {
            "id": v.id,
            "name": v.name,
            "address": v.address,
            "type": v.type,
            "size": v.size,
            "remark": v.remark,
            "refresh_sec": v.refresh_sec,
        }

    def get_status(self, uid: str) -> dict:
        return {
            "running": self.is_running(uid),
            "paused": self.is_paused(uid),
            "connected": backend.is_connected(uid),
            "rate_hz": self._rate_hz.get(uid, 0),
            "variable_count": len(self._variables.get(uid, [])),
            "elf_loaded": uid in self._elf_decoders,
            "buffer_size": len(self._ring_buffers.get(uid, RingBuffer(1))),
        }

    def on_probe_disconnected(self, uid: str):
        """探针断开时调用，清理 Monitor 会话"""
        if uid in self._running or uid in self._variables:
            self.stop(uid)
        # 清理 ELF
        f = self._elf_files.pop(uid, None)
        if f:
            try:
                f.close()
            except Exception:
                pass
        self._elf_decoders.pop(uid, None)
        self._variables.pop(uid, None)
        self._ring_buffers.pop(uid, None)

    def cleanup_all(self):
        """清理所有 Monitor 会话（应用退出时调用）"""
        for uid in list(self._running.keys()):
            self.stop(uid)
        for uid in list(self._elf_files.keys()):
            try:
                self._elf_files[uid].close()
            except Exception:
                pass


# 全局单例
monitor_backend = MonitorBackend()
