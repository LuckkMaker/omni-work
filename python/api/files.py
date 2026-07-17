"""文件解析 API 路由"""

import os
import base64
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ParseRequest(BaseModel):
    file_path: str
    base_address: int | None = None


@router.post("/parse")
async def parse_file(req: ParseRequest):
    """解析固件文件，返回格式/大小/段信息"""
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="File not found")

    ext = os.path.splitext(req.file_path)[1].lower()
    file_size = os.path.getsize(req.file_path)

    if ext == ".bin":
        return {
            "format": "bin",
            "size": file_size,
            "entry": None,
            "segments": [{"address": 0, "size": file_size}],
        }
    elif ext == ".hex":
        # 解析 Intel HEX 文件
        return parse_hex(req.file_path)
    elif ext in (".elf", ".axf"):
        # 解析 ELF/AXF 文件
        return parse_elf(req.file_path)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")


@router.post("/read")
async def read_file(req: ParseRequest):
    """读取固件文件数据，返回 base64 编码的二进制数据和地址段（供 HexViewer 显示）"""
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="File not found")

    ext = os.path.splitext(req.file_path)[1].lower()

    if ext == ".bin":
        with open(req.file_path, "rb") as f:
            data = f.read()
        return {
            "format": "bin",
            "base_address": req.base_address or 0,
            "data": base64.b64encode(data).decode("ascii"),
            "size": len(data),
        }
    elif ext == ".hex":
        return read_hex(req.file_path)
    elif ext in (".elf", ".axf"):
        return read_elf(req.file_path)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")


def read_hex(file_path: str):
    """读取 Intel HEX 文件，合并为连续二进制数据"""
    base_addr = 0
    min_addr = None
    max_addr = None
    data_map = {}

    with open(file_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or not line.startswith(":"):
                continue

            data_str = line[1:]
            byte_count = int(data_str[0:2], 16)
            address = int(data_str[2:6], 16)
            record_type = int(data_str[6:8], 16)

            if record_type == 0:  # Data record
                full_addr = base_addr + address
                data_bytes = bytes.fromhex(data_str[8:8 + byte_count * 2])
                for i, b in enumerate(data_bytes):
                    data_map[full_addr + i] = b
                if min_addr is None or full_addr < min_addr:
                    min_addr = full_addr
                if max_addr is None or full_addr + byte_count > max_addr:
                    max_addr = full_addr + byte_count
            elif record_type == 4:  # Extended linear address
                base_addr = int(data_str[8:12], 16) << 16
            elif record_type == 1:  # End of file
                break

    if min_addr is None:
        return {"format": "hex", "base_address": 0, "data": "", "size": 0}

    # 填充连续数据（空隙用 0xFF 填充）
    total = max_addr - min_addr
    raw = bytearray([0xFF] * total)
    for addr, b in data_map.items():
        raw[addr - min_addr] = b

    return {
        "format": "hex",
        "base_address": min_addr,
        "data": base64.b64encode(bytes(raw)).decode("ascii"),
        "size": total,
    }


def read_elf(file_path: str):
    """读取 ELF/AXF 文件，提取可加载段数据"""
    try:
        from elftools.elf.elffile import ELFFile

        with open(file_path, "rb") as f:
            elf = ELFFile(f)
            # 合并所有 PT_LOAD 段
            min_addr = None
            max_addr = None
            segments = []

            for segment in elf.iter_segments():
                if segment.header.p_type != "PT_LOAD":
                    continue
                vaddr = segment.header.p_vaddr
                memsz = segment.header.p_memsz
                data = segment.data()
                segments.append((vaddr, data))
                if min_addr is None or vaddr < min_addr:
                    min_addr = vaddr
                if max_addr is None or vaddr + memsz > max_addr:
                    max_addr = vaddr + memsz

            if min_addr is None:
                return {"format": "elf", "base_address": 0, "data": "", "size": 0}

            total = max_addr - min_addr
            raw = bytearray([0xFF] * total)
            for vaddr, data in segments:
                for i, b in enumerate(data):
                    if vaddr + i - min_addr < total:
                        raw[vaddr + i - min_addr] = b

            return {
                "format": "elf",
                "base_address": min_addr,
                "data": base64.b64encode(bytes(raw)).decode("ascii"),
                "size": total,
            }
    except ImportError:
        raise HTTPException(status_code=500, detail="pyelftools not installed")


def parse_hex(file_path: str):
    """解析 Intel HEX 文件"""
    import re

    segments = []
    current_addr = 0
    base_addr = 0
    total_size = 0
    seg_start = None
    seg_end = None

    with open(file_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or not line.startswith(":"):
                continue

            # 解析 HEX 记录
            data_str = line[1:]
            byte_count = int(data_str[0:2], 16)
            address = int(data_str[2:6], 16)
            record_type = int(data_str[6:8], 16)

            if record_type == 0:  # Data record
                full_addr = base_addr + address
                if seg_start is None:
                    seg_start = full_addr
                seg_end = full_addr + byte_count
                total_size += byte_count
            elif record_type == 4:  # Extended linear address
                base_addr = int(data_str[8:12], 16) << 16
            elif record_type == 1:  # End of file
                break

    if seg_start is not None:
        segments.append({"address": seg_start, "size": seg_end - seg_start})

    return {
        "format": "hex",
        "size": total_size,
        "entry": seg_start,
        "segments": segments,
    }


def parse_elf(file_path: str):
    """解析 ELF 文件"""
    try:
        from elftools.elf.elffile import ELFFile

        with open(file_path, "rb") as f:
            elf = ELFFile(f)
            segments = []
            for section in elf.iter_sections():
                if section.header.sh_type == "SHT_PROGBITS" and section.header.sh_size > 0:
                    if section.header.sh_flags & 0x2:  # SHF_ALLOC
                        segments.append({
                            "address": section.header.sh_addr,
                            "size": section.header.sh_size,
                        })

            return {
                "format": "elf",
                "size": os.path.getsize(file_path),
                "entry": elf.header.e_entry,
                "segments": segments,
            }
    except ImportError:
        return {
            "format": "elf",
            "size": os.path.getsize(file_path),
            "entry": None,
            "segments": [],
        }
