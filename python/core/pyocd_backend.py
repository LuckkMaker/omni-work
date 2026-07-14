"""pyOCD 后端实现

基于 pyOCD 库实现 BackendInterface，提供 DAPLink 探针管理和 Flash 操作。
维护探针连接状态、会话生命周期，并支持热插拔检测。
"""

import time
import os
import threading
import logging
from typing import Optional
from dataclasses import dataclass, field
from enum import Enum

from core.interface import BackendInterface, ProbeInfo, TargetInfo, FlashResult
from core.events import event_manager

logger = logging.getLogger(__name__)


class ProbeState(Enum):
    """探针连接状态"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


@dataclass
class ProbeSession:
    """探针会话信息"""
    uid: str
    session: object = None
    state: ProbeState = ProbeState.DISCONNECTED
    target_info: Optional[TargetInfo] = None
    connected_at: float = 0.0
    error: Optional[str] = None


class PyOCDBackend(BackendInterface):
    """pyOCD 后端实现"""

    def __init__(self):
        self._sessions: dict[str, ProbeSession] = {}
        self._lock = threading.Lock()
        self._known_probe_uids: set[str] = set()
        self._pending_target: str | None = None  # 连接时使用的目标型号

    # ── 探针扫描 ──────────────────────────────────────────────

    def list_probes(self) -> list[ProbeInfo]:
        """扫描所有已连接的 CMSIS-DAP 探针"""
        from pyocd.core.helpers import ConnectHelper

        probes = ConnectHelper.get_all_connected_probes(blocking=False)
        result = []
        for probe in probes:
            result.append(ProbeInfo(
                uid=probe.unique_id,
                vendor=probe.vendor_name or "Unknown",
                product=probe.product_name or "Unknown",
                vid=getattr(probe, 'vid', 0) or 0,
                pid=getattr(probe, 'pid', 0) or 0,
                serial=getattr(probe, 'serial_number', None) or probe.unique_id,
            ))
        return result

    def get_probe_states(self) -> list[dict]:
        """返回所有探针及其连接状态"""
        probes = self.list_probes()
        result = []
        with self._lock:
            for p in probes:
                session = self._sessions.get(p.uid)
                state = session.state.value if session else ProbeState.DISCONNECTED.value
                target = session.target_info if session else None
                result.append({
                    **p.__dict__,
                    "state": state,
                    "target": target.__dict__ if target else None,
                })
        return result

    # ── 热插拔检测 ──────────────────────────────────────────────

    def detect_probe_changes(self) -> tuple[list[ProbeInfo], list[str]]:
        """检测探针变化，返回 (新增探针列表, 消失探针uid列表)"""
        current_probes = self.list_probes()
        current_uids = {p.uid for p in current_probes}

        with self._lock:
            added = [p for p in current_probes if p.uid not in self._known_probe_uids]
            removed = [uid for uid in self._known_probe_uids if uid not in current_uids]
            self._known_probe_uids = current_uids

        return added, removed

    # ── 连接管理 ──────────────────────────────────────────────

    def connect(self, probe_uid: str) -> bool:
        """连接指定探针"""
        from pyocd.core.helpers import ConnectHelper

        with self._lock:
            existing = self._sessions.get(probe_uid)
            if existing and existing.state == ProbeState.CONNECTED:
                return True

            # 创建或更新会话记录
            session_info = ProbeSession(uid=probe_uid, state=ProbeState.CONNECTING)
            self._sessions[probe_uid] = session_info

        event_manager.log("info", f"Connecting to probe {probe_uid[:16]}...")

        try:
            session = ConnectHelper.session_with_chosen_probe(
                blocking=False,
                unique_id=probe_uid,
                target_override=self._pending_target,
            )
            if session is None:
                with self._lock:
                    session_info.state = ProbeState.ERROR
                    session_info.error = "Probe not found"
                event_manager.log("error", f"Probe {probe_uid[:16]} not found")
                event_manager.emit("probe.disconnected", {"uid": probe_uid, "reason": "not_found"})
                return False

            session.open()

            with self._lock:
                session_info.session = session
                session_info.state = ProbeState.CONNECTED
                session_info.connected_at = time.time()
                session_info.error = None

            # 获取目标信息
            target_info = self._extract_target_info(session)
            with self._lock:
                session_info.target_info = target_info

            event_manager.log("info", f"Connected to {probe_uid[:16]}")
            if target_info:
                event_manager.log("info", f"Target: {target_info.part_number} ({target_info.core})")
                event_manager.emit("probe.connected", {
                    "uid": probe_uid,
                    "target": target_info.__dict__,
                })
            else:
                event_manager.emit("probe.connected", {"uid": probe_uid, "target": None})

            return True

        except Exception as e:
            with self._lock:
                session_info.state = ProbeState.ERROR
                session_info.error = str(e)
            event_manager.log("error", f"Connection failed: {e}")
            event_manager.emit("probe.disconnected", {"uid": probe_uid, "reason": "error"})
            return False

    def disconnect(self, probe_uid: str) -> bool:
        """断开探针"""
        with self._lock:
            session_info = self._sessions.pop(probe_uid, None)

        if session_info and session_info.session:
            try:
                session_info.session.close()
                event_manager.log("info", f"Disconnected from {probe_uid[:16]}")
            except Exception as e:
                event_manager.log("warning", f"Disconnect error: {e}")

        event_manager.emit("probe.disconnected", {"uid": probe_uid, "reason": "user"})
        return True

    def get_state(self, probe_uid: str) -> ProbeState:
        """获取探针连接状态"""
        with self._lock:
            session = self._sessions.get(probe_uid)
            return session.state if session else ProbeState.DISCONNECTED

    def is_connected(self, probe_uid: str) -> bool:
        """检查探针是否已连接"""
        return self.get_state(probe_uid) == ProbeState.CONNECTED

    def _get_session(self, probe_uid: str):
        """获取已连接的 pyOCD session，未连接则返回 None"""
        with self._lock:
            session_info = self._sessions.get(probe_uid)
            if not session_info or session_info.state != ProbeState.CONNECTED:
                return None
            return session_info.session

    def _extract_target_info(self, session) -> Optional[TargetInfo]:
        """从 pyOCD session 中提取目标芯片信息"""
        target = session.target
        if not target:
            return None

        flash_start = 0
        flash_size = 0
        page_size = 0
        sector_size = 0

        try:
            flash = target.memory_map.get_boot_memory()
            if flash:
                flash_start = flash.start
                flash_size = flash.length
                page_size = getattr(flash, 'page_size', 0) or 0
                sector_size = getattr(flash, 'sector_size', 0) or 2048
        except Exception:
            pass

        # pyOCD 的 part_number 在 generic cortex_m 模式下为 CoreSightTarget
        # 优先使用 session.options 中的 target_override
        try:
            part_number = session.options.get('target_override')
        except Exception:
            part_number = None
        if not part_number:
            part_number = getattr(target, 'part_number', None) or 'Unknown'
        
        # 获取 CPU 核心信息
        core = 'Unknown'
        try:
            # 尝试从 CoreRegister 或 cortex_m 获取
            if hasattr(target, 'core') and target.core:
                core = str(target.core)
            elif hasattr(target, '_core'):
                core = str(target._core)
        except Exception:
            pass
        
        # 如果 core 仍是 Unknown，从 part_number 推断
        if core == 'Unknown' and part_number != 'Unknown':
            core = part_number

        return TargetInfo(
            part_number=part_number,
            core=core,
            flash_start=flash_start,
            flash_size=flash_size,
            page_size=page_size,
            sector_size=sector_size,
        )

    # ── 目标管理 ──────────────────────────────────────────────

    def get_target_info(self, probe_uid: str) -> Optional[TargetInfo]:
        """获取当前连接目标的芯片信息"""
        with self._lock:
            session_info = self._sessions.get(probe_uid)
            if session_info and session_info.target_info:
                return session_info.target_info

        session = self._get_session(probe_uid)
        if not session:
            return None

        target_info = self._extract_target_info(session)
        with self._lock:
            if probe_uid in self._sessions:
                self._sessions[probe_uid].target_info = target_info

        return target_info

    def set_target(self, probe_uid: str, part_number: str) -> bool:
        """手动设置目标芯片型号（需要重新连接）"""
        self.disconnect(probe_uid)
        self._pending_target = part_number

        from pyocd.core.helpers import ConnectHelper

        event_manager.log("info", f"Setting target to {part_number}...")

        try:
            session = ConnectHelper.session_with_chosen_probe(
                blocking=False,
                unique_id=probe_uid,
                target_override=part_number,
            )
            if session is None:
                event_manager.log("error", f"Probe {probe_uid[:16]} not found")
                return False

            session.open()

            with self._lock:
                session_info = ProbeSession(
                    uid=probe_uid,
                    session=session,
                    state=ProbeState.CONNECTED,
                    connected_at=time.time(),
                )
                session_info.target_info = self._extract_target_info(session)
                self._sessions[probe_uid] = session_info

            event_manager.log("info", f"Target set to {part_number}")
            event_manager.emit("probe.connected", {
                "uid": probe_uid,
                "target": session_info.target_info.__dict__ if session_info.target_info else None,
            })
            return True
        except Exception as e:
            logger.exception(f"Failed to set target {part_number}")
            event_manager.log("error", f"Failed to set target {part_number}: {e}")
            with self._lock:
                self._sessions[probe_uid] = ProbeSession(
                    uid=probe_uid,
                    state=ProbeState.ERROR,
                    error=str(e),
                )
            return False

    # ── Flash 操作 ──────────────────────────────────────────────

    def erase(
        self,
        probe_uid: str,
        erase_type: str = "chip",
        address: int = 0,
        size: int = 0,
    ) -> FlashResult:
        """擦除 Flash"""
        session = self._get_session(probe_uid)
        if not session:
            return FlashResult(success=False, error="Not connected")

        start_time = time.time()
        try:
            from pyocd.flash.flash import Flash

            region = session.target.memory_map.get_boot_memory()
            if not region:
                return FlashResult(success=False, error="No flash memory found")

            flash = region.flash  # Flash 实例（非 FlashRegion）

            if erase_type == "chip":
                event_manager.log("info", "Erasing chip...")
                event_manager.emit("flash.progress", {
                    "phase": "erase", "current": 0, "total": 1, "percent": 0,
                })
                # 使用 Flash.erase_all() 进行全片擦除
                flash.init(Flash.Operation.ERASE)
                try:
                    if flash.is_erase_all_supported:
                        flash.erase_all()
                    else:
                        # 不支持 erase_all 时，逐扇区擦除
                        sector_size = getattr(region, 'sector_size', 0) or 16384
                        total_sectors = region.length // sector_size
                        for i in range(total_sectors):
                            flash.erase_sector(region.start + i * sector_size)
                            event_manager.emit("flash.progress", {
                                "phase": "erase", "current": i + 1, "total": total_sectors,
                                "percent": round((i + 1) / total_sectors * 100, 2),
                            })
                finally:
                    flash.uninit()
                event_manager.emit("flash.progress", {
                    "phase": "erase", "current": 1, "total": 1, "percent": 100,
                })
            else:
                event_manager.log("info", f"Erasing sector at 0x{address:08X}...")
                event_manager.emit("flash.progress", {
                    "phase": "erase", "current": 0, "total": 1, "percent": 0,
                })
                # 扇区擦除
                flash.init(Flash.Operation.ERASE)
                try:
                    flash.erase_sector(address)
                finally:
                    flash.uninit()
                event_manager.emit("flash.progress", {
                    "phase": "erase", "current": 1, "total": 1, "percent": 100,
                })

            duration = int((time.time() - start_time) * 1000)
            event_manager.log("info", f"Erase complete ({duration}ms)")
            return FlashResult(success=True, duration_ms=duration)
        except Exception as e:
            logger.exception("Erase failed")
            event_manager.log("error", f"Erase failed: {e}")
            return FlashResult(
                success=False,
                error=str(e),
                duration_ms=int((time.time() - start_time) * 1000),
            )

    def program(
        self,
        probe_uid: str,
        file_path: str,
        verify: bool = True,
        reset: bool = True,
    ) -> FlashResult:
        """烧录固件"""
        session = self._get_session(probe_uid)
        if not session:
            return FlashResult(success=False, error="Not connected")

        if not os.path.exists(file_path):
            return FlashResult(success=False, error=f"File not found: {file_path}")

        start_time = time.time()
        file_size = os.path.getsize(file_path)

        try:
            from pyocd.flash.file_programmer import FileProgrammer

            event_manager.log("info", f"Programming {file_size} bytes from {os.path.basename(file_path)}...")

            def progress_callback(percent: float):
                event_manager.emit("flash.progress", {
                    "phase": "program",
                    "current": int(file_size * percent / 100),
                    "total": file_size,
                    "percent": round(percent, 2),
                })

            # 确定文件格式和基地址
            ext = os.path.splitext(file_path)[1].lower()
            kwargs = {}
            if ext == ".bin":
                # BIN 文件需要指定基地址（FileProgrammer 参数名为 base_address）
                region = session.target.memory_map.get_boot_memory()
                if region:
                    kwargs["base_address"] = region.start
                event_manager.log("info", f"BIN file, base address: 0x{kwargs.get('base_address', 0):08X}")

            # 计算实际数据大小（HEX/ELF 文件大小 ≠ 数据大小）
            data_segments = self._extract_file_data(session, file_path, ext)
            actual_data_size = sum(len(d) for _, d in data_segments) if data_segments else file_size

            # 使用 chip_erase="chip" 强制全片擦除
            # 原因：chip_erase="auto" 在已擦除的 Flash 上会跳过擦除，导致编程静默失败
            programmer = FileProgrammer(session, progress=progress_callback, chip_erase="chip")

            # 注意：FileProgrammer.program() 不支持 verify 参数（pyOCD 0.44 的 FlashLoader.commit 中 verify 为 TODO）
            # 烧录后如需校验，调用独立的 verify() 方法
            programmer.program(file_path, **kwargs)

            duration = int((time.time() - start_time) * 1000)
            speed_kbps = (file_size / 1024) / (duration / 1000) if duration > 0 else 0

            # 烧录后自动校验
            verify_ok = True
            if verify:
                event_manager.log("info", "Verifying...")
                event_manager.emit("flash.progress", {
                    "phase": "verify", "current": 0, "total": actual_data_size, "percent": 0,
                })
                verify_result = self.verify(probe_uid, file_path)
                verify_ok = verify_result.success
                if not verify_ok:
                    event_manager.log("error", f"Verify failed: {verify_result.error}")
                    return FlashResult(
                        success=False,
                        error=f"Verify failed: {verify_result.error}",
                        bytes_written=actual_data_size,
                        duration_ms=duration + verify_result.duration_ms,
                    )

            if reset:
                event_manager.log("info", "Reset and run")
                session.target.reset()

            event_manager.log("info", f"Done in {duration}ms ({speed_kbps:.1f} KB/s)")

            return FlashResult(
                success=True,
                bytes_written=actual_data_size,
                duration_ms=duration,
            )
        except Exception as e:
            logger.exception("Programming failed")
            event_manager.log("error", f"Programming failed: {e}")
            return FlashResult(
                success=False,
                error=str(e),
                duration_ms=int((time.time() - start_time) * 1000),
            )

    def verify(self, probe_uid: str, file_path: str) -> FlashResult:
        """校验 Flash 内容：读取 Flash 并与文件数据逐字节对比"""
        session = self._get_session(probe_uid)
        if not session:
            return FlashResult(success=False, error="Not connected")

        if not os.path.exists(file_path):
            return FlashResult(success=False, error=f"File not found: {file_path}")

        start_time = time.time()
        try:
            ext = os.path.splitext(file_path)[1].lower()
            event_manager.log("info", f"Verifying {ext} file...")

            # 停止目标，确保 Flash 读取稳定
            session.target.halt()

            # 提取文件中的数据段 [(address, data_bytes), ...]
            segments = self._extract_file_data(session, file_path, ext)
            if not segments:
                return FlashResult(success=False, error="No data segments found in file")

            total_bytes = sum(len(d) for _, d in segments)
            verified_bytes = 0
            event_manager.emit("flash.progress", {
                "phase": "verify", "current": 0, "total": total_bytes, "percent": 0,
            })

            chunk_size = 4096
            for seg_addr, seg_data in segments:
                # 分块读取 Flash 并对比
                for offset in range(0, len(seg_data), chunk_size):
                    read_len = min(chunk_size, len(seg_data) - offset)
                    flash_data = session.target.read_memory_block8(seg_addr + offset, read_len)
                    file_chunk = seg_data[offset:offset + read_len]

                    if bytes(flash_data) != bytes(file_chunk):
                        # 找到第一个不匹配的字节
                        for i in range(read_len):
                            if flash_data[i] != file_chunk[i]:
                                mismatch_addr = seg_addr + offset + i
                                event_manager.log("error",
                                    f"Verify failed at 0x{mismatch_addr:08X}: "
                                    f"expected 0x{file_chunk[i]:02X}, got 0x{flash_data[i]:02X}")
                                break
                        return FlashResult(
                            success=False,
                            error=f"Verification failed at 0x{mismatch_addr:08X}",
                            duration_ms=int((time.time() - start_time) * 1000),
                        )

                    verified_bytes += read_len
                    event_manager.emit("flash.progress", {
                        "phase": "verify",
                        "current": verified_bytes,
                        "total": total_bytes,
                        "percent": round(verified_bytes / total_bytes * 100, 2),
                    })

            event_manager.emit("flash.progress", {
                "phase": "verify", "current": total_bytes, "total": total_bytes, "percent": 100,
            })
            duration = int((time.time() - start_time) * 1000)
            event_manager.log("info", f"Verify OK ({total_bytes} bytes, {duration}ms)")
            return FlashResult(success=True, duration_ms=duration)
        except Exception as e:
            logger.exception("Verify failed")
            event_manager.log("error", f"Verify failed: {e}")
            return FlashResult(success=False, error=str(e))

    def _extract_file_data(self, session, file_path: str, ext: str) -> list[tuple[int, bytes]]:
        """从固件文件中提取数据段，返回 [(address, data_bytes), ...]"""
        if ext == ".bin":
            region = session.target.memory_map.get_boot_memory()
            base_addr = region.start if region else 0
            with open(file_path, 'rb') as f:
                data = f.read()
            return [(base_addr, data)]

        elif ext == ".hex":
            return self._parse_hex_data(file_path)

        elif ext == ".elf":
            return self._parse_elf_data(file_path)

        else:
            return []

    def _parse_hex_data(self, file_path: str) -> list[tuple[int, bytes]]:
        """解析 Intel HEX 文件，返回 [(address, data_bytes), ...]"""
        segments = []
        current_addr = 0
        base_addr = 0
        seg_start = None
        seg_data = bytearray()

        with open(file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or not line.startswith(":"):
                    continue

                data_str = line[1:]
                byte_count = int(data_str[0:2], 16)
                address = int(data_str[2:6], 16)
                record_type = int(data_str[6:8], 16)
                data_hex = data_str[8:8 + byte_count * 2]

                if record_type == 0:  # Data record
                    full_addr = base_addr + address
                    if seg_start is None:
                        seg_start = full_addr
                    elif full_addr != seg_start + len(seg_data):
                        # 地址不连续，保存当前段并开始新段
                        segments.append((seg_start, bytes(seg_data)))
                        seg_start = full_addr
                        seg_data = bytearray()
                    seg_data.extend(bytes.fromhex(data_hex))
                elif record_type == 4:  # Extended linear address
                    if seg_start is not None and seg_data:
                        segments.append((seg_start, bytes(seg_data)))
                        seg_start = None
                        seg_data = bytearray()
                    base_addr = int(data_str[8:12], 16) << 16
                elif record_type == 1:  # End of file
                    break

        if seg_start is not None and seg_data:
            segments.append((seg_start, bytes(seg_data)))

        return segments

    def _parse_elf_data(self, file_path: str) -> list[tuple[int, bytes]]:
        """解析 ELF 文件，返回 [(address, data_bytes), ...]"""
        from elftools.elf.elffile import ELFFile

        segments = []
        with open(file_path, 'rb') as f:
            elf = ELFFile(f)
            for section in elf.iter_sections():
                if (section.header.sh_type == 'SHT_PROGBITS'
                        and section.header.sh_size > 0
                        and section.header.sh_flags & 0x2):  # SHF_ALLOC
                    data = section.data()
                    if data:
                        segments.append((section.header.sh_addr, data))
        return segments

    def reset(self, probe_uid: str, reset_type: str = "hw", run: bool = True) -> bool:
        """复位目标"""
        session = self._get_session(probe_uid)
        if not session:
            return False

        try:
            if reset_type == "hw":
                session.probe.reset()
            else:
                session.target.reset()

            if run:
                session.target.resume()

            event_manager.log("info", f"Reset ({reset_type})")
            return True
        except Exception as e:
            event_manager.log("error", f"Reset failed: {e}")
            return False

    def read_memory(self, probe_uid: str, address: int, size: int) -> bytes:
        """读取内存"""
        session = self._get_session(probe_uid)
        if not session:
            raise RuntimeError("Not connected")

        session.target.halt()
        return bytes(session.target.read_memory_block8(address, size))

    # ── 清理 ──────────────────────────────────────────────

    def cleanup(self):
        """关闭所有会话"""
        with self._lock:
            uids = list(self._sessions.keys())

        for uid in uids:
            self.disconnect(uid)


# 全局单例
backend = PyOCDBackend()
