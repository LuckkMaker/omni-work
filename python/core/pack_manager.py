"""CMSIS-Pack 管理

提供 CMSIS-Pack (.pack) 文件的导入、管理和卸载功能。
导入的 Pack 会通过 pyOCD 的 PackTargets 动态注册芯片到 TARGET 字典，
同时提取设备元数据写入 XML 设备目录。

Pack 文件存储在用户数据目录的 packs/ 子目录下。
安装清单存储在 packs/installed_packs.json。
"""

import json
import os
import shutil
import sys
import threading
from datetime import datetime
from typing import Optional

from core import database

_lock = threading.Lock()


def _get_data_dir() -> str:
    """获取用户数据目录"""
    if getattr(sys, "frozen", False):
        return os.environ.get("OMNI_DATA_DIR") or os.path.dirname(sys.executable)
    else:
        omni_data_dir = os.environ.get("OMNI_DATA_DIR")
        if omni_data_dir:
            return omni_data_dir
        src_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.normpath(os.path.join(src_dir, "..", "data"))


def get_packs_dir() -> str:
    """获取 Pack 文件存储目录"""
    packs_dir = os.path.join(_get_data_dir(), "packs")
    os.makedirs(packs_dir, exist_ok=True)
    return packs_dir


def get_manifest_path() -> str:
    """获取安装清单文件路径"""
    return os.path.join(get_packs_dir(), "installed_packs.json")


def load_manifest() -> list[dict]:
    """加载安装清单"""
    manifest_path = get_manifest_path()
    if not os.path.exists(manifest_path):
        return []
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_manifest(manifest: list[dict]) -> None:
    """保存安装清单"""
    manifest_path = get_manifest_path()
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)


def _extract_pack_info(pack_path: str) -> dict:
    """从 Pack 文件名提取基本信息

    CMSIS-Pack 标准命名: Vendor.Family_DFP.version.pack
    例如: Keil.STM32F4xx_DFP.3.0.0.pack
         Geehy.G32F020_DFP.0.0.8.pack

    版本号是最后一段连续的 dot-separated 数字（至少两段），
    例如 "3.0.0", "0.0.8", "1.2"。
    如果只有一段数字则视为非版本号（如 "DFP.3" 中的 3 不是版本）。
    """
    import re

    filename = os.path.basename(pack_path)
    name_part = filename
    if name_part.endswith(".pack"):
        name_part = name_part[:-5]

    # 尝试从末尾匹配版本号：至少两段 dot-separated 数字
    # 例如 "Geehy.G32F020_DFP.0.0.8" → name="Geehy.G32F020_DFP", version="0.0.8"
    match = re.match(r'^(.+?)\.(\d+\.\d+(?:\.\d+)*)$', name_part)
    if match:
        name = match.group(1)
        version = match.group(2)
    else:
        name = name_part
        version = "unknown"

    return {"name": name, "version": version, "filename": filename}


def _extract_devices_from_pack(pack_path: str) -> list[dict]:
    """从 Pack 中提取设备元数据列表

    直接解析 .pack（ZIP）中的 PDSC XML，不依赖 pyOCD 导入。
    提取每个设备的: part_number, vendor, core, flash_size, ram_size, flash_base, ram_base

    PDSC 结构:
    <package>
      <vendor>Geehy</vendor>
      <devices>
        <family Dfamily="..." Dvendor="Geehy:163">
          <processor Dcore="Cortex-M0+" .../>       ← family 级别
          <subFamily DsubFamily="G32F020">
            <processor Dclock="64000000"/>           ← subFamily 级别（补充）
            <device Dname="G32F020K8">
              <memory id="IROM1" start="0x0" size="0x10000" startup="1"/>
              <memory id="IRAM1" start="0x20000000" size="0x2000"/>
              <algorithm name="Flash/G32F020.FLM" .../>
            </device>
            <device Dname="G32F020K8"> ... </device>
          </subFamily>
          <device Dname="STM32F407VG">              ← 也支持直接在 family 下
            <memory name="FLASH" .../>
          </device>
          <variant Dvariant="STM32F407IG"> ... </variant>
        </family>
      </devices>
    </package>
    """
    import zipfile
    import xml.etree.ElementTree as ET

    devices = []

    try:
        with zipfile.ZipFile(pack_path, 'r') as zf:
            # 查找 PDSC 文件
            pdsc_files = [f for f in zf.namelist() if f.endswith('.pdsc')]
            if not pdsc_files:
                return devices

            with zf.open(pdsc_files[0]) as pf:
                tree = ET.parse(pf)
                root = tree.getroot()

            # 提取厂商名：优先 <vendor> 标签，回退 <vendors><vendor>
            vendor_name = ""
            vendor_elem = root.find('vendor')
            if vendor_elem is not None and vendor_elem.text:
                vendor_name = vendor_elem.text.strip()
            else:
                vendor_elem = root.find('.//vendors/vendor')
                if vendor_elem is not None and vendor_elem.text:
                    vendor_name = vendor_elem.text.strip()

            # 遍历设备 family
            for family in root.findall('.//devices/family'):
                family_vendor = family.get('Dvendor', vendor_name)
                # Dvendor 可能带 ":数字" 后缀（如 "Geehy:163"），取冒号前
                if ':' in family_vendor:
                    family_vendor = family_vendor.split(':')[0]

                # 收集 family 级别的 processor 信息（可被 subFamily/device 覆盖）
                family_proc = family.find('processor')

                # 处理 <subFamily> 下的 <device>（Geehy/STM32 等常见结构）
                for sub_family in family.findall('subFamily'):
                    sub_proc = sub_family.find('processor')
                    # subFamily 级别的 processor 可补充 family 级别的属性
                    merged_proc = _merge_processor(family_proc, sub_proc)

                    for dev_elem in sub_family.findall('device'):
                        device_info = _parse_pdsc_device(dev_elem, family_vendor, merged_proc)
                        if device_info:
                            devices.append(device_info)

                    # subFamily 下的 variant
                    for dev_elem in sub_family.findall('device'):
                        for variant_elem in dev_elem.findall('variant'):
                            device_info = _parse_pdsc_device(variant_elem, family_vendor, merged_proc)
                            if device_info:
                                devices.append(device_info)

                # 处理直接在 family 下的 <device>（无 subFamily 的情况）
                for dev_elem in family.findall('device'):
                    device_info = _parse_pdsc_device(dev_elem, family_vendor, family_proc)
                    if device_info:
                        devices.append(device_info)

                    # 处理 <variant> 子元素（容量变体）
                    for variant_elem in dev_elem.findall('variant'):
                        device_info = _parse_pdsc_device(variant_elem, family_vendor, family_proc)
                        if device_info:
                            devices.append(device_info)

    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to extract devices from pack: {e}")

    return devices


def _merge_processor(parent_proc, child_proc):
    """合并 parent 和 child 的 <processor> 属性，child 优先"""
    if parent_proc is None:
        return child_proc
    if child_proc is None:
        return parent_proc
    # 创建合并后的元素
    import xml.etree.ElementTree as ET
    merged = ET.Element('processor')
    for k, v in parent_proc.attrib.items():
        merged.set(k, v)
    for k, v in child_proc.attrib.items():
        merged.set(k, v)  # child 覆盖 parent
    return merged


def _parse_pdsc_device(elem, vendor: str, parent_processor=None) -> Optional[dict]:
    """从 PDSC XML 的 <device> 或 <variant> 元素解析设备元数据

    Args:
        elem: <device> 或 <variant> XML 元素
        vendor: 厂商名
        parent_processor: 从 family/subFamily 继承的 <processor> 元素
    """
    # 获取型号名
    part_number = elem.get('Dname') or elem.get('Dvariant') or ''
    if not part_number:
        return None

    # 解析内存区域
    # PDSC 有两种内存标记方式：
    #   Keil 风格: id="IROM1" (Flash) / id="IRAM1" (RAM)
    #   CMSIS 风格: name="FLASH" / name="RAM"
    flash_size = 0
    ram_size = 0
    flash_base = "0x00000000"
    ram_base = "0x20000000"
    flash_regions = []

    for mem in elem.findall('memory'):
        mem_name = (mem.get('name') or '').upper()
        mem_id = (mem.get('id') or '').upper()
        start_str = mem.get('start', '0x00000000')
        size_str = mem.get('size', '0x0')

        try:
            start = int(start_str, 16) if start_str.startswith('0x') else int(start_str)
            size = int(size_str, 16) if size_str.startswith('0x') else int(size_str)
        except ValueError:
            continue

        # 判断是否为 Flash（IROM / FLASH / 带 startup=1）
        is_flash = ('FLASH' in mem_name or
                    mem_id.startswith('IROM') or
                    mem.get('startup') == '1')
        # 判断是否为 RAM（IRAM / RAM）
        is_ram = ('RAM' in mem_name or mem_id.startswith('IRAM'))

        if is_flash:
            flash_size = size // 1024
            flash_base = f"0x{start:08X}"
            flash_regions.append({
                "start": f"0x{start:08X}",
                "length": f"0x{size:X}",
                "sector_size": "0x400",
                "page_size": "0x400",
                "is_boot_memory": True,
            })
        elif is_ram:
            ram_size = size // 1024
            ram_base = f"0x{start:08X}"

    # 解析内核信息：优先 device 自身的 <processor>，回退 parent_processor
    core = "Cortex-M4"  # 默认值
    proc_elem = elem.find('processor')
    if proc_elem is None:
        proc_elem = parent_processor
    if proc_elem is not None:
        dcore = proc_elem.get('Dcore', '')
        if dcore:
            core = dcore

    if not flash_regions:
        flash_regions.append({
            "start": flash_base,
            "length": f"0x{flash_size * 1024:X}" if flash_size > 0 else "0x0",
            "sector_size": "0x400",
            "page_size": "0x400",
            "is_boot_memory": True,
        })

    return {
        "part_number": part_number.lower(),
        "source": "pack",
        "vendor": vendor,
        "display_name": part_number,
        "core": core,
        "num_cores": 1,
        "flash_size": flash_size,
        "ram_size": ram_size,
        "flash_base_address": flash_base,
        "ram_base_address": ram_base,
        "device_id_address": "0xE0042000",
        "flash_regions": flash_regions,
    }


def import_pack(pack_path: str) -> dict:
    """导入 CMSIS-Pack 文件

    1. 复制 Pack 文件到 packs/ 目录
    2. 调用 pyOCD 注册芯片到 TARGET 字典
    3. 提取设备元数据写入 XML 目录
    4. 更新安装清单

    Returns: 导入结果 {"pack": {...}, "devices": [...], "device_count": N}
    Raises: Exception on failure
    """
    with _lock:
        if not os.path.exists(pack_path):
            raise FileNotFoundError(f"Pack 文件不存在: {pack_path}")

        pack_info = _extract_pack_info(pack_path)
        packs_dir = get_packs_dir()
        dest_path = os.path.join(packs_dir, pack_info["filename"])

        # 复制 Pack 文件
        shutil.copy2(pack_path, dest_path)

        # 注册芯片到 TARGET 字典（可选，失败不影响设备目录写入）
        registered_parts = []
        try:
            from pyocd.target.pack.pack_target import PackTargets
            PackTargets.populate_targets_from_pack(dest_path)

            # 记录已注册的 part_number
            from pyocd.target import TARGET
            registered_parts = list(TARGET.keys())
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f"pyOCD target registration skipped (devices still added to catalog): {e}"
            )

        # 提取设备元数据
        devices = _extract_devices_from_pack(dest_path)

        # 写入 XML 设备目录
        for dev in devices:
            dev["pack"] = pack_info["name"]
            database.upsert_device(dev)

        # 更新安装清单
        manifest = load_manifest()
        # 移除同名的旧版本
        manifest = [m for m in manifest if m["name"] != pack_info["name"]]
        manifest_entry = {
            "name": pack_info["name"],
            "version": pack_info["version"],
            "filename": pack_info["filename"],
            "path": dest_path,
            "devices": [d["part_number"] for d in devices],
            "device_count": len(devices),
            "installed_at": datetime.now().isoformat(),
        }
        manifest.append(manifest_entry)
        save_manifest(manifest)

        return {
            "pack": manifest_entry,
            "devices": devices,
            "device_count": len(devices),
        }


def list_installed_packs() -> list[dict]:
    """列出已安装的 Pack

    加载时会从文件名重新解析 name/version，修复旧清单中的错误数据。
    如果发现差异，自动更新清单文件。
    """
    manifest = load_manifest()
    needs_update = False
    result = []
    for entry in manifest:
        pack_path = entry.get("path", "")
        entry["file_exists"] = os.path.exists(pack_path)

        # 从文件名重新解析 name/version，修复旧清单数据
        if pack_path and os.path.exists(pack_path):
            fresh_info = _extract_pack_info(pack_path)
            if entry.get("name") != fresh_info["name"] or entry.get("version") != fresh_info["version"]:
                # 更新 XML 目录中设备的 pack 引用名
                old_name = entry.get("name", "")
                new_name = fresh_info["name"]
                if old_name != new_name:
                    try:
                        all_devices = database.list_devices()
                        for dev in all_devices:
                            if dev.get("source") == "pack" and dev.get("pack") == old_name:
                                dev["pack"] = new_name
                                database.upsert_device(dev)
                    except Exception:
                        pass

                entry["name"] = fresh_info["name"]
                entry["version"] = fresh_info["version"]
                needs_update = True

        result.append(entry)

    if needs_update:
        save_manifest(result)

    return result


def remove_pack(pack_name: str) -> bool:
    """卸载 Pack

    1. 从 TARGET 字典中移除该 Pack 注册的芯片
    2. 从 XML 目录中移除 source="pack" 且 pack=name 的设备
    3. 删除 Pack 文件
    4. 更新安装清单

    Returns: True if pack was found and removed
    """
    with _lock:
        manifest = load_manifest()
        entry = None
        for m in manifest:
            if m["name"] == pack_name:
                entry = m
                break

        if entry is None:
            return False

        # 从 TARGET 字典中移除
        try:
            from pyocd.target import TARGET
            parts_to_remove = entry.get("devices", [])
            keys_to_remove = []
            for key in list(TARGET.keys()):
                if key.lower() in [p.lower() for p in parts_to_remove]:
                    keys_to_remove.append(key)
            for key in keys_to_remove:
                TARGET.pop(key, None)
        except Exception:
            pass

        # 从 XML 目录中移除
        all_devices = database.list_devices()
        for dev in all_devices:
            if dev.get("source") == "pack" and dev.get("pack") == pack_name:
                database.delete_device(dev["part_number"])

        # 删除 Pack 文件
        pack_path = entry.get("path", "")
        if pack_path and os.path.exists(pack_path):
            try:
                os.remove(pack_path)
            except Exception:
                pass

        # 更新清单
        manifest = [m for m in manifest if m["name"] != pack_name]
        save_manifest(manifest)

        return True


def load_installed_packs() -> int:
    """启动时加载所有已安装的 Pack（重新注册到 TARGET 字典）

    Returns: 成功加载的 Pack 数量
    """
    manifest = load_manifest()
    count = 0
    for entry in manifest:
        pack_path = entry.get("path", "")
        if not os.path.exists(pack_path):
            continue
        try:
            from pyocd.target.pack.pack_target import PackTargets
            PackTargets.populate_targets_from_pack(pack_path)
            count += 1
        except Exception:
            continue
    return count
