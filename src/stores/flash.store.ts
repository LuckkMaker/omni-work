import { create } from 'zustand'
import type { FirmwareFileInfo, FlashProgressEvent, LogEvent, FlashResult } from '@shared/types'
import * as flashService from '@/services/flash.service'
import { parseFile, readFile, type FileReadResult } from '@/services/file.service'
import { useProbeStore } from './probe.store'

/** 烧录阶段 */
type FlashPhase = 'idle' | 'erasing' | 'programming' | 'verifying' | 'done' | 'error'

interface FlashStore {
  // ── 文件状态 ──────────────────────────
  /** 当前选中的文件路径 */
  filePath: string | null
  /** 文件解析信息 */
  fileInfo: FirmwareFileInfo | null
  /** 文件加载中 */
  loadingFile: boolean
  /** 文件二进制数据（base64 + 地址，供 HexViewer 显示） */
  fileData: FileReadResult | null

  // ── 烧录状态 ──────────────────────────
  /** 当前烧录阶段 */
  phase: FlashPhase
  /** 进度百分比 0-100 */
  progress: number
  /** 进度详情（当前字节/总字节） */
  progressCurrent: number
  progressTotal: number
  /** 烧录操作进行中 */
  busy: boolean
  /** 烧录结果 */
  result: FlashResult | null

  // ── 烧录选项 ──────────────────────────
  /** 烧录前擦除 */
  eraseBefore: boolean
  /** 烧录后校验 */
  verifyAfter: boolean
  /** 烧录后复位运行 */
  resetAfter: boolean

  // ── 日志 ──────────────────────────────
  logs: LogEvent[]

  // ── 操作 ──────────────────────────────
  /** 加载文件（弹出对话框 + 解析） */
  loadFile: () => Promise<void>
  /** 清除文件 */
  clearFile: () => void
  /** 执行擦除 */
  doErase: () => Promise<void>
  /** 执行烧录 */
  doProgram: () => Promise<void>
  /** 执行校验 */
  doVerify: () => Promise<void>
  /** 执行复位 */
  doReset: () => Promise<void>
  /** 设置烧录选项 */
  setOption: (key: 'eraseBefore' | 'verifyAfter' | 'resetAfter', value: boolean) => void

  // ── WebSocket 事件 ────────────────────
  onProgress: (data: FlashProgressEvent) => void
  onLog: (data: LogEvent) => void
  onComplete: (data: FlashResult) => void
  /** 重置到初始状态 */
  reset: () => void
}

export const useFlashStore = create<FlashStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────
  filePath: null,
  fileInfo: null,
  loadingFile: false,
  fileData: null,

  phase: 'idle',
  progress: 0,
  progressCurrent: 0,
  progressTotal: 0,
  busy: false,
  result: null,

  eraseBefore: true,
  verifyAfter: true,
  resetAfter: true,

  logs: [],

  // ── 操作 ──────────────────────────────
  loadFile: async () => {
    const path = await window.electron.openFileDialog()
    if (!path) return

    set({ loadingFile: true, filePath: path, fileInfo: null, fileData: null })
    try {
      const [info, data] = await Promise.all([parseFile(path), readFile(path)])
      set({ fileInfo: info, fileData: data, loadingFile: false })
    } catch (err) {
      set({ loadingFile: false })
      console.error('[flash.store] loadFile failed:', err)
    }
  },

  clearFile: () => set({ filePath: null, fileInfo: null, fileData: null }),

  doErase: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    set({ busy: true, phase: 'erasing', progress: 0, result: null, logs: [] })
    try {
      await flashService.eraseFlash(uid, 'chip')
      set({ phase: 'done', busy: false })
    } catch (err) {
      set({ phase: 'error', busy: false, result: { success: false, bytes_written: 0, duration_ms: 0, error: err instanceof Error ? err.message : '擦除失败' } })
    }
  },

  doProgram: async () => {
    const uid = useProbeStore.getState().selectedUid
    const { filePath, eraseBefore } = get()
    if (!uid || !filePath) return
    set({ busy: true, phase: eraseBefore ? 'erasing' : 'programming', progress: 0, result: null, logs: [] })
    try {
      const result = await flashService.programFlash(uid, filePath, get().verifyAfter, get().resetAfter)
      set({ phase: result.success ? 'done' : 'error', busy: false, result })
    } catch (err) {
      set({ phase: 'error', busy: false, result: { success: false, bytes_written: 0, duration_ms: 0, error: err instanceof Error ? err.message : '烧录失败' } })
    }
  },

  doVerify: async () => {
    const uid = useProbeStore.getState().selectedUid
    const { filePath } = get()
    if (!uid || !filePath) return
    set({ busy: true, phase: 'verifying', progress: 0, result: null, logs: [] })
    try {
      const result = await flashService.verifyFlash(uid, filePath)
      set({ phase: result.success ? 'done' : 'error', busy: false, result })
    } catch (err) {
      set({ phase: 'error', busy: false, result: { success: false, bytes_written: 0, duration_ms: 0, error: err instanceof Error ? err.message : '校验失败' } })
    }
  },

  doReset: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    set({ busy: true, result: null, logs: [] })
    try {
      await flashService.resetTarget(uid, 'hw', true)
      set({ busy: false })
    } catch (err) {
      set({ busy: false })
      console.error('[flash.store] reset failed:', err)
    }
  },

  setOption: (key, value) => set({ [key]: value } as Partial<FlashStore>),

  // ── WebSocket 事件 ────────────────────
  onProgress: (data) => {
    const phaseMap: Record<string, FlashPhase> = {
      erase: 'erasing',
      program: 'programming',
      verify: 'verifying',
    }
    set({
      phase: phaseMap[data.phase] ?? get().phase,
      progress: data.percent,
      progressCurrent: data.current,
      progressTotal: data.total,
    })
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
  },

  reset: () => set({
    phase: 'idle',
    progress: 0,
    progressCurrent: 0,
    progressTotal: 0,
    busy: false,
    result: null,
    logs: [],
  }),
}))
