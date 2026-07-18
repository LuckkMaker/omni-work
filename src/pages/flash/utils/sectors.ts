/**
 * Flash 扇区相关工具函数
 *
 * 统一处理两种数据来源的扇区计算：
 * 1. 连接后：TargetInfo.sectors（后端从 pyOCD memory_map 直接返回）
 * 2. 未连接：DeviceInfo.flash_regions（静态元数据，需前端计算扇区列表）
 */
import type {
  TargetInfo,
  DeviceInfo,
  FlashRegionInfo,
  SectorInfo,
  DeviceFlashRegion,
} from '@shared/types'

/**
 * 将十六进制字符串或数字转换为数字
 */
function toNum(v: string | number): number {
  if (typeof v === 'string') return parseInt(v, 16)
  return v
}

/**
 * 将 DeviceFlashRegion（start/length/sector_size/page_size 均为十六进制字符串）转换为 FlashRegionInfo（数字）
 */
export function deviceRegionToFlashRegion(r: DeviceFlashRegion): FlashRegionInfo {
  return {
    start: toNum(r.start),
    length: toNum(r.length),
    sector_size: toNum(r.sector_size),
    page_size: toNum(r.page_size),
    is_boot_memory: r.is_boot_memory,
  }
}

/**
 * 从 Flash 区域列表计算扇区列表
 */
export function sectorsFromRegions(regions: FlashRegionInfo[]): SectorInfo[] {
  const sectors: SectorInfo[] = []
  let index = 0
  for (const r of regions) {
    for (let offset = 0; offset < r.length; offset += r.sector_size) {
      sectors.push({
        index,
        address: r.start + offset,
        size: r.sector_size,
      })
      index++
    }
  }
  return sectors
}

/**
 * 获取 Flash 区域列表（优先使用 TargetInfo，回退到 DeviceInfo）
 */
export function getFlashRegions(
  target: TargetInfo | null,
  deviceInfo: DeviceInfo | undefined
): FlashRegionInfo[] {
  // 连接后：直接使用后端返回的 flash_regions
  if (target?.flash_regions && target.flash_regions.length > 0) {
    return target.flash_regions
  }
  // 未连接：从 device_info.json 的 flash_regions 计算
  if (deviceInfo?.flash_regions && deviceInfo.flash_regions.length > 0) {
    return deviceInfo.flash_regions.map(deviceRegionToFlashRegion)
  }
  return []
}

/**
 * 获取扇区列表（优先使用 TargetInfo，回退到从 DeviceInfo 计算）
 */
export function getSectors(
  target: TargetInfo | null,
  deviceInfo: DeviceInfo | undefined
): SectorInfo[] {
  // 连接后：直接使用后端返回的 sectors
  if (target?.sectors && target.sectors.length > 0) {
    return target.sectors
  }
  // 未连接：从 flash_regions 计算
  const regions = getFlashRegions(target, deviceInfo)
  return sectorsFromRegions(regions)
}

/**
 * 格式化字节数为人类可读字符串
 */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * 格式化地址为十六进制字符串
 */
export function formatHex(addr: number, pad = 8): string {
  return `0x${addr.toString(16).toUpperCase().padStart(pad, '0')}`
}

/**
 * 根据选中的扇区索引集合，计算合并后的连续地址范围列表。
 * 不连续的扇区会产生多个 range。
 *
 * @returns [{ start, end }, ...]（end 为最后字节地址）
 */
export function selectedSectorsToRanges(
  selectedIndices: Set<number>,
  target: TargetInfo | null,
  deviceInfo: DeviceInfo | undefined
): { start: number; end: number }[] {
  const allSectors = getSectors(target, deviceInfo)
  // 筛选并按地址排序
  const selected = allSectors
    .filter((s) => selectedIndices.has(s.index))
    .sort((a, b) => a.address - b.address)
  if (selected.length === 0) return []

  const ranges: { start: number; end: number }[] = []
  let current: { start: number; end: number } | null = null
  for (const s of selected) {
    const sectorEnd = s.address + s.size - 1
    if (current && s.address === current.end + 1) {
      current.end = sectorEnd
    } else {
      if (current) ranges.push(current)
      current = { start: s.address, end: sectorEnd }
    }
  }
  if (current) ranges.push(current)
  return ranges
}

/**
 * 解析十六进制地址字符串（支持 "0x08000000" 或 "08000000" 格式）
 * @returns 数字或 null（无效时）
 */
export function parseHex(s: string): number | null {
  const t = s.trim().toLowerCase()
  if (!t) return null
  const v = t.startsWith('0x') ? parseInt(t, 16) : parseInt(t, 16)
  return isNaN(v) ? null : v
}
