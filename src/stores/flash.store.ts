import { create } from 'zustand'
import type { FirmwareFileInfo, FlashProgressEvent, LogEvent, FlashResult } from '@shared/types'
import * as flashService from '@/services/flash.service'
import { parseFile, readFile, type FileReadResult } from '@/services/file.service'
import { useProbeStore } from './probe.store'
import { useNotificationStore } from './notification.store'

/** 烧录阶段 */
type FlashPhase = 'idle' | 'erasing' | 'programming' | 'verifying' | 'done' | 'error'

interface FlashStore {
  // ── 文件状态 ──────────────────────────
  filePath: string | null
  fileInfo: FirmwareFileInfo | null
  loadingFile: boolean
  fileData: FileReadResult | null

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

  // ── 操作 ──────────────────────────────
  loadFile: () => Promise<void>
  clearFile: () => void
  doErase: () => Promise<void>
  doProgram: () => Promise<void>
  doVerify: () => Promise<void>
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
  activeNotifId: null,

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
    const notif = useNotificationStore.getState()
    const notifId = notif.push({ type: 'progress', title: '擦除 Flash', message: '正在擦除...', progress: 0 })
    set({ busy: true, phase: 'erasing', progress: 0, result: null, logs: [], activeNotifId: notifId })
    try {
      await flashService.eraseFlash(uid, 'chip')
      set({ phase: 'done', busy: false, activeNotifId: null })
      notif.update(notifId, { type: 'success', title: '擦除完成', message: 'Flash 已擦除', autoClose: true, autoCloseDelay: 3000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '擦除失败'
      set({ phase: 'error', busy: false, result: { success: false, bytes_written: 0, duration_ms: 0, error: msg }, activeNotifId: null })
      notif.update(notifId, { type: 'error', title: '擦除失败', message: msg, autoClose: true, autoCloseDelay: 5000 })
    }
  },

  doProgram: async () => {
    const uid = useProbeStore.getState().selectedUid
    const { filePath, eraseBefore } = get()
    if (!uid || !filePath) return
    const notif = useNotificationStore.getState()
    const notifId = notif.push({
      type: 'progress',
      title: '烧录固件',
      message: eraseBefore ? '擦除中...' : '编程中...',
      progress: 0,
    })
    set({ busy: true, phase: eraseBefore ? 'erasing' : 'programming', progress: 0, result: null, logs: [], activeNotifId: notifId })
    try {
      const result = await flashService.programFlash(uid, filePath, get().verifyAfter, get().resetAfter)
      set({ phase: result.success ? 'done' : 'error', busy: false, result, activeNotifId: null })
      if (result.success) {
        const speed = result.bytes_written > 0 && result.duration_ms > 0
          ? ` · ${(result.bytes_written / 1024 / (result.duration_ms / 1000)).toFixed(1)} KB/s`
          : ''
        notif.update(notifId, {
          type: 'success',
          title: '烧录成功',
          message: `写入 ${formatSize(result.bytes_written)} · 耗时 ${(result.duration_ms / 1000).toFixed(2)}s${speed}`,
          autoClose: true,
          autoCloseDelay: 5000,
        })
      } else {
        notif.update(notifId, {
          type: 'error',
          title: '烧录失败',
          message: result.error ?? '未知错误',
          autoClose: true,
          autoCloseDelay: 5000,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '烧录失败'
      set({ phase: 'error', busy: false, result: { success: false, bytes_written: 0, duration_ms: 0, error: msg }, activeNotifId: null })
      notif.update(notifId, { type: 'error', title: '烧录失败', message: msg, autoClose: true, autoCloseDelay: 5000 })
    }
  },

  doVerify: async () => {
    const uid = useProbeStore.getState().selectedUid
    const { filePath } = get()
    if (!uid || !filePath) return
    const notif = useNotificationStore.getState()
    const notifId = notif.push({ type: 'progress', title: '校验 Flash', message: '正在校验...', progress: 0 })
    set({ busy: true, phase: 'verifying', progress: 0, result: null, logs: [], activeNotifId: notifId })
    try {
      const result = await flashService.verifyFlash(uid, filePath)
      set({ phase: result.success ? 'done' : 'error', busy: false, result, activeNotifId: null })
      if (result.success) {
        notif.update(notifId, { type: 'success', title: '校验通过', message: 'Flash 内容与文件一致', autoClose: true, autoCloseDelay: 3000 })
      } else {
        notif.update(notifId, { type: 'error', title: '校验失败', message: result.error ?? '内容不匹配', autoClose: true, autoCloseDelay: 5000 })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '校验失败'
      set({ phase: 'error', busy: false, result: { success: false, bytes_written: 0, duration_ms: 0, error: msg }, activeNotifId: null })
      notif.update(notifId, { type: 'error', title: '校验失败', message: msg, autoClose: true, autoCloseDelay: 5000 })
    }
  },

  doReset: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    const notif = useNotificationStore.getState()
    const notifId = notif.push({ type: 'progress', title: '复位目标', message: '正在复位...', progress: 0 })
    set({ busy: true, result: null, logs: [], activeNotifId: notifId })
    try {
      await flashService.resetTarget(uid, 'hw', true)
      set({ busy: false, activeNotifId: null })
      notif.update(notifId, { type: 'success', title: '复位完成', message: '目标已复位运行', autoClose: true, autoCloseDelay: 3000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '复位失败'
      set({ busy: false, activeNotifId: null })
      notif.update(notifId, { type: 'error', title: '复位失败', message: msg, autoClose: true, autoCloseDelay: 5000 })
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
    // 更新通知进度
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
    // 如果操作已经自己更新了通知（doProgram 等），这里不需要再更新
    // 但如果是被 WebSocket 主动推送的 complete（如后端超时），需要兜底
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
