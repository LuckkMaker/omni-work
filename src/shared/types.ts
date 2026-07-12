/** 探针信息 */
export interface ProbeInfo {
  uid: string
  vendor: string
  product: string
  vid: number
  pid: number
  serial: string
}

/** 目标芯片信息 */
export interface TargetInfo {
  part_number: string
  core: string
  flash_start: number
  flash_size: number
  page_size: number
  sector_size: number
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
  entry?: number
  segments?: { address: number; size: number }[]
}

/** 烧录进度事件 */
export interface FlashProgressEvent {
  phase: 'erase' | 'program' | 'verify'
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

/** Python 后端状态 */
export interface PythonStatus {
  running: boolean
  port: number | null
}

/** Electron preload 暴露的 API */
export interface ElectronAPI {
  getPythonPort: () => Promise<number | null>
  getPythonStatus: () => Promise<PythonStatus>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
