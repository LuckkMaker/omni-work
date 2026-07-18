"""工具页 REST API

提供 Map 文件解析等工具的后端支持。
"""

import os
import tempfile
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.map_parser import parse_map_file

logger = logging.getLogger(__name__)
router = APIRouter()


class MapAnalyzeRequest(BaseModel):
    """Map 文件解析请求"""
    filename: str
    content: str


@router.post("/tools/map-analyzer")
async def analyze_map_file(req: MapAnalyzeRequest):
    """解析 ARM 链接器 .map 文件并返回结构化分析数据

    支持 Arm Compiler (armlink) 格式的 map 文件。
    返回 JSON 格式的分析结果，包含摘要、分类、条目、区域等。
    """
    if not req.content:
        raise HTTPException(status_code=400, detail="Empty file content")

    if len(req.content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.map',
            delete=False,
            prefix='map_analyzer_',
            encoding='utf-8',
        ) as tmp:
            tmp.write(req.content)
            tmp_path = tmp.name

        # 解析 map 文件
        analysis = parse_map_file(tmp_path)
        result = analysis.to_dict()
        return result

    except Exception as e:
        logger.exception("Map file parsing failed")
        raise HTTPException(status_code=400, detail=f"Failed to parse map file: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
