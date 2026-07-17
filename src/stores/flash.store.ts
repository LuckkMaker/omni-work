import { create } from 'zustand'
import type { FirmwareFileInfo, FlashProgressEvent, LogEvent, FlashResult } from '@shared/types'
import * as flashService from '@/services/flash.service'
import { parseFile, readFile } from '@/services/file.service'
import { useProbeStore } from './probe.store'
import { useNotificationStore } from './notification.store'

// ── Tab 数据模型 ──────────────────────────
export interface FlashTab {
  id: string
  type: 'device' | 'file' | 'compare'
  title: string
  filePath?: string
  baseAddress: number
  data: string | null         // base64 encoded
  size: number
  format?: string
  loading: boolean
  // compare tab 专用
  rightData?: string | null   // base64 encoded right side data
  rightBaseAddress?: number
  rightTitle?: string
  leftTitle?: string
}

type FlashPhase = 'idle' | 'erasing' | 'programming' | 'verifying' | 'reading' | 'done' | 'error'

let tabIdCounter = 0
function genId(): string {
  return `tab-${++tabIdCounter}`
}

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatHex(addr: number): string {
  return `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`
}

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

interface FlashStore {
  // ── Tab 状态 ──────────────────────────
  tabs: FlashTab[]
  activeTabId: string | null

  // ── 弹窗 ──────────────────────────────
  showBinAddrDialog: boolean
  pendingBinPath: string | null
  showEraseSectorsDialog: boolean
  showReadBackDialog: boolean
  showCompareDialog: boolean
  /** Read Back 对话框的初始模式 */
  readBackMode: 'chip' | 'sectors' | 'range'

  // ── 烧录状态 ──────────────────────────
  phase: FlashPhase
  progress: number
  busy: boolean
  result: FlashResult | null
  activeNotifId: string | null

  // ── 烧录选项 ──────────────────────────
  eraseBefore: boolean
  verifyAfter: boolean
  resetAfter: boolean

  // ── 日志 ──────────────────────────────
  logs: LogEvent[]

  // ── Tab 操作 ──────────────────────────
  openFileTab: () => Promise<void>
  addDeviceTab: () => void
  closeTab: (id: string) => void
  selectTab: (id: string) => void
  getActiveTab: () => FlashTab | null
  updateTab: (id: string, patch: Partial<FlashTab>) => void
  saveTabAs: (id: string) => Promise<void>

  // ── 弹窗控制 ──────────────────────────
  setShowBinAddrDialog: (show: boolean) => void
  setPendingBinPath: (path: string | null) => void
  confirmBinAddress: (address: number) => Promise<void>
  setShowEraseSectorsDialog: (show: boolean) => void
  setShowReadBackDialog: (show: boolean) => void
  setShowCompareDialog: (show: boolean) => void
  setReadBackMode: (mode: 'chip' | 'sectors' | 'range') => void

  // ── Flash 操作 ────────────────────────
  doCheckBlank: () => Promise<void>
  doEraseChip: () => Promise<void>
  doEraseSectors: (address: number, size: number) => Promise<void>
  doProgram: (verify?: boolean) => Promise<void>
  doVerify: () => Promise<void>
  doReadBack: (mode: 'chip' | 'range', address?: number, size?: number) => Promise<void>
  doStartApp: () => Promise<void>
  doReset: () => Promise<void>
  cancelOperation: () => Promise<void>
  doCompare: (filePath: string) => Promise<void>

  setOption: (key: 'eraseBefore' | 'verifyAfter' | 'resetAfter', value: boolean) => void

  // ── WebSocket 事件 ────────────────────
  onProgress: (data: FlashProgressEvent) => void
  onLog: (data: LogEvent) => void
  onComplete: (data: FlashResult) => void
  reset: () => void
}

export const useFlashStore = create<FlashStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────
  tabs: [
    { id: genId(), type: 'device', title: 'Device Memory', baseAddress: 0x08000000, data: null, size: 0, loading: false },
  ],
  activeTabId: null,

  showBinAddrDialog: false,
  pendingBinPath: null,
  showEraseSectorsDialog: false,
  showReadBackDialog: false,
  showCompareDialog: false,
  readBackMode: 'chip',

  phase: 'idle',
  progress: 0,
  busy: false,
  result: null,
  activeNotifId: null,

  eraseBefore: true,
  verifyAfter: true,
  resetAfter: true,

  logs: [],

  // ── Tab 操作 ──────────────────────────
  openFileTab: async () => {
    const path = await window.electron.openFileDialog()
    if (!path) return

    const isBin = path.toLowerCase().endsWith('.bin')
    if (isBin) {
      set({ pendingBinPath: path, showBinAddrDialog: true })
      return
    }

    // 非 bin 文件直接加载
    const id = genId()
    const fileName = getFileName(path)
    set((state) => ({
      tabs: [...state.tabs, { id, type: 'file', title: fileName, filePath: path, baseAddress: 0, data: null, size: 0, loading: true }],
      activeTabId: id,
    }))

    try {
      const [info, data] = await Promise.all([parseFile(path), readFile(path)])
      get().updateTab(id, { data: data.data, baseAddress: data.base_address, size: data.size, format: info.format, loading: false })
    } catch (err) {
      console.error('[flash.store] openFileTab failed:', err)
      get().updateTab(id, { loading: false })
    }
  },

  addDeviceTab: () => {
    const id = genId()
    const deviceTabs = get().tabs.filter((t) => t.type === 'device').length
    set((state) => ({
      tabs: [...state.tabs, { id, type: 'device', title: `Device Memory ${deviceTabs > 0 ? deviceTabs + 1 : ''}`.trim(), baseAddress: 0x08000000, data: null, size: 0, loading: false }],
      activeTabId: id,
    }))
  },

  closeTab: (id) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === id)
      // 第一个 Device Memory tab 不可关闭
      if (tab?.type === 'device' && state.tabs.indexOf(tab) === 0) return state

      const newTabs = state.tabs.filter((t) => t.id !== id)
      let newActive = state.activeTabId
      if (state.activeTabId === id) {
        newActive = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null
      }
      return { tabs: newTabs, activeTabId: newActive }
    })
  },

  selectTab: (id) => set({ activeTabId: id }),

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId) ?? null
  },

  updateTab: (id, patch) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  },

  saveTabAs: async (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab?.data) return
    const defaultName = `${tab.title.replace(/\s+/g, '_')}.bin`
    const savePath = await window.electron?.saveFileDialog?.(defaultName)
    if (!savePath) return

    // base64 → blob → 写文件通过 Electron
    const binary = atob(tab.data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    // 使用 fetch 写入文件（通过 data URL 下载到临时位置）
    // 更好的方式：通过 IPC 写文件
    const { api } = await import('@/services/api')
    const client = await api()
    await client.post('/api/files/save', { file_path: savePath, data: tab.data })
    useNotificationStore.getState().push({ type: 'success', title: '另存为', message: `已保存到 ${getFileName(savePath)}`, autoClose: true, autoCloseDelay: 3000 })
  },

  // ── 弹窗控制 ──────────────────────────
  setShowBinAddrDialog: (show) => set({ showBinAddrDialog: show }),
  setPendingBinPath: (path) => set({ pendingBinPath: path }),

  confirmBinAddress: async (address) => {
    const path = get().pendingBinPath
    set({ showBinAddrDialog: false, pendingBinPath: null })
    if (!path) return

    const id = genId()
    const fileName = getFileName(path)
    set((state) => ({
      tabs: [...state.tabs, { id, type: 'file', title: fileName, filePath: path, baseAddress: address, data: null, size: 0, loading: true }],
      activeTabId: id,
    }))

    try {
      const [info, data] = await Promise.all([parseFile(path), readFile(path, address)])
      get().updateTab(id, { data: data.data, baseAddress: address, size: data.size, format: info.format, loading: false })
    } catch (err) {
      console.error('[flash.store] confirmBinAddress failed:', err)
      get().updateTab(id, { loading: false })
    }
  },

  setShowEraseSectorsDialog: (show) => set({ showEraseSectorsDialog: show }),
  setShowReadBackDialog: (show) => set({ showReadBackDialog: show }),
  setShowCompareDialog: (show) => set({ showCompareDialog: show }),
  setReadBackMode: (mode) => set({ readBackMode: mode }),

  // ── Flash 操作 ────────────────────────
  doCheckBlank: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    await wrapOperation(set, get, '检查空白', '正在检查...', async () => {
      const result = await flashService.checkBlank(uid)
      if (result.success && result.is_blank !== undefined) {
        return { success: true, duration_ms: result.duration_ms, error: result.is_blank ? undefined : `非空白，首个非0xFF地址: ${result.first_nonblank_addr ? formatHex(result.first_nonblank_addr) : 'N/A'}` }
      }
      return { success: false, error: result.error ?? '检查失败' }
    })
    const state = get()
    if (state.result?.error?.includes('非空白')) {
      useNotificationStore.getState().push({ type: 'warning', title: '检查空白', message: state.result.error, autoClose: true, autoCloseDelay: 5000 })
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
    }, () => '扇区擦除完成')
  },

  doProgram: async (verify) => {
    const uid = useProbeStore.getState().selectedUid
    const tab = get().getActiveTab()
    if (!uid || !tab || tab.type !== 'file' || !tab.filePath) return
    const shouldVerify = verify ?? get().verifyAfter
    const { eraseBefore, resetAfter } = get()
    const title = shouldVerify ? '编程并校验' : '编程'
    await wrapOperation(set, get, title, eraseBefore ? '擦除中...' : '编程中...', async () => {
      return await flashService.programFlash(uid, tab.filePath, shouldVerify, resetAfter, tab.baseAddress)
    }, (r) => {
      const speed = r.bytes_written > 0 && r.duration_ms > 0 ? ` · ${(r.bytes_written / 1024 / (r.duration_ms / 1000)).toFixed(1)} KB/s` : ''
      return `写入 ${formatSize(r.bytes_written)} · 耗时 ${(r.duration_ms / 1000).toFixed(2)}s${speed}`
    })
  },

  doVerify: async () => {
    const uid = useProbeStore.getState().selectedUid
    const tab = get().getActiveTab()
    if (!uid || !tab || tab.type !== 'file' || !tab.filePath) return
    await wrapOperation(set, get, '校验', '正在校验...', async () => {
      return await flashService.verifyFlash(uid, tab.filePath)
    }, () => 'Flash 内容与文件一致')
  },

  doReadBack: async (mode, address, size) => {
    const uid = useProbeStore.getState().selectedUid
    const tab = get().getActiveTab()
    if (!uid || !tab) return
    set({ showReadBackDialog: false })
    tab.loading = true
    get().updateTab(tab.id, { loading: true })
    await wrapOperation(set, get, '读回', '正在读取 Flash...', async () => {
      const result = await flashService.readBack(uid, mode, address ?? 0, size ?? 0)
      if (result.success && result.base64_data) {
        // 数据直接存入当前 tab
        get().updateTab(tab.id, {
          data: result.base64_data,
          baseAddress: result.base_address ?? 0,
          size: result.bytes_read ?? 0,
          loading: false,
          format: 'bin',
          diffData: null,
        })
        return { success: true, duration_ms: result.duration_ms, bytes_written: result.bytes_read ?? 0 }
      }
      get().updateTab(tab.id, { loading: false })
      return { success: false, error: result.error ?? '读回失败' }
    }, (r) => `读取 ${formatSize(r.bytes_written)} 到 ${tab.title}`)
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

  cancelOperation: async () => {
    const uid = useProbeStore.getState().selectedUid
    if (!uid) return
    try {
      await flashService.cancelOperation(uid)
    } catch (err) {
      console.error('[flash.store] cancel failed:', err)
    }
    // 更新 UI 状态
    set({ busy: false, phase: 'idle', progress: 0 })
    const { activeNotifId } = get()
    if (activeNotifId) {
      const notif = useNotificationStore.getState()
      notif.update(activeNotifId, {
        type: 'warning',
        title: '操作已取消',
        message: '用户取消了当前操作',
        autoClose: true,
        autoCloseDelay: 3000,
      })
      set({ activeNotifId: null })
    }
  },

  doCompare: async (filePath) => {
    const tab = get().getActiveTab()
    if (!tab?.data) return
    set({ showCompareDialog: false })

    const notif = useNotificationStore.getState()
    const notifId = notif.push({ type: 'progress', title: '比较', message: '正在加载参考文件...' })

    try {
      const isBin = filePath.toLowerCase().endsWith('.bin')
      let refBaseAddr = tab.baseAddress
      let refData: string

      if (isBin) {
        const data = await readFile(filePath, tab.baseAddress)
        refData = data.data
        refBaseAddr = data.base_address
      } else {
        const data = await readFile(filePath)
        refData = data.data
        refBaseAddr = data.base_address
      }

      // 创建新 compare tab
      const id = genId()
      const refFileName = getFileName(filePath)
      const leftTitle = tab.title
      const rightTitle = refFileName
      const compareTitle = `Compare: ${leftTitle} vs ${rightTitle}`

      set((state) => ({
        tabs: [...state.tabs, {
          id,
          type: 'compare' as const,
          title: compareTitle,
          baseAddress: tab.baseAddress,
          data: tab.data,
          size: tab.size,
          loading: false,
          rightData: refData,
          rightBaseAddress: refBaseAddr,
          leftTitle,
          rightTitle,
        }],
        activeTabId: id,
      }))

      // 统计差异
      const tabBytes = atob(tab.data)
      const refBytes = atob(refData)
      const minLen = Math.min(tabBytes.length, refBytes.length)
      let diffCount = 0
      for (let i = 0; i < minLen; i++) {
        if (tabBytes.charCodeAt(i) !== refBytes.charCodeAt(i)) diffCount++
      }
      diffCount += Math.abs(tabBytes.length - refBytes.length)

      notif.update(notifId, {
        type: diffCount === 0 ? 'success' : 'warning',
        title: '比较完成',
        message: diffCount === 0
          ? `完全匹配 (${formatSize(minLen)})`
          : `${diffCount} 字节不同 (共 ${formatSize(minLen)})`,
        autoClose: true,
        autoCloseDelay: 5000,
      })
    } catch (err) {
      notif.update(notifId, { type: 'error', title: '比较失败', message: err instanceof Error ? err.message : '未知错误', autoClose: true, autoCloseDelay: 5000 })
    }
  },

  setOption: (key, value) => set({ [key]: value } as Partial<FlashStore>),

  // ── WebSocket 事件 ────────────────────
  onProgress: (data) => {
    const phaseMap: Record<string, FlashPhase> = { erase: 'erasing', program: 'programming', verify: 'verifying' }
    set({ phase: phaseMap[data.phase] ?? get().phase, progress: data.percent })
    const { activeNotifId } = get()
    if (activeNotifId) {
      const msgMap: Record<string, string> = { erase: '擦除中...', program: '编程中...', verify: '校验中...' }
      useNotificationStore.getState().update(activeNotifId, {
        progress: data.percent,
        message: data.total > 0 ? `${msgMap[data.phase] ?? ''} ${formatSize(data.current)} / ${formatSize(data.total)}` : (msgMap[data.phase] ?? ''),
      })
    }
  },

  onLog: (data) => set((state) => ({ logs: [...state.logs, data] })),

  onComplete: (data) => {
    set({ phase: data.success ? 'done' : 'error', busy: false, result: data, progress: data.success ? 100 : get().progress })
    const { activeNotifId } = get()
    if (activeNotifId) {
      const notif = useNotificationStore.getState()
      if (data.success) {
        notif.update(activeNotifId, { type: 'success', title: '操作完成', message: `写入 ${formatSize(data.bytes_written)} · 耗时 ${(data.duration_ms / 1000).toFixed(2)}s`, autoClose: true, autoCloseDelay: 3000 })
      } else {
        notif.update(activeNotifId, { type: 'error', title: '操作失败', message: data.error ?? '未知错误', autoClose: true, autoCloseDelay: 5000 })
      }
      set({ activeNotifId: null })
    }
  },

  reset: () => set({ phase: 'idle', progress: 0, busy: false, result: null, logs: [], activeNotifId: null }),
}))

// ── 通用操作包装 ──────────────────────────
async function wrapOperation(
  set: (partial: Partial<FlashStore>) => void,
  get: () => FlashStore,
  title: string,
  startMsg: string,
  fn: () => Promise<{ success: boolean; error?: string; duration_ms?: number; bytes_written?: number }>,
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
      notif.update(notifId, { type: 'success', title: `${title}完成`, message: successMsg ? successMsg(result) : '操作成功', autoClose: true, autoCloseDelay: 5000 })
    } else {
      notif.update(notifId, { type: 'error', title: `${title}失败`, message: result.error ?? '未知错误', autoClose: true, autoCloseDelay: 5000 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : `${title}失败`
    set({ phase: 'error', busy: false, result: { success: false, bytes_written: 0, duration_ms: 0, error: msg }, activeNotifId: null })
    notif.update(notifId, { type: 'error', title: `${title}失败`, message: msg, autoClose: true, autoCloseDelay: 5000 })
  }
}

// 初始化：选中第一个 tab
useFlashStore.setState((state) => ({ activeTabId: state.tabs[0]?.id ?? null }))
