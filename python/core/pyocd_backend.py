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

from core.interface import BackendInterface, ProbeInfo, TargetInfo, FlashResult, FlashRegionInfo, SectorInfo
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

    # 默认目标型号（DAPLink 无法自动探测 MCU 型号，需指定）
    DEFAULT_TARGET = "stm32f407xg"

    def __init__(self):
        self._sessions: dict[str, ProbeSession] = {}
        self._lock = threading.Lock()
        self._known_probe_uids: set[str] = set()
        self._pending_target: str | None = None  # 连接时使用的目标型号
        self._probe_info_cache: dict[str, ProbeInfo] = {}  # 缓存探针初始信息（避免连接后名称变化）
        self._cancel_flag: threading.Event = threading.Event()

    # ── 探针扫描 ──────────────────────────────────────────────

    def cancel_operation(self):
        """取消正在进行的 Flash 操作（check_blank / read_back / erase / program）"""
        self._cancel_flag.set()
        event_manager.log("warning", "操作取消请求已发送")

    def _check_cancel(self) -> bool:
        """检查取消标志，如果已取消则重置并返回 True"""
        if self._cancel_flag.is_set():
            self._cancel_flag.clear()
            return True
        return False

    def list_probes(self) -> list[ProbeInfo]:
        """扫描所有已连接的 CMSIS-DAP 探针（缓存初始信息，避免连接后名称变化）"""
        from pyocd.core.helpers import ConnectHelper

        probes = ConnectHelper.get_all_connected_probes(blocking=False)
        result = []
        for probe in probes:
            uid = probe.unique_id
            # 首次发现时缓存探针信息；已连接的探针 product_name 会变化，用缓存保持一致
            if uid not in self._probe_info_cache:
                info = ProbeInfo(
                    uid=uid,
                    vendor=probe.vendor_name or "Unknown",
                    product=probe.product_name or "Unknown",
                    vid=getattr(probe, 'vid', 0) or 0,
                    pid=getattr(probe, 'pid', 0) or 0,
                    serial=getattr(probe, 'serial_number', None) or uid,
                )
                self._probe_info_cache[uid] = info
            result.append(self._probe_info_cache[uid])
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
                    "target": target.to_dict() if target else None,
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
            # 清理已拔出探针的信息缓存
            for uid in removed:
                self._probe_info_cache.pop(uid, None)

        return added, removed

    # ── 连接管理 ──────────────────────────────────────────────

    def connect(self, probe_uid: str, target: str | None = None,
                interface: str = "swd", speed: int | None = None) -> bool:
        """连接指定探针

        Args:
            probe_uid: 探针唯一 ID
            target: 目标型号（如 stm32f407xg），None 则使用默认
            interface: 调试接口 "swd" 或 "jtag"
            speed: 时钟频率 (Hz)，None 则使用默认
        """
        from pyocd.core.helpers import ConnectHelper

        with self._lock:
            existing = self._sessions.get(probe_uid)
            if existing and existing.state == ProbeState.CONNECTED:
                return True

            # 创建或更新会话记录
            session_info = ProbeSession(uid=probe_uid, state=ProbeState.CONNECTING)
            self._sessions[probe_uid] = session_info

        event_manager.log("info", f"Connecting to probe {probe_uid[:16]}...")

        # 确定目标型号
        target_override = target or self._pending_target or self.DEFAULT_TARGET

        # 构建 pyOCD 选项
        options = {
            # 启用延迟传输：将多个寄存器读写批量打包到 USB 包中，减少 USB 往返次数
            # 对 CMSIS-DAP v2 (WinUSB bulk) 提升尤为显著，读取速度可提升 5-10 倍
            'cmsis_dap.deferred_transfers': True,
        }
        if speed:
            options['frequency'] = speed
        # 接口协议通过 dap_protocol 选项设置
        if interface == 'jtag':
            options['dap_protocol'] = 'jtag'
        else:
            options['dap_protocol'] = 'swd'

        try:
            session = ConnectHelper.session_with_chosen_probe(
                blocking=False,
                unique_id=probe_uid,
                target_override=target_override,
                init_board=False,
                options=options,
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

            # 诊断：输出 CMSIS-DAP 传输参数
            try:
                probe = session.probe
                link = getattr(probe, '_link', None)
                if link:
                    # is_bulk 在 _interface 上，不是 link 本身
                    iface = getattr(link, '_interface', None)
                    if iface is not None:
                        is_bulk = getattr(iface, 'is_bulk', False)
                        pkt_size = link.identify(link.ID.MAX_PACKET_SIZE) if hasattr(link, 'identify') else '?'
                        pkt_count = link.identify(link.ID.MAX_PACKET_COUNT) if hasattr(link, 'identify') else '?'
                        proto = "v2 (WinUSB bulk)" if is_bulk else "v1 (HID)"
                        event_manager.log("info", f"CMSIS-DAP {proto}, packet_size={pkt_size}, packet_count={pkt_count}, deferred=True")
            except Exception:
                pass

            event_manager.emit("probe.connected", {
                "uid": probe_uid,
                "target": target_info.to_dict() if target_info else None,
            })

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
            # 先通知前端探针已断开，UI 立即更新
            event_manager.emit("probe.disconnected", {"uid": probe_uid, "reason": "user"})

            # session.close() 耗时取决于底层 USB 通信，可能数秒。
            # 放入后台线程执行以避免阻塞前端。
            import threading
            session = session_info.session
            t = threading.Thread(target=self._close_session, args=(session,), daemon=True)
            t.start()

        return True

    def _close_session(self, session):
        """后台关闭 pyOCD session，避免 blocking 前端"""
        try:
            # 设置 resume_on_disconnect=False 避免 target.resume() 耗时操作
            session.options.set('resume_on_disconnect', False)
            session.close()
        except Exception:
            pass  # 后台清理，忽略超时等异常

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
        flash_regions_info: list[FlashRegionInfo] = []
        sectors_info: list[SectorInfo] = []
        ram_start = 0
        ram_size = 0

        try:
            from pyocd.core.memory_map import MemoryType

            # Flash 区域
            flash_regions = [r for r in target.memory_map if r.type == MemoryType.FLASH]
            if flash_regions:
                first = flash_regions[0]
                flash_start = first.start
                page_size = getattr(first, 'page_size', 0) or 0
                sector_size = getattr(first, 'sector_size', 0) or 2048
                flash_size = sum(r.length for r in flash_regions)

                # 构建完整的 Flash 区域列表和扇区列表
                sector_index = 0
                for r in flash_regions:
                    r_sector_size = getattr(r, 'sector_size', 0) or 2048
                    r_page_size = getattr(r, 'page_size', 0) or page_size
                    r_is_boot = getattr(r, 'is_boot_memory', False)

                    flash_regions_info.append(FlashRegionInfo(
                        start=r.start,
                        length=r.length,
                        sector_size=r_sector_size,
                        page_size=r_page_size,
                        is_boot_memory=r_is_boot,
                    ))

                    # 该 region 内的所有扇区
                    for offset in range(0, r.length, r_sector_size):
                        sectors_info.append(SectorInfo(
                            index=sector_index,
                            address=r.start + offset,
                            size=r_sector_size,
                        ))
                        sector_index += 1

            # RAM 区域
            ram_regions = [r for r in target.memory_map if r.type == MemoryType.RAM]
            if ram_regions:
                ram_start = ram_regions[0].start
                ram_size = sum(r.length for r in ram_regions)
        except Exception:
            pass

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
            # 优先使用 selected_core（pyOCD 新版 API）
            sel_core = getattr(target, 'selected_core', None)
            if sel_core is not None:
                core_type = type(sel_core).__name__
                # CortexM -> Cortex-M
                core_map = {
                    'CortexM': 'Cortex-M',
                    'CortexM4': 'Cortex-M4',
                    'CortexM7': 'Cortex-M7',
                    'CortexM0': 'Cortex-M0',
                    'CortexM0Plus': 'Cortex-M0+',
                }
                core = core_map.get(core_type, core_type)
            elif hasattr(target, '_core') and target._core is not None:
                core = str(target._core)
        except Exception:
            pass

        # 如果 core 仍是 Unknown，根据 part_number 推断
        if core == 'Unknown' and part_number != 'Unknown':
            if 'stm32f4' in part_number.lower() or 'apm32f4' in part_number.lower():
                core = 'Cortex-M4'
            elif 'stm32f1' in part_number.lower() or 'apm32f1' in part_number.lower():
                core = 'Cortex-M3'
            elif 'stm32l4' in part_number.lower():
                core = 'Cortex-M4'
            elif 'stm32h7' in part_number.lower():
                core = 'Cortex-M7'
            elif 'g32' in part_number.lower():
                core = 'Cortex-M0+'
            else:
                core = part_number

        # 读取 Core ID (DPIDR)
        core_id = ""
        try:
            # 方式1: target.dp.dpidr.idr（最直接）
            dp = getattr(target, 'dp', None)
            if dp is not None:
                dpidr_obj = getattr(dp, 'dpidr', None)
                if dpidr_obj is not None:
                    raw_idr = getattr(dpidr_obj, 'idr', 0)
                    if raw_idr:
                        core_id = f"0x{raw_idr:08X}"
            # 方式2: 通过 core -> ap -> dp -> dpidr
            if not core_id:
                sel_core = getattr(target, 'selected_core', None)
                if sel_core is not None:
                    ap = getattr(sel_core, 'ap', None)
                    if ap is not None:
                        dp = getattr(ap, 'dp', None)
                        if dp is not None:
                            dpidr_obj = getattr(dp, 'dpidr', None)
                            if dpidr_obj is not None:
                                raw_idr = getattr(dpidr_obj, 'idr', 0)
                                if raw_idr:
                                    core_id = f"0x{raw_idr:08X}"
        except Exception:
            pass

        # 读取 Device ID 和 Revision ID（DBGMCU_IDCODE 寄存器）
        # 地址 0xE0042000：bits[31:16]=Revision ID, bits[11:0]=Device ID
        device_id = ""
        revision_id = ""
        try:
            idcode = target.read32(0xE0042000)
            dev_id = idcode & 0xFFF  # 低 12 位
            rev_id = (idcode >> 16) & 0xFFFF  # 高 16 位
            device_id = f"0x{dev_id:03X}"
            revision_id = f"0x{rev_id:04X}"
            logger.info(f"DBGMCU_IDCODE @ 0xE0042000 = 0x{idcode:08X}, Device ID={device_id}, Revision ID={revision_id}")
        except Exception as e:
            logger.warning(f"Failed to read DBGMCU_IDCODE at 0xE0042000: {e}")

        return TargetInfo(
            part_number=part_number,
            core=core,
            flash_start=flash_start,
            flash_size=flash_size,
            page_size=page_size,
            sector_size=sector_size,
            core_id=core_id,
            device_id=device_id,
            revision_id=revision_id,
            endian="Little",
            flash_regions=flash_regions_info,
            sectors=sectors_info,
            ram_start=ram_start,
            ram_size=ram_size,
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
                "target": session_info.target_info.to_dict() if session_info.target_info else None,
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

            # 擦除前复位并暂停目标，确保目标处于已知状态。
            # 目标可能正在运行用户代码，Flash 控制器状态未知，直接擦除
            # 会导致 flash algorithm 在目标上 HardFault（IPSR=3）。
            # 这与 pyocd erase CLI (subcommands/erase_cmd.py) 和
            # program() 方法的 pre_reset 行为一致。
            session.target.reset_and_halt()

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
            elif erase_type == "sector_range":
                # 范围擦除：遍历 address ~ address+size 内的所有扇区
                # 关键：需要找到每个地址所在的 region，用 region.sector_size 对齐
                from pyocd.core.memory_map import MemoryType

                flash_regions = [r for r in session.target.memory_map if r.type == MemoryType.FLASH]
                end_addr = address + size
                event_manager.log("info", f"Erasing sectors 0x{address:08X}~0x{end_addr:08X}...")

                # 按 region 分组擦除，避免每扇区 init/uninit
                # 先找出需要擦除的地址范围，按 region 分组
                region_sectors: dict[int, list[int]] = {}
                cur = address
                while cur < end_addr:
                    region = None
                    for r in flash_regions:
                        if r.start <= cur < r.start + r.length:
                            region = r
                            break
                    if not region:
                        event_manager.log("warning", f"No flash region at 0x{cur:08X}, skipping")
                        cur += 0x1000
                        continue

                    sector_size = region.sector_size
                    sector_aligned = region.start + ((cur - region.start) // sector_size) * sector_size
                    # 只擦除范围内的扇区（sector_aligned 可能越界）
                    if sector_aligned >= end_addr:
                        break
                    region_key = id(region)
                    if region_key not in region_sectors:
                        region_sectors[region_key] = []
                    region_sectors[region_key].append(sector_aligned)
                    cur = sector_aligned + sector_size

                total_sectors = sum(len(v) for v in region_sectors.values())
                erased = 0

                for region_key, sector_addrs in region_sectors.items():
                    # 找到对应的 region 对象
                    region = None
                    for r in flash_regions:
                        if id(r) == region_key:
                            region = r
                            break
                    if not region:
                        continue

                    flash = region.flash
                    flash.init(Flash.Operation.ERASE)
                    try:
                        for addr in sector_addrs:
                            flash.erase_sector(addr)
                            erased += 1
                            event_manager.emit("flash.progress", {
                                "phase": "erase", "current": erased, "total": total_sectors,
                                "percent": round(erased / total_sectors * 100, 2) if total_sectors > 0 else 100,
                            })
                    finally:
                        flash.uninit()

                event_manager.emit("flash.progress", {
                    "phase": "erase", "current": total_sectors, "total": total_sectors, "percent": 100,
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
        base_address: int | None = None,
        data: str = "",
    ) -> FlashResult:
        """烧录固件

        Args:
            file_path: 固件文件路径（与 data 二选一）
            data: base64 编码的固件数据（与 file_path 二选一）
            verify: 烧录后是否校验
            reset: 烧录后是否复位
            base_address: BIN 文件的烧录基地址
        """
        session = self._get_session(probe_uid)
        if not session:
            return FlashResult(success=False, error="Not connected")

        # 如果提供了 base64 数据，写入临时文件
        temp_path = None
        if data:
            import base64 as b64mod
            import tempfile
            try:
                raw = b64mod.b64decode(data)
                # 创建临时 .bin 文件
                fd, temp_path = tempfile.mkstemp(suffix='.bin', prefix='flash_data_')
                with os.fdopen(fd, 'wb') as f:
                    f.write(raw)
                file_path = temp_path
            except Exception as e:
                return FlashResult(success=False, error=f"Failed to decode data: {e}")
        elif not file_path or not os.path.exists(file_path):
            return FlashResult(success=False, error=f"File not found: {file_path}")

        start_time = time.time()
        file_size = os.path.getsize(file_path)

        try:
            from pyocd.flash.file_programmer import FileProgrammer

            event_manager.log("info", f"Programming {file_size} bytes from {os.path.basename(file_path)}...")

            # 烧录前先复位并暂停目标（与 pyocd flash CLI 的 pre_reset 行为一致）
            # 原因：目标可能正在运行用户代码，Flash 控制器状态未知，直接编程会失败
            session.target.reset_and_halt()

            # 确定文件格式和基地址
            ext = os.path.splitext(file_path)[1].lower()
            kwargs = {}
            if ext == ".bin":
                # BIN 文件需要指定基地址：优先使用用户传入的，回退到 boot_memory
                if base_address is not None:
                    kwargs["base_address"] = base_address
                else:
                    region = session.target.memory_map.get_boot_memory()
                    if region:
                        kwargs["base_address"] = region.start
                event_manager.log("info", f"BIN file, base address: 0x{kwargs.get('base_address', 0):08X}")

            # 计算实际数据大小（HEX/ELF 文件大小 ≠ 数据大小）
            data_segments = self._extract_file_data(session, file_path, ext)
            actual_data_size = sum(len(d) for _, d in data_segments) if data_segments else file_size

            # 第一阶段：擦除（chip erase 可能耗时较长，在前端展示 Erasing... 状态）
            event_manager.emit("flash.progress", {
                "phase": "erase", "current": 0, "total": actual_data_size, "percent": 0,
            })

            def progress_callback(percent: float):
                # FlashLoader 报告的是 0.0-1.0 的浮点数，前端需要 0-100 的百分比
                progress_pct = round(percent * 100, 2)
                event_manager.emit("flash.progress", {
                    "phase": "program",
                    "current": int(file_size * percent),
                    "total": file_size,
                    "percent": progress_pct,
                })

            # 使用 chip_erase="sector" 仅擦除需要编程的扇区
            # 原因：chip_erase="auto" 在已擦除的 Flash 上会跳过擦除，导致编程静默失败
            # chip_erase="chip" 全片擦除太慢（1MB Flash 约 10-15s），改为按需擦除
            programmer = FileProgrammer(session, progress=progress_callback, chip_erase="sector")

            # 注意：FileProgrammer.program() 不支持 verify 参数（pyOCD 0.44 的 FlashLoader.commit 中 verify 为 TODO）
            # 烧录后如需校验，调用独立的 verify() 方法
            programmer.program(file_path, **kwargs)

            # 第二阶段完成：发送 program 100% 确保进度条走到终点
            event_manager.emit("flash.progress", {
                "phase": "program", "current": actual_data_size, "total": actual_data_size, "percent": 100,
            })

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
        finally:
            # 清理临时文件
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass

    def verify(self, probe_uid: str, file_path: str, data: str = "", base_address: int | None = None) -> FlashResult:
        """校验 Flash 内容：读取 Flash 并与文件/数据逐字节对比

        Args:
            file_path: 固件文件路径（与 data 二选一）
            data: base64 编码的固件数据（与 file_path 二选一）
            base_address: 数据的基地址（使用 data 时必须提供）
        """
        session = self._get_session(probe_uid)
        if not session:
            return FlashResult(success=False, error="Not connected")

        # 如果提供了 base64 数据，构造数据段
        temp_path = None
        segments = []
        if data:
            import base64 as b64mod
            try:
                raw = b64mod.b64decode(data)
                addr = base_address if base_address is not None else (session.target.memory_map.get_boot_memory().start if session.target.memory_map.get_boot_memory() else 0)
                segments = [(addr, raw)]
                event_manager.log("info", f"Verifying {len(raw)} bytes from memory data at 0x{addr:08X}...")
            except Exception as e:
                return FlashResult(success=False, error=f"Failed to decode data: {e}")
        elif not file_path or not os.path.exists(file_path):
            return FlashResult(success=False, error=f"File not found: {file_path}")

        start_time = time.time()
        try:
            # 停止目标，确保 Flash 读取稳定
            session.target.halt()

            if not segments:
                ext = os.path.splitext(file_path)[1].lower()
                event_manager.log("info", f"Verifying {ext} file...")

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

    def check_blank(
        self,
        probe_uid: str,
        address: int | None = None,
        size: int | None = None,
    ) -> dict:
        """检查 Flash 是否为空白（全 0xFF）

        Args:
            address: 起始地址，None 则从 flash 起始
            size: 检查大小，None 则检查整个 flash
        Returns:
            dict: success, is_blank, blank_bytes, total_bytes, first_nonblank_addr, duration_ms
        """
        session = self._get_session(probe_uid)
        if not session:
            return {"success": False, "error": "Not connected"}

        start_time = time.time()
        try:
            from pyocd.core.memory_map import MemoryType

            flash_regions = [r for r in session.target.memory_map if r.type == MemoryType.FLASH]
            if not flash_regions:
                return {"success": False, "error": "No flash memory found"}

            # 确定检查范围
            if address is not None and size is not None:
                regions_to_check = []
                for r in flash_regions:
                    if r.start + r.length > address and r.start < address + size:
                        regions_to_check.append(r)
            else:
                regions_to_check = flash_regions

            # reset_and_halt 确保目标处于已知状态，避免用户代码干扰 Flash 读取
            session.target.reset_and_halt()

            total_bytes = 0
            blank_bytes = 0
            first_nonblank_addr = None
            chunk_words = 16384  # 16384 words = 64KB per chunk

            # 计算总大小用于进度
            check_total = 0
            for region in regions_to_check:
                if address is not None and size is not None:
                    start = max(region.start, address)
                    end = min(region.start + region.length, address + size)
                    check_total += max(0, end - start)
                else:
                    check_total += region.length

            event_manager.log("info", f"Check blank: {check_total} bytes, {len(regions_to_check)} region(s)")
            event_manager.emit("flash.progress", {
                "phase": "blank", "current": 0, "total": check_total, "percent": 0,
            })

            # 全 0xFFFFFFFF 的 word，用于快速比较
            FF_WORD = 0xFFFFFFFF

            for region in regions_to_check:
                start = max(region.start, address) if address else region.start
                end = min(region.start + region.length, address + size) if (address and size) else region.start + region.length
                region_total = end - start

                offset = 0
                while offset < region_total:
                    if self._check_cancel():
                        event_manager.emit("flash.progress", {
                            "phase": "blank", "current": total_bytes, "total": check_total, "percent": 100,
                        })
                        event_manager.log("warning", f"Check blank cancelled at {total_bytes} bytes")
                        return {"success": False, "error": "Cancelled", "duration_ms": int((time.time() - start_time) * 1000)}

                    # 用 block32 批量读取（Flash 总是 4 字节对齐）
                    read_bytes = min(chunk_words * 4, region_total - offset)
                    word_count = read_bytes // 4
                    if word_count == 0:
                        word_count = 1
                        read_bytes = 4
                    words = session.target.read_memory_block32(start + offset, word_count)

                    # 高效检查：逐 word 比较 0xFFFFFFFF
                    if first_nonblank_addr is None:
                        for i, w in enumerate(words):
                            if w != FF_WORD:
                                # 在这个 word 的 4 字节中找第一个非 0xFF
                                word_bytes = w.to_bytes(4, 'little')
                                for j in range(4):
                                    if word_bytes[j] != 0xFF:
                                        first_nonblank_addr = start + offset + i * 4 + j
                                        break
                                break

                    # 统计 blank bytes
                    for w in words:
                        if w == FF_WORD:
                            blank_bytes += 4
                        else:
                            blank_bytes += w.to_bytes(4, 'little').count(0xFF)

                    total_bytes += word_count * 4
                    offset += word_count * 4

                    event_manager.emit("flash.progress", {
                        "phase": "blank",
                        "current": total_bytes,
                        "total": check_total,
                        "percent": round(total_bytes / check_total * 100, 2) if check_total > 0 else 100,
                    })

            is_blank = (first_nonblank_addr is None)
            duration = int((time.time() - start_time) * 1000)
            event_manager.emit("flash.progress", {
                "phase": "blank", "current": total_bytes, "total": total_bytes, "percent": 100,
            })

            if is_blank:
                event_manager.log("info", f"Check blank: PASSED ({total_bytes} bytes all 0xFF, {duration}ms)")
            else:
                event_manager.log("info", f"Check blank: FAILED (first non-blank at 0x{first_nonblank_addr:08X}, {duration}ms)")

            return {
                "success": True,
                "is_blank": is_blank,
                "blank_bytes": blank_bytes,
                "total_bytes": total_bytes,
                "first_nonblank_addr": first_nonblank_addr,
                "duration_ms": duration,
            }
        except Exception as e:
            logger.exception("Check blank failed")
            event_manager.log("error", f"Check blank failed: {e}")
            return {"success": False, "error": str(e), "duration_ms": int((time.time() - start_time) * 1000)}

    def read_back(
        self,
        probe_uid: str,
        read_type: str = "chip",
        address: int = 0,
        size: int = 0,
        output_path: str = "",
    ) -> dict:
        """读取 Flash 内容，返回 base64 编码数据

        使用 read_memory_block32 批量读取（4字节对齐），比 block8 快 2-3 倍。
        Flash 起始地址和大小总是 4 字节对齐，可安全使用 block32。

        Args:
            read_type: "chip" 遍历所有 flash region，"range"/"sectors" 读取指定范围
            address: 起始地址（range/sectors 模式）
            size: 读取大小（range/sectors 模式）
            output_path: 可选，如果提供则同时保存到文件
        Returns:
            dict: success, base64_data, base_address, bytes_read, duration_ms
        """
        session = self._get_session(probe_uid)
        if not session:
            return {"success": False, "error": "Not connected"}

        start_time = time.time()
        try:
            import base64
            import struct
            from pyocd.core.memory_map import MemoryType

            flash_regions = [r for r in session.target.memory_map if r.type == MemoryType.FLASH]
            if not flash_regions:
                return {"success": False, "error": "No flash memory found"}

            # reset_and_halt 确保目标处于已知状态，避免用户代码干扰 Flash 读取
            session.target.reset_and_halt()

            # chunk_words: 每次 read_memory_block32 调用的 word 数
            # v2 (WinUSB 512B packet, 64 packets): 单次事务最多 ~8000 words，用 8192 接近上限
            # v1 (HID 64B packet, 4 packets): 单次事务最多 ~60 words，但 pyOCD 内部会自动分包
            chunk_words = 8192  # 8192 words = 32KB per chunk
            total_read = 0
            all_data = bytearray()

            def read_block32(addr: int, byte_len: int) -> bytes:
                """用 block32 读取，返回 bytes。byte_len 自动向下对齐到 4 字节。"""
                word_count = byte_len // 4
                if word_count == 0:
                    return b''
                words = session.target.read_memory_block32(addr, word_count)
                # 用 array 批量转换，比 struct.pack 快 3-5 倍（避免 Python 函数调用开销）
                import array
                arr = array.array('I', words)
                return arr.tobytes()

            if read_type == "chip":
                # 遍历所有 flash region
                base_addr = flash_regions[0].start
                total_size = sum(r.length for r in flash_regions)

                event_manager.log("info", f"Read back entire chip: {total_size} bytes, {len(flash_regions)} region(s)")
                event_manager.emit("flash.progress", {
                    "phase": "read", "current": 0, "total": total_size, "percent": 0,
                })

                for region in flash_regions:
                    offset = 0
                    while offset < region.length:
                        if self._check_cancel():
                            event_manager.emit("flash.progress", {
                                "phase": "read", "current": total_read, "total": total_size, "percent": 100,
                            })
                            event_manager.log("warning", f"Read back cancelled at {total_read} bytes")
                            return {"success": False, "error": "Cancelled", "duration_ms": int((time.time() - start_time) * 1000)}

                        read_bytes = min(chunk_words * 4, region.length - offset)
                        data = read_block32(region.start + offset, read_bytes)
                        all_data.extend(data)
                        total_read += len(data)
                        offset += read_bytes
                        event_manager.emit("flash.progress", {
                            "phase": "read",
                            "current": total_read,
                            "total": total_size,
                            "percent": round(total_read / total_size * 100, 2),
                        })
            else:
                # range / sectors 模式：从 address 读取 size 字节
                base_addr = address
                total_size = size

                event_manager.log("info", f"Read back range: 0x{address:08X} ~ 0x{address + size:08X} ({size} bytes)")
                event_manager.emit("flash.progress", {
                    "phase": "read", "current": 0, "total": total_size, "percent": 0,
                })

                offset = 0
                while offset < size:
                    if self._check_cancel():
                        event_manager.emit("flash.progress", {
                            "phase": "read", "current": total_read, "total": total_size, "percent": 100,
                        })
                        event_manager.log("warning", f"Read back cancelled at {total_read} bytes")
                        return {"success": False, "error": "Cancelled", "duration_ms": int((time.time() - start_time) * 1000)}

                    read_bytes = min(chunk_words * 4, size - offset)
                    data = read_block32(address + offset, read_bytes)
                    all_data.extend(data)
                    total_read += len(data)
                    offset += read_bytes
                    event_manager.emit("flash.progress", {
                        "phase": "read",
                        "current": total_read,
                        "total": total_size,
                        "percent": round(total_read / total_size * 100, 2),
                    })

            event_manager.emit("flash.progress", {
                "phase": "read", "current": total_read, "total": total_read, "percent": 100,
            })

            # 可选：同时保存到文件
            if output_path:
                with open(output_path, "wb") as f:
                    f.write(bytes(all_data))

            duration = int((time.time() - start_time) * 1000)
            speed_kbps = (total_read / 1024) / (duration / 1000) if duration > 0 else 0
            event_manager.log("info", f"Read back {total_read} bytes from 0x{base_addr:08X} ({duration}ms, {speed_kbps:.1f} KB/s)")
            return {
                "success": True,
                "base64_data": base64.b64encode(bytes(all_data)).decode("ascii"),
                "base_address": base_addr,
                "bytes_read": total_read,
                "duration_ms": duration,
            }
        except Exception as e:
            logger.exception("Read back failed")
            event_manager.log("error", f"Read back failed: {e}")
            return {"success": False, "error": str(e), "duration_ms": int((time.time() - start_time) * 1000)}

    def reset(self, probe_uid: str, reset_type: str = "hw", run: bool = True) -> bool:
        """复位目标"""
        session = self._get_session(probe_uid)
        if not session:
            return False

        try:
            event_manager.log("info", f"Reset ({reset_type}, {'run' if run else 'halt'})")
            if reset_type == "hw":
                session.probe.reset()
            else:
                session.target.reset()

            if run:
                session.target.resume()

            event_manager.log("info", f"Reset done")
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
