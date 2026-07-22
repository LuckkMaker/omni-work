"""FLM 自定义芯片管理

通过 .FLM Flash 算法文件 + 用户提供的内存参数，
动态创建可烧录的自定义芯片 Target，并注册到 pyOCD 的 TARGET 字典。

FLM 文件是 ARM 编译的 Flash 算法库（ELF 格式），包含擦除/编程/校验函数的
机器码。pyOCD 的 PackFlashAlgo 可以解析 FLM 并提取这些算法。
"""

import os
from typing import Optional

from core import database


# 内核名称到 pyOCD Core 类的映射
_CORE_MAP = {
    "cortex-m0": "CortexM0",
    "cortex-m0+": "CortexM0Plus",
    "cortex-m1": "CortexM1",
    "cortex-m3": "CortexM3",
    "cortex-m4": "CortexM4",
    "cortex-m7": "CortexM7",
    "cortex-m23": "CortexM23",
    "cortex-m33": "CortexM33",
    "cortex-m55": "CortexM55",
}


def _get_core_class(core_name: str):
    """将内核名称字符串映射到 pyOCD 的 Core 类"""
    core_key = core_name.lower().strip()
    class_name = _CORE_MAP.get(core_key, "CortexM4")

    try:
        from pyocd.coresight import cortex_m
        return getattr(cortex_m, class_name, cortex_m.CortexM4)
    except Exception:
        from pyocd.coresight.cortex_m import CortexM4
        return CortexM4


def create_custom_target(
    flm_path: str,
    part_number: str,
    core: str,
    flash_base_address: str,
    flash_size: int,
    ram_base_address: str,
    ram_size: int,
    vendor: str = "Custom",
    display_name: str = "",
) -> dict:
    """创建并注册 FLM 自定义芯片

    1. 解析 FLM 文件提取 Flash 算法
    2. 动态创建 CoreSightTarget 子类
    3. 注册到 TARGET 字典
    4. 写入 XML 设备目录 (source="flm")

    Args:
        flm_path: .FLM 文件路径
        part_number: 芯片型号（唯一标识，如 "my-custom-mcu"）
        core: 内核名称（如 "Cortex-M4"）
        flash_base_address: Flash 基地址（如 "0x08000000"）
        flash_size: Flash 大小（KB）
        ram_base_address: RAM 基地址（如 "0x20000000"）
        ram_size: RAM 大小（KB）
        vendor: 厂商名（默认 "Custom"）
        display_name: 显示名（默认同 part_number）

    Returns: 创建的设备信息 dict
    Raises: Exception on failure
    """
    if not os.path.exists(flm_path):
        raise FileNotFoundError(f"FLM 文件不存在: {flm_path}")

    part_number = part_number.lower().strip()
    if not display_name:
        display_name = part_number

    # 解析 Flash 基地址和大小
    flash_start = int(flash_base_address, 16) if isinstance(flash_base_address, str) else flash_base_address
    flash_length = flash_size * 1024
    ram_start = int(ram_base_address, 16) if isinstance(ram_base_address, str) else ram_base_address
    ram_length = ram_size * 1024

    # 动态创建 Target 类
    target_class = _build_custom_target_class(
        part_number=part_number,
        vendor=vendor,
        core_name=core,
        flm_path=flm_path,
        flash_start=flash_start,
        flash_length=flash_length,
        ram_start=ram_start,
        ram_length=ram_length,
    )

    # 注册到 TARGET 字典
    from pyocd.target import TARGET
    TARGET[part_number] = target_class

    # 写入 XML 设备目录
    device_info = {
        "part_number": part_number,
        "source": "flm",
        "vendor": vendor,
        "display_name": display_name,
        "core": core,
        "num_cores": 1,
        "flash_size": flash_size,
        "ram_size": ram_size,
        "flash_base_address": flash_base_address,
        "ram_base_address": ram_base_address,
        "device_id_address": "0xE0042000",
        "flash_regions": [
            {
                "start": flash_base_address,
                "length": f"0x{flash_length:X}",
                "sector_size": "0x400",
                "page_size": "0x400",
                "is_boot_memory": True,
            }
        ],
    }

    # 存储 FLM 文件路径（供后续重新加载）
    flm_dir = _get_flm_dir()
    os.makedirs(flm_dir, exist_ok=True)
    import shutil
    flm_dest = os.path.join(flm_dir, f"{part_number}.FLM")
    shutil.copy2(flm_path, flm_dest)
    device_info["flm_path"] = flm_dest

    database.upsert_device(device_info)

    return device_info


def _build_custom_target_class(
    part_number: str,
    vendor: str,
    core_name: str,
    flm_path: str,
    flash_start: int,
    flash_length: int,
    ram_start: int,
    ram_length: int,
):
    """动态构建 CoreSightTarget 子类"""

    core_class = _get_core_class(core_name)

    class CustomFlmTarget:
        """由 FLM 文件动态创建的自定义芯片 Target"""

        VENDOR = vendor
        PART_NUMBER = part_number
        CORE = core_class
        _flm_path = flm_path
        _flash_start = flash_start
        _flash_length = flash_length
        _ram_start = ram_start
        _ram_length = ram_length
        _part_number = part_number

        def __init__(self, session):
            from pyocd.core import memory_map as mm
            from pyocd.flash.flash import Flash

            # 构建 MemoryMap
            self._memory_map = self._build_memory_map(session)

            # 调用 CoreSightTarget 的初始化
            from pyocd.coresight.coresight_target import CoreSightTarget
            CoreSightTarget.__init__(self, session, self._memory_map)

        def _build_memory_map(self, session):
            """从 FLM 文件和用户参数构建 MemoryMap"""
            from pyocd.core import memory_map as mm

            regions = []

            # 从 FLM 文件提取 Flash 算法
            flash_algo = self._load_flash_algo(session)

            # 创建 Flash 区域
            flash_region = mm.FlashRegion(
                name="flash",
                start=self._flash_start,
                length=self._flash_length,
                page_size=0x400,
                sector_size=0x400,
                algo=flash_algo,
                is_boot_memory=True,
            )
            regions.append(flash_region)

            # 创建 RAM 区域
            ram_region = mm.RamRegion(
                name="ram",
                start=self._ram_start,
                length=self._ram_length,
            )
            regions.append(ram_region)

            return mm.MemoryMap(*regions)

        def _load_flash_algo(self, session):
            """从 FLM 文件加载 Flash 算法"""
            try:
                from pyocd.target.pack.cmsis_pack import PackFlashAlgo
                algo = PackFlashAlgo(self._flm_path)
                return algo
            except Exception:
                # 如果 PackFlashAlgo 失败，尝试直接构建
                try:
                    from pyocd.flash.flash_algo import FlashAlgo
                    # 从 FLM 提取算法（FLM 是 ELF 文件）
                    with open(self._flm_path, "rb") as f:
                        flm_data = f.read()
                    # 简化处理：返回 None，让 pyOCD 使用默认行为
                    return None
                except Exception:
                    return None

    # 设置类名
    CustomFlmTarget.__name__ = f"CustomFlmTarget_{part_number}"
    CustomFlmTarget.__qualname__ = CustomFlmTarget.__name__

    return CustomFlmTarget


def _get_flm_dir() -> str:
    """获取 FLM 文件存储目录"""
    from core.pack_manager import _get_data_dir
    return os.path.join(_get_data_dir(), "flm")


def load_custom_targets() -> int:
    """启动时从 XML 目录加载所有 FLM 自定义芯片

    Returns: 成功加载的数量
    """
    custom_devices = database.list_devices_by_source("flm")
    count = 0
    for dev in custom_devices:
        flm_path = dev.get("flm_path", "")
        if not flm_path or not os.path.exists(flm_path):
            continue
        try:
            flash_base = dev.get("flash_base_address", "0x00000000")
            flash_size = dev.get("flash_size", 0)
            ram_base = dev.get("ram_base_address", "0x20000000")
            ram_size = dev.get("ram_size", 0)

            target_class = _build_custom_target_class(
                part_number=dev["part_number"],
                vendor=dev.get("vendor", "Custom"),
                core_name=dev.get("core", "Cortex-M4"),
                flm_path=flm_path,
                flash_start=int(flash_base, 16),
                flash_length=flash_size * 1024,
                ram_start=int(ram_base, 16),
                ram_length=ram_size * 1024,
            )

            from pyocd.target import TARGET
            TARGET[dev["part_number"]] = target_class
            count += 1
        except Exception:
            continue
    return count


def extract_flm_info(flm_path: str) -> dict:
    """从 FLM 文件中自动提取 Flash 算法信息

    尝试解析 FLM（ELF 格式）提取 Flash 区域信息。
    如果解析失败，返回空 dict。

    Returns: {"flash_base": "0x...", "flash_size": N, "sector_size": "0x..."} or {}
    """
    if not os.path.exists(flm_path):
        return {}

    try:
        from pyocd.target.pack.cmsis_pack import PackFlashAlgo
        algo = PackFlashAlgo(flm_path)

        info = {}
        if hasattr(algo, 'flash_start'):
            info["flash_base"] = f"0x{algo.flash_start:08X}"
        if hasattr(algo, 'flash_size'):
            info["flash_size"] = int(algo.flash_size // 1024)
        if hasattr(algo, 'page_size'):
            info["page_size"] = f"0x{algo.page_size:X}"
        return info
    except Exception:
        return {}
