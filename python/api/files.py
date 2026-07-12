"""文件解析 API 路由"""

import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ParseRequest(BaseModel):
    file_path: str


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
    elif ext == ".elf":
        # 解析 ELF 文件
        return parse_elf(req.file_path)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")


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
