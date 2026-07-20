"""SQLite 数据库管理

提供设备目录数据的持久化存储，替代 device_info.json。

首次运行时自动从 device_info.json 导入初始数据。
后续可通过 API 进行 CRUD 操作。
"""

import json
import os
import sqlite3
import threading
from typing import Optional

# 数据库文件路径：python/data/devices.db
_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "devices.db")
# 初始数据源：device_info.json（仅首次导入用）
_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "device_info.json")

# 线程锁（sqlite3 连接默认不可跨线程，用锁保护）
_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None


def _get_conn() -> sqlite3.Connection:
    """获取数据库连接（单例，线程安全）"""
    global _conn
    if _conn is not None:
        return _conn

    # 确保数据目录存在
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)

    _conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    _conn.row_factory = sqlite3.Row  # 支持按列名访问
    _conn.execute("PRAGMA journal_mode=WAL")  # 提升并发读写性能
    _conn.execute("PRAGMA foreign_keys=ON")

    _init_schema(_conn)
    _migrate_from_json(_conn)

    return _conn


def _init_schema(conn: sqlite3.Connection) -> None:
    """创建表结构（如果不存在）"""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS devices (
            part_number      TEXT PRIMARY KEY,
            vendor           TEXT NOT NULL,
            display_name     TEXT NOT NULL,
            core             TEXT NOT NULL,
            num_cores        INTEGER NOT NULL DEFAULT 1,
            flash_size       INTEGER NOT NULL,  -- KB
            ram_size         INTEGER NOT NULL,  -- KB
            flash_base_address TEXT NOT NULL,   -- 十六进制字符串
            ram_base_address   TEXT NOT NULL,   -- 十六进制字符串
            device_id_address   TEXT NOT NULL DEFAULT '0xE0042000',  -- DBGMCU_IDCODE 寄存器地址
            created_at       TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at       TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS flash_regions (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            part_number      TEXT NOT NULL,
            region_index     INTEGER NOT NULL,
            start            TEXT NOT NULL,      -- 十六进制字符串
            length           TEXT NOT NULL,      -- 十六进制字符串
            sector_size      TEXT NOT NULL,      -- 十六进制字符串
            page_size        TEXT NOT NULL,      -- 十六进制字符串
            is_boot_memory   INTEGER NOT NULL DEFAULT 0,  -- 0/1
            FOREIGN KEY (part_number) REFERENCES devices(part_number) ON DELETE CASCADE,
            UNIQUE (part_number, region_index)
        );

        CREATE INDEX IF NOT EXISTS idx_flash_regions_part ON flash_regions(part_number);
    """)
    conn.commit()

    # Schema 增量迁移：为旧数据库添加新列
    _migrate_add_column(conn, "devices", "device_id_address", "TEXT NOT NULL DEFAULT '0xE0042000'")

    # 初始化数据库版本号（PRAGMA user_version）：旧库为 0 时升级到 1
    # 用于 /api/system/info 展示当前 schema 版本，后续迁移可递增
    try:
        row = conn.execute("PRAGMA user_version").fetchone()
        current_version = int(row[0]) if row else 0
        if current_version == 0:
            conn.execute("PRAGMA user_version = 1")
            conn.commit()
    except Exception:
        pass


def _migrate_add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    """安全地为表添加列（如果列不存在）"""
    try:
        cols = [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if column not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            conn.commit()
    except Exception:
        pass


def _migrate_from_json(conn: sqlite3.Connection) -> None:
    """首次运行时从 device_info.json 导入数据"""
    # 检查 devices 表是否已有数据
    count = conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0]
    if count > 0:
        return

    if not os.path.exists(_JSON_PATH):
        return

    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        devices = json.load(f)

    for d in devices:
        upsert_device(conn, d)
    conn.commit()


def get_db_path() -> str:
    """返回数据库文件路径"""
    return _DB_PATH


def get_db_version() -> int:
    """返回数据库 schema 版本号（PRAGMA user_version）

    首次初始化时 user_version 被设为 1，后续迁移可递增。
    任何异常均回退到 0，确保不崩溃。
    """
    try:
        with _lock:
            conn = _get_conn()
            row = conn.execute("PRAGMA user_version").fetchone()
            return int(row[0]) if row else 0
    except Exception:
        return 0


# ── CRUD 操作 ─────────────────────────────


def list_devices() -> list[dict]:
    """列出所有设备（含 flash_regions）"""
    with _lock:
        conn = _get_conn()
        rows = conn.execute("SELECT * FROM devices ORDER BY vendor, display_name").fetchall()
        result = []
        for row in rows:
            device = dict(row)
            device["flash_regions"] = _get_flash_regions(conn, device["part_number"])
            result.append(device)
        return result


def get_device(part_number: str) -> Optional[dict]:
    """获取指定设备（含 flash_regions）"""
    with _lock:
        conn = _get_conn()
        row = conn.execute(
            "SELECT * FROM devices WHERE part_number = ?", (part_number,)
        ).fetchone()
        if row is None:
            return None
        device = dict(row)
        device["flash_regions"] = _get_flash_regions(conn, part_number)
        return device


def upsert_device(conn: sqlite3.Connection, device: dict) -> None:
    """插入或更新设备（含 flash_regions）"""
    conn.execute(
        """
        INSERT INTO devices (part_number, vendor, display_name, core, num_cores,
                             flash_size, ram_size, flash_base_address, ram_base_address, device_id_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(part_number) DO UPDATE SET
            vendor = excluded.vendor,
            display_name = excluded.display_name,
            core = excluded.core,
            num_cores = excluded.num_cores,
            flash_size = excluded.flash_size,
            ram_size = excluded.ram_size,
            flash_base_address = excluded.flash_base_address,
            ram_base_address = excluded.ram_base_address,
            device_id_address = excluded.device_id_address,
            updated_at = datetime('now', 'localtime')
        """,
        (
            device["part_number"],
            device["vendor"],
            device["display_name"],
            device["core"],
            device.get("num_cores", 1),
            device["flash_size"],
            device["ram_size"],
            device["flash_base_address"],
            device["ram_base_address"],
            device.get("device_id_address", "0xE0042000"),
        ),
    )

    # 替换 flash_regions（先删后插）
    part_number = device["part_number"]
    conn.execute("DELETE FROM flash_regions WHERE part_number = ?", (part_number,))
    for i, r in enumerate(device.get("flash_regions", [])):
        conn.execute(
            """
            INSERT INTO flash_regions (part_number, region_index, start, length, sector_size, page_size, is_boot_memory)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                part_number,
                i,
                r["start"],
                r["length"],
                r["sector_size"],
                r["page_size"],
                1 if r.get("is_boot_memory") else 0,
            ),
        )
    conn.commit()


def _get_flash_regions(conn: sqlite3.Connection, part_number: str) -> list[dict]:
    """获取指定设备的 flash_regions"""
    rows = conn.execute(
        "SELECT * FROM flash_regions WHERE part_number = ? ORDER BY region_index",
        (part_number,),
    ).fetchall()
    return [
        {
            "start": row["start"],
            "length": row["length"],
            "sector_size": row["sector_size"],
            "page_size": row["page_size"],
            "is_boot_memory": bool(row["is_boot_memory"]),
        }
        for row in rows
    ]


def add_device(device: dict) -> dict:
    """新增设备"""
    with _lock:
        conn = _get_conn()
        upsert_device(conn, device)
    return get_device(device["part_number"])


def update_device(part_number: str, device: dict) -> Optional[dict]:
    """更新设备（part_number 不可变）"""
    with _lock:
        conn = _get_conn()
        existing = conn.execute(
            "SELECT 1 FROM devices WHERE part_number = ?", (part_number,)
        ).fetchone()
        if existing is None:
            return None
        # 确保用 URL 中的 part_number
        device["part_number"] = part_number
        upsert_device(conn, device)
    return get_device(part_number)


def delete_device(part_number: str) -> bool:
    """删除设备（flash_regions 通过 ON DELETE CASCADE 自动删除）"""
    with _lock:
        conn = _get_conn()
        cursor = conn.execute(
            "DELETE FROM devices WHERE part_number = ?", (part_number,)
        )
        conn.commit()
        return cursor.rowcount > 0


def reimport_from_json() -> int:
    """从 device_info.json 重新导入数据（覆盖同名设备）

    Returns: 导入的设备数量
    """
    if not os.path.exists(_JSON_PATH):
        return 0

    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        devices = json.load(f)

    with _lock:
        conn = _get_conn()
        for d in devices:
            upsert_device(conn, d)
        conn.commit()

    return len(devices)
