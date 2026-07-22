"""系统信息 REST API

提供后端版本、数据库版本、运行环境等信息，供前端设置页展示。
"""

import platform
import logging
from fastapi import APIRouter, Request

from core import database

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_pyocd_version() -> str:
    """获取 pyocd 版本号，失败回退 "unknown" """
    try:
        from pyocd._version import __version__  # type: ignore
        return __version__
    except Exception:
        return "unknown"


@router.get("/system/info")
async def system_info(request: Request):
    """返回后端/数据库/运行环境版本信息

    供前端设置页展示后端版本、数据库版本、Python/pyocd 版本等。
    app_version/backend_version 取自 FastAPI 实例的 version
    （即 server.py 中定义的 BACKEND_VERSION）。
    所有外部属性访问均做异常兜底，确保不崩溃。
    """
    try:
        backend_version = request.app.version
    except Exception:
        backend_version = "unknown"

    try:
        db_version = database.get_db_version()
    except Exception:
        db_version = 0

    try:
        db_path = database.get_db_path()
    except Exception:
        db_path = "unknown"

    try:
        source_summary = database.get_source_summary()
    except Exception:
        source_summary = {}

    return {
        "app_version": backend_version,
        "backend_version": backend_version,
        "python_version": platform.python_version(),
        "platform": platform.system(),
        "db_version": db_version,
        "db_path": db_path,
        "pyocd_version": _get_pyocd_version(),
        "source_summary": source_summary,
    }
