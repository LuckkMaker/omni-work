#!/usr/bin/env python3
"""ARM linker MAP file parser for memory usage analysis."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass
class MemorySize:
    code: int = 0
    ro_data: int = 0
    rw_data: int = 0
    zi_data: int = 0

    @property
    def rom(self) -> int:
        return self.code + self.ro_data + self.rw_data

    @property
    def ram(self) -> int:
        return self.rw_data + self.zi_data

    @property
    def total(self) -> int:
        return self.rom + self.zi_data

    def add(self, other: MemorySize) -> MemorySize:
        return MemorySize(
            code=self.code + other.code,
            ro_data=self.ro_data + other.ro_data,
            rw_data=self.rw_data + other.rw_data,
            zi_data=self.zi_data + other.zi_data,
        )


@dataclass
class ComponentEntry:
    name: str
    size: MemorySize
    category: str
    library: str = ""
    stack: int = 0


@dataclass
class ExecutionRegion:
    name: str
    exec_base: int
    size: int
    max_size: int


@dataclass
class MapAnalysis:
    source_file: str
    component: str = ""
    tool: str = ""
    grand_totals: MemorySize = field(default_factory=MemorySize)
    total_ro: int = 0
    total_rw: int = 0
    total_rom: int = 0
    objects: list[ComponentEntry] = field(default_factory=list)
    libraries: list[ComponentEntry] = field(default_factory=list)
    regions: list[ExecutionRegion] = field(default_factory=list)
    flash_capacity: int = 0
    ram_capacity: int = 0
    generated_at: str = ""

    def to_dict(self) -> dict:
        def entry_dict(e: ComponentEntry, kind: str) -> dict:
            return {
                "name": e.name,
                "category": e.category,
                "kind": kind,
                "library": e.library,
                "code": e.size.code,
                "ro_data": e.size.ro_data,
                "rw_data": e.size.rw_data,
                "zi_data": e.size.zi_data,
                "rom": e.size.rom,
                "ram": e.size.ram,
                "stack": e.stack,
            }

        categories: dict[str, MemorySize] = {}
        for entry in self.all_entries:
            if entry.category not in categories:
                categories[entry.category] = MemorySize()
            categories[entry.category] = categories[entry.category].add(entry.size)

        category_list = [
            {
                "name": name,
                "code": s.code,
                "ro_data": s.ro_data,
                "rw_data": s.rw_data,
                "zi_data": s.zi_data,
                "rom": s.rom,
                "ram": s.ram,
            }
            for name, s in sorted(categories.items(), key=lambda x: x[1].rom, reverse=True)
        ]

        entries = sorted(
            [entry_dict(e, "object") for e in self.objects]
            + [entry_dict(e, "library") for e in self.libraries],
            key=lambda e: e["rom"],
            reverse=True,
        )

        return {
            "meta": {
                "source_file": Path(self.source_file).name,
                "component": self.component,
                "tool": self.tool,
                "generated_at": self.generated_at,
            },
            "summary": {
                "code": self.grand_totals.code,
                "ro_data": self.grand_totals.ro_data,
                "rw_data": self.grand_totals.rw_data,
                "zi_data": self.grand_totals.zi_data,
                "total_rom": self.total_rom,
                "total_ram": self.total_rw,
                "total_ro": self.total_ro,
                "flash_used": self.total_rom,
                "flash_capacity": self.flash_capacity,
                "ram_used": self.total_rw,
                "ram_capacity": self.ram_capacity,
            },
            "categories": category_list,
            "entries": entries,
            "top_rom": entries[:20],
            "top_ram": sorted(entries, key=lambda x: x["ram"], reverse=True)[:20],
            "top_stack": sorted(
                [e for e in entries if e["stack"] > 0],
                key=lambda x: x["stack"],
                reverse=True,
            ),
            "regions": [
                {
                    "name": r.name,
                    "exec_base": r.exec_base,
                    "size": r.size,
                    "max_size": r.max_size,
                }
                for r in self.regions
            ],
        }

    @property
    def all_entries(self) -> list[ComponentEntry]:
        return self.objects + self.libraries


_OBJECT_LINE = re.compile(
    r"^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$"
)
_GRAND_TOTALS = re.compile(
    r"^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+Grand Totals"
)
_TOTAL_RO = re.compile(r"Total RO\s+Size.*?\s+(\d+)\s+")
_TOTAL_RW = re.compile(r"Total RW\s+Size.*?\s+(\d+)\s+")
_TOTAL_ROM = re.compile(r"Total ROM Size.*?\s+(\d+)\s+")
_EXEC_REGION = re.compile(
    r"Execution Region (\S+) \(Exec base: (0x[0-9a-fA-F]+), "
    r"Load base: (0x[0-9a-fA-F]+), Size: (0x[0-9a-fA-F]+), Max: (0x[0-9a-fA-F]+)"
)
_STACK_LINE = re.compile(
    r"0x[0-9a-fA-F]+\s+-\s+(0x[0-9a-fA-F]+)\s+Zero\s+RW\s+\d+\s+STACK\s+(\S+)"
)
_COMPONENT = re.compile(r"^Component:\s+(.+?)\s+Tool:\s+(.+?)\s*$")


def _parse_size_line(match: re.Match) -> MemorySize:
    return MemorySize(
        code=int(match.group(1)),
        ro_data=int(match.group(3)),
        rw_data=int(match.group(4)),
        zi_data=int(match.group(5)),
    )


def categorize(name: str, library: str = "") -> str:
    """Classify an object/library member into a module category."""
    base = name.lower()
    lib = library.lower()

    if lib or ".l(" in base:
        if any(x in base for x in ("printf", "putchar", "puts", "scanf", "stdio")):
            return "C Library"
        if any(
            x in base
            for x in (
                "entry",
                "handler",
                "init.o",
                "memcpy",
                "memset",
                "memcmp",
                "strlen",
                "strncmp",
                "uidiv",
                "uldiv",
                "llshl",
                "llsshr",
                "llushr",
                "dadd",
                "ddiv",
                "dmul",
                "depilogue",
                "dcmp",
                "dfix",
                "dflt",
                "cdrcmple",
                "iusefp",
                "__dczero",
            )
        ):
            return "C Library"
        if lib in ("mc_w.l", "mf_w.l", "mc_p.l", "mf_p.l"):
            return "C Library"

    if base.startswith("lto-llvm"):
        return "Application (LTO)"

    if base in ("main.o", "app.o") or base.endswith("_app.o"):
        return "Application"

    if any(x in base for x in ("rtx_", "os_systick", "os_tick")) or base == "rtx_lib.o":
        return "RTOS"

    if base.startswith("usbd_") or base == "hal_udc.o":
        return "USB"

    if any(x in base for x in ("dap", "swd_", "jtag_", "sw_dp")):
        return "DAP/Debug"

    if any(
        x in base
        for x in (
            "flash_",
            "vfs",
            "intelhex",
            "file_",
            "stream_",
            "target_",
            "setting_",
        )
    ):
        return "Flash/VFS"

    if base.startswith("stm32") or base.startswith("hal_") or base == "msp.o":
        return "HAL/STM32"

    if any(x in base for x in ("log", "segger_rtt", "rtt.o", "eventrecorder", "shell")):
        return "Logging/RTT"

    if any(
        x in base
        for x in ("startup_", "system_stm32", "irq_", "device.o", "timing", "coremark")
    ):
        return "CMSIS/Startup"

    if base.startswith("cmsis_") or "freertos" in base:
        return "RTOS"

    return "Other"


def parse_map_file(path: str | Path) -> MapAnalysis:
    """Parse an ARM armlink MAP file and return structured analysis data."""
    path = Path(path)
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    analysis = MapAnalysis(
        source_file=str(path),
        generated_at=datetime.now().strftime("%Y/%m/%d"),
    )

    comp_match = _COMPONENT.match(lines[0] if lines else "")
    if comp_match:
        analysis.component = comp_match.group(1).strip()
        analysis.tool = comp_match.group(2).strip()

    section = ""
    current_library = ""
    in_image_sizes = False
    stack_sizes: dict[str, int] = {}

    for line in lines:
        gt = _GRAND_TOTALS.search(line)
        if gt:
            analysis.grand_totals = _parse_size_line(gt)

        ro = _TOTAL_RO.search(line)
        if ro:
            analysis.total_ro = int(ro.group(1))

        rw = _TOTAL_RW.search(line)
        if rw:
            analysis.total_rw = int(rw.group(1))

        rom = _TOTAL_ROM.search(line)
        if rom:
            analysis.total_rom = int(rom.group(1))

        region = _EXEC_REGION.search(line)
        if region:
            analysis.regions.append(
                ExecutionRegion(
                    name=region.group(1),
                    exec_base=int(region.group(2), 16),
                    size=int(region.group(4), 16),
                    max_size=int(region.group(5), 16),
                )
            )

        stack = _STACK_LINE.search(line)
        if stack:
            stack_sizes[stack.group(2)] = int(stack.group(1), 16)

        if line.strip() == "Image component sizes":
            in_image_sizes = True
            section = ""
            continue

        if not in_image_sizes:
            continue

        if "Grand Totals" in line:
            in_image_sizes = False
            continue

        stripped = line.strip()

        if "Object Name" in line:
            section = "objects"
            continue
        if "Library Member Name" in line:
            section = "lib_members"
            continue
        if "Library Name" in line:
            section = "lib_names"
            continue
        if stripped.startswith("Object Totals") or stripped.startswith("Library Totals"):
            continue
        if stripped.startswith("(incl."):
            continue
        if stripped.startswith("-----"):
            continue

        obj_match = _OBJECT_LINE.match(line)
        if not obj_match:
            if section == "lib_names" and obj_match is None:
                parts = stripped.rsplit(None, 1)
                if len(parts) == 2 and parts[1].endswith(".l"):
                    current_library = parts[1]
            continue

        size = _parse_size_line(obj_match)
        name = obj_match.group(7).strip()

        if name in ("Object Totals", "Library Totals") or name.startswith("(incl."):
            continue

        if section == "objects":
            analysis.objects.append(
                ComponentEntry(
                    name=name,
                    size=size,
                    category=categorize(name),
                )
            )
        elif section == "lib_members":
            display = f"{current_library}({name})" if current_library else name
            analysis.libraries.append(
                ComponentEntry(
                    name=display,
                    size=size,
                    category=categorize(name, current_library),
                    library=current_library,
                )
            )

    for entry in analysis.objects:
        if entry.name in stack_sizes:
            entry.stack = stack_sizes[entry.name]

    _derive_capacities(analysis)
    _fill_missing_totals(analysis)

    return analysis


def _derive_capacities(analysis: MapAnalysis) -> None:
    flash = 0
    ram = 0
    for region in analysis.regions:
        name = region.name.upper()
        if "ROM" in name or "FLASH" in name or "IROM" in name:
            flash = max(flash, region.max_size)
        elif "RAM" in name or "IRAM" in name or "RW" in name:
            ram += region.max_size

    analysis.flash_capacity = flash
    analysis.ram_capacity = ram


def _fill_missing_totals(analysis: MapAnalysis) -> None:
    gt = analysis.grand_totals
    if analysis.total_ro == 0:
        analysis.total_ro = gt.code + gt.ro_data
    if analysis.total_rw == 0:
        analysis.total_rw = gt.rw_data + gt.zi_data
    if analysis.total_rom == 0:
        analysis.total_rom = gt.code + gt.ro_data + gt.rw_data
