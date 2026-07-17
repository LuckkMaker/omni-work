import { create } from 'zustand'
import type { FirmwareFileInfo, FlashProgressEvent, LogEvent, FlashResult } from '@shared/types'
import * as flashService from '@/services/flash.service'
import { parseFile, readFile, type FileReadResult } from '@/services/file.service'
import { useProbeStore } from './probe.store'
import { useNotificationStore } from './notification.store'

/** 烧录阶段 */
type FlashPhase = 'idle' | 'erasing' | 'programming' | 'verifying' | 'reading' | 'done' | 'error'

interface FlashStore {
  // ── 文件状态 ──────────────────────────
  filePath: string | null
  fileInfo: FirmwareFileInfo | null
  loadingFile: boolean
  fileData: FileReadResult | null
  /** BIN 文件的 Flash 基地址（用户输入） */
  binBaseAddress: number | null
  /** 是否需要弹出 BIN 基地址输入框 */
  showBinAddrDialog: boolean
  /** 是否弹出扇区擦除对话框 */
  showEraseSectorsDialog: boolean
  /** 是否弹出读回对话框 */
  showReadBackDialog: boolean

  // ── 烧录状态 ──────────────────────────
  phase: FlashPhase
  progress: number
  progressCurrent: number
  progressTotal: number
  busy: boolean
  result: FlashResult | null
  /** 当前操作的通知 ID（用于更新进度） */
  activeNotifId: string | null

  // ── 烧录选项 ──────────────────────────
  eraseBefore: boolean
  verifyAfter: boolean
  resetAfter: boolean

  // ── 日志 ──────────────────────────────
  logs: LogEvent[]

  // ── 文件操作 ──────────────────────────
  loadFile: () => Promise<void>
  clearFile: () => void

  // ── BIN 基地址弹窗 ────────────────────
  setShowBinAddrDialog: (show: boolean) => void
  setBinBaseAddress: (addr: number | null) => void
  loadBinWithAddress: (address?: number) => Promise<void>

  // ── 对话框控制 ────────────────────────
  setShowEraseSectorsDialog: (show: boolean) => void
  setShowReadBackDialog: (show: boolean) => void

  // ── Flash 操作 ────────────────────────
  doCheckBlank: () => Promise<void>
  doEraseChip: () => Promise<void>
  doEraseSectors: (address: number, size: number) => Promise<void>
  doProgram: (verify?: boolean) => Promise<void>
  doVerify: () => Promise<void>
  doReadBack: (mode: 'chip' | 'range', outputPath: string, address?: number, size?: number) => Promise<void>
  doStartApp: () => Promise<void>
  doReset: () => Promise<void>

  setOption: (key: 'eraseBefore' | 'verifyAfter' | 'resetAfter', value: boolean) => void

  // ── WebSocket 事件 ────────────────────
  onProgress: (data: FlashProgressEvent) => void
  onLog: (data: LogEvent) => void
  onComplete: (data: FlashResult) => void
  reset: () => void
}

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatHex(addr: number): string {
  return `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`
}

/** 通用操作包装：推送进度通知 → 执行 → 更新通知 */
async function wrapOperation(
  set: (partial: Partial<FlashStore>) => void,
  get: () => FlashStore,
  title: string,
  startMsg: string,
  fn: () => Promise<{ success: boolean; error?: string; duration_ms?: number; bytes_written?: number; bytes_read?: number }>,
  successMsg?: (result: any) => string,
) {
  const uid = useProbeStore.getState().selectedUid
  if (!uid) return
  const notif = useNotificationStore.getState()
  const notifId = notif.push({ type: 'progress', title, message: startMsg, progress: 0 })
  set({ busy: true, progress: 0, result: null, logs: [], activeNotifId: notifId })
  try {
    const result = await fn()
    set({ phase: result.success ? 'done' : 'error', busy: false, result: result as FlashResult, activeNotifId: null })
    if (result.success) {
      notif.update(notifId, {
        type: 'success',
        title: `${title}完成`,
        message: successMsg ? successMsg(result) : '操作成功',
        autoClose: true,
        autoCloseDelay: 5000,
      })
    } else {
      notif.update(notifId, {
        type: 'error',
        title: `${title}失败`,
        message: result.error ?? '未知错误',
        autoClose: true,
        autoCloseDelay: 5000,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : `${title}失败`
    set({ phase: 'error', busy: false, result: { success: false, bytes_written: 0, duration_ms: 0, error: msg }, activeNotifId: null })
    notif.update(notifId, { type: 'error', title: `${title}失败`, message: msg, autoClose: true, autoCloseDelay: 5000 })
  }
}

export const useFlashStore = create<FlashStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────
  filePath: null,
  fileInfo: null,
  loadingFile: false,
  fileData: null,
  binBaseAddress: null,
  showBinAddrDialog: false,
  showEraseSectorsDialog: false,
  showReadBackDialog: false,

  phase: 'idle',
  progress: 0,
  progressCurrent: 0,
  progressTotal: 0,
  busy: false,
  result: null,
  activeNotifId: null,

  eraseBefore: true,
  verifyAfter: true,
  resetAfter: true,

  logs: [],

  // ── 文件操作 ──────────────────────────
  loadFile: async () => {
    const path = await window.electron.openFileDialog()
    if (!path) return

    const isBin = path.toLowerCase().endsWith('.bin')
    if (isBin) {
      const { getDeviceInfo, pendingTarget } = useProbeStore.getState()
      const devInfo = getDeviceInfo(pendingTarget || '')
      const defaultAddr = devInfo?.flash_base_address
        ? parseInt(devInfo.flash_base_address, 16)
        : 0x08000000
      set({
        filePath: path,
        binBaseAddress: defaultAddr,
        showBinAddrDialog: true,
        fileInfo: null,
        fileData: null,
      })
      return
    }

    set({ loadingFile: true, filePath: path, fileInfo: null, fileData: null })
    try {
      const [info, data] = await Promise.all([parseFile(path), readFile(path)])
      set({ fileInfo: info, fileData: data, loadingFile: false })
    } catch (err) {
      set({ loadingFile: false })
      console.error('[flash.store] loadFile failed:', err)
    }
  },

  clearFile: () => set({ filePath: null, fileInfo: null, fileData: null, binBaseAddress: null, showBinAddrDialog: false }),

  setShowBinAddrDialog: (show) => set({ showBinAddrDialog: show }),
  setBinBaseAddress: (addr) => set({ binBaseAddress: addr }),

  loadBinWithAddress: async (address?: number) => {
    const addr = address ?? get().binBaseAddress
    const { filePath } = get()
    if (!filePath || addr == null) return
    set({ showBinAddrDialog: false, loadingFile: true, binBaseAddress: addr })
    try {
      const [info, data] = await Promise.all([
        parseFile(filePath),
        readFile(filePath, addr),
      ])
      set({ fileInfo: info, fileData: data, loadingFile: false })
    } catch (err) {
      set({ loadingFile: false })
      console.error('[flash.store] loadBinWithAddress failed:', err)
    }
  },

  setShowEraseSectorsDialog: (show) => set({ showEraseSectorsDialog: show }),
  setShowReadBackDialog: (show) => set({ showReadBackDialog: show }),

  // ── Flash 操作 ────────────────────────
  doCheckBlank: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    await wrapOperation(set, get, '检查空白', '正在检查...', async () => {
      const result = await flashService.checkBlank(uid)
      if (result.success && result.is_blank !== undefined) {
        return {
          success: true,
          duration_ms: result.duration_ms,
          error: result.is_blank ? undefined : `非空白，首个非0xFF地址: ${result.first_nonblank_addr ? formatHex(result.first_nonblank_addr) : 'N/A'}`,
        }
      }
      return { success: false, error: result.error ?? '检查失败' }
    }, (r) => r.error ? `发现非空白区域` : `Flash 全部为 0xFF (${formatSize(r.bytes_written || 0)})`)
    // 检查空白特殊：success 但 is_blank=false 时应显示 warning
    const state = get()
    if (state.result && !state.result.error?.includes('非空白')) {
      // blank check passed
    } else if (state.result?.error?.includes('非空白')) {
      const notif = useNotificationStore.getState()
      notif.push({ type: 'warning', title: '检查空白', message: state.result.error, autoClose: true, autoCloseDelay: 5000 })
    }
  },

  doEraseChip: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    await wrapOperation(set, get, '整片擦除', '正在擦除...', async () => {
      return await flashService.eraseFlash(uid, 'chip')
    }, () => 'Flash 已整片擦除')
  },

  doEraseSectors: async (address, size) => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    set({ showEraseSectorsDialog: false })
    await wrapOperation(set, get, '扇区擦除', `擦除 ${formatHex(address)} ~ ${formatHex(address + size)}...`, async () => {
      return await flashService.eraseFlash(uid, 'sector_range', address, size)
    }, () => `扇区擦除完成`)
  },

  doProgram: async (verify) => {
    const uid = useProbeStore.getState().selectedUid
    const { filePath, eraseBefore, verifyAfter, resetAfter, binBaseAddress } = get()
    if (!uid || !filePath) return
    // verify 参数优先，否则用 verifyAfter 选项
    const shouldVerify = verify ?? verifyAfter
    const title = shouldVerify ? '编程并校验' : '编程'
    await wrapOperation(set, get, title, eraseBefore ? '擦除中...' : '编程中...', async () => {
      const result = await flashService.programFlash(uid, filePath, shouldVerify, resetAfter, binBaseAddress ?? undefined)
      return result
    }, (r) => {
      const speed = r.bytes_written > 0 && r.duration_ms > 0
        ? ` · ${(r.bytes_written / 1024 / (r.duration_ms / 1000)).toFixed(1)} KB/s`
        : ''
      return `写入 ${formatSize(r.bytes_written)} · 耗时 ${(r.duration_ms / 1000).toFixed(2)}s${speed}`
    })
  },

  doVerify: async () => {
    const uid = useProbeStore.getState().selectedUid
    const { filePath } = get()
    if (!uid || !filePath) return
    await wrapOperation(set, get, '校验', '正在校验...', async () => {
      return await flashService.verifyFlash(uid, filePath)
    }, () => 'Flash 内容与文件一致')
  },

  doReadBack: async (mode, outputPath, address, size) => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    set({ showReadBackDialog: false })
    await wrapOperation(set, get, '读回', '正在读取 Flash...', async () => {
      const result = await flashService.readBack(uid, mode, outputPath, address, size)
      return { success: result.success, error: result.error, duration_ms: result.duration_ms, bytes_read: result.bytes_read }
    }, (r) => `读取 ${formatSize(r.bytes_read || 0)} 到 ${outputPath.split(/[/\\]/).pop()}`)
  },

  doStartApp: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    await wrapOperation(set, get, '启动应用', '正在启动...', async () => {
      const result = await flashService.resetTarget(uid, 'hw', true)
      return { success: result.success }
    }, () => '目标已复位并运行')
  },

  doReset: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    await wrapOperation(set, get, '复位', '正在复位...', async () => {
      const result = await flashService.resetTarget(uid, 'hw', false)
      return { success: result.success }
    }, () => '目标已复位')
  },

  setOption: (key, value) => set({ [key]: value } as Partial<FlashStore>),

  // ── WebSocket 事件 ────────────────────
  onProgress: (data) => {
    const phaseMap: Record<string, FlashPhase> = {
      erase: 'erasing',
      program: 'programming',
      verify: 'verifying',
    }
    const newPhase = phaseMap[data.phase] ?? get().phase
    const msgMap: Record<string, string> = {
      erase: '擦除中...',
      program: '编程中...',
      verify: '校验中...',
    }
    set({
      phase: newPhase,
      progress: data.percent,
      progressCurrent: data.current,
      progressTotal: data.total,
    })
    const { activeNotifId } = get()
    if (activeNotifId) {
      const notif = useNotificationStore.getState()
      notif.update(activeNotifId, {
        progress: data.percent,
        message: data.total > 0
          ? `${msgMap[data.phase] ?? ''} ${formatSize(data.current)} / ${formatSize(data.total)}`
          : (msgMap[data.phase] ?? ''),
      })
    }
  },

  onLog: (data) => {
    set((state) => ({ logs: [...state.logs, data] }))
  },

  onComplete: (data) => {
    set({
      phase: data.success ? 'done' : 'error',
      busy: false,
      result: data,
      progress: data.success ? 100 : get().progress,
    })
    const { activeNotifId } = get()
    if (activeNotifId) {
      const notif = useNotificationStore.getState()
      if (data.success) {
        notif.update(activeNotifId, {
          type: 'success',
          title: '操作完成',
          message: `写入 ${formatSize(data.bytes_written)} · 耗时 ${(data.duration_ms / 1000).toFixed(2)}s`,
          autoClose: true,
          autoCloseDelay: 3000,
        })
      } else {
        notif.update(activeNotifId, {
          type: 'error',
          title: '操作失败',
          message: data.error ?? '未知错误',
          autoClose: true,
          autoCloseDelay: 5000,
        })
      }
      set({ activeNotifId: null })
    }
  },

  reset: () => set({
    phase: 'idle',
    progress: 0,
    progressCurrent: 0,
    progressTotal: 0,
    busy: false,
    result: null,
    logs: [],
    activeNotifId: null,
  }),
}))
