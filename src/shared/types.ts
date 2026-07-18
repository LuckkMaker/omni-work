/** 仿真器信息 */
export interface ProbeInfo {
  uid: string
  vendor: string
  product: string
  vid: number
  pid: number
  serial: string
}

/** 仿真器连接状态 */
export type ProbeState = 'disconnected' | 'connecting' | 'connected' | 'error'

/** 带状态的仿真器信息（后端 get_probe_states 返回） */
export interface ProbeWithState extends ProbeInfo {
  state: ProbeState
  target: TargetInfo | null
}

/** Flash 区域信息（一段连续的同构 Flash） */
export interface FlashRegionInfo {
  start: number
  length: number
  sector_size: number
  page_size: number
  is_boot_memory: boolean
}

/** 单个扇区信息 */
export interface SectorInfo {
  index: number
  address: number
  size: number
}

/** 目标芯片信息（运行时从 pyOCD session 获取） */
export interface TargetInfo {
  part_number: string
  core: string
  flash_start: number
  flash_size: number
  page_size: number
  sector_size: number
  core_id: string
  endian: string
  /** 完整的 Flash 区域列表 */
  flash_regions: FlashRegionInfo[]
  /** 所有扇区的扁平列表 */
  sectors: SectorInfo[]
  /** RAM 起始地址 */
  ram_start: number
  /** RAM 大小（字节） */
  ram_size: number
}

/** 设备目录信息（来自 device_info.json，静态元数据） */
export interface DeviceInfo {
  part_number: string
  vendor: string
  display_name: string
  core: string
  num_cores: number
  /** Flash 大小（KB） */
  flash_size: number
  /** RAM 大小（KB） */
  ram_size: number
  /** Flash 基地址（十六进制字符串） */
  flash_base_address: string
  /** RAM 基地址（十六进制字符串） */
  ram_base_address: string
  /** Flash 区域布局（静态定义，连接前可用） */
  flash_regions?: DeviceFlashRegion[]
}

/** device_info.json 中的 Flash 区域（所有数值字段均为十六进制字符串） */
export interface DeviceFlashRegion {
  start: string
  length: string
  sector_size: string
  page_size: string
  is_boot_memory: boolean
}

/** Flash 操作结果 */
export interface FlashResult {
  success: boolean
  bytes_written: number
  duration_ms: number
  error?: string | null
}

/** 固件文件信息 */
export interface FirmwareFileInfo {
  format: 'bin' | 'hex' | 'elf'
  size: number
  entry?: number | null
  segments?: { address: number; size: number }[]
}

/** 烧录进度事件 */
export interface FlashProgressEvent {
  phase: 'erase' | 'program' | 'verify' | 'blank' | 'read'
  current: number
  total: number
  percent: number
}

/** 日志事件 */
export interface LogEvent {
  timestamp: string
  level: 'info' | 'warning' | 'error'
  message: string
}

/** WebSocket 事件通用结构 */
export interface WsEvent<T = unknown> {
  event: string
  data: T
}

/** 仿真器连接事件数据 */
export interface ProbeConnectedData {
  uid: string
  target?: TargetInfo | null
  reason?: string
}

/** 仿真器断开事件数据 */
export interface ProbeDisconnectedData {
  uid: string
  reason?: string
}

/** 仿真器列表事件数据 */
export interface ProbeListData {
  probes: ProbeWithState[]
}

/** Python 后端状态 */
export interface PythonStatus {
  running: boolean
  port: number | null
}

/** Electron preload 暴露的 API */
export interface ElectronAPI {
  getPythonPort: () => Promise<number | null>
  getPythonStatus: () => Promise<PythonStatus>
  openFileDialog: () => Promise<string | null>
  saveFileDialog: (defaultName?: string) => Promise<string | null>
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
