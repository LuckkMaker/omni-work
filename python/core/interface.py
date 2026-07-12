"""后端抽象接口

解耦业务逻辑与具体硬件库实现（当前为 pyOCD）。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ProbeInfo:
    uid: str
    vendor: str
    product: str
    vid: int
    pid: int
    serial: str


@dataclass
class TargetInfo:
    part_number: str
    core: str
    flash_start: int
    flash_size: int
    page_size: int
    sector_size: int


@dataclass
class FlashResult:
    success: bool
    bytes_written: int = 0
    duration_ms: int = 0
    error: Optional[str] = None


class BackendInterface(ABC):
    """硬件后端抽象接口"""

    @abstractmethod
    def list_probes(self) -> list[ProbeInfo]:
        """扫描所有已连接探针"""

    @abstractmethod
    def connect(self, probe_uid: str) -> bool:
        """连接指定探针"""

    @abstractmethod
    def disconnect(self, probe_uid: str) -> bool:
        """断开探针"""

    @abstractmethod
    def get_target_info(self, probe_uid: str) -> Optional[TargetInfo]:
        """获取当前连接目标的芯片信息"""

    @abstractmethod
    def set_target(self, probe_uid: str, part_number: str) -> bool:
        """手动设置目标芯片型号"""

    @abstractmethod
    def erase(
        self,
        probe_uid: str,
        erase_type: str = "chip",
        address: int = 0,
        size: int = 0,
    ) -> FlashResult:
        """擦除 Flash"""

    @abstractmethod
    def program(
        self,
        probe_uid: str,
        file_path: str,
        verify: bool = True,
        reset: bool = True,
    ) -> FlashResult:
        """烧录固件"""

    @abstractmethod
    def verify(self, probe_uid: str, file_path: str) -> FlashResult:
        """校验 Flash 内容"""

    @abstractmethod
    def reset(self, probe_uid: str, reset_type: str = "hw", run: bool = True) -> bool:
        """复位目标"""

    @abstractmethod
    def read_memory(self, probe_uid: str, address: int, size: int) -> bytes:
        """读取内存"""
