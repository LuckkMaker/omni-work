import { create } from 'zustand'
import type { RttChannel } from '@/services/rtt.service'
import type { LogEvent } from '@shared/types'

export type DisplayMode = 'text' | 'hex'

/** RTT 输入模式：bar=InputBar 发送，terminal=终端直接输入（支持 Tab/方向键/Ctrl 组合键等） */
export type InputMode = 'bar' | 'terminal'

/** Tab 模式 */
export type TabMode = 'all' | 'single'

/** RTT 终端 Tab */
export interface RttTab {
  /** Tab 唯一 ID */
  id: string
  /** Tab 标题 */
  title: string
  /** 模式：all=所有通道，single=单通道 */
  mode: TabMode
  /** 通道索引（single 模式有效） */
  channel?: number
  /** 接收数据缓冲（Uint8Array 数组，用于保存到文件） */
  dataBuffer: Uint8Array[]
  /** 缓冲总大小（字节） */
  bufferSize: number
  /** 累计接收字节数 */
  bytesReceived: number
}

/** 生成唯一 Tab ID */
function genTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 缓冲大小上限（10MB） */
const MAX_BUFFER_SIZE = 10 * 1024 * 1024

// ── 输入模式偏好持久化 ──────────────────────────
const INPUT_MODE_KEY = 'rtt:inputMode'
const LOCAL_ECHO_KEY = 'rtt:localEcho'

function loadInputMode(): InputMode {
  try {
    const v = localStorage.getItem(INPUT_MODE_KEY)
    if (v === 'terminal' || v === 'bar') return v
  } catch { /* ignore */ }
  return 'bar'
}

function loadLocalEcho(): boolean {
  try {
    const v = localStorage.getItem(LOCAL_ECHO_KEY)
    if (v !== null) return v === '1'
  } catch { /* ignore */ }
  return true
}

interface RttState {
  /** RTT 是否正在运行 */
  running: boolean
  /** 是否正在启动中 */
  starting: boolean
  /** up channels（target -> host） */
  upChannels: RttChannel[]
  /** down channels（host -> target） */
  downChannels: RttChannel[]
  /** 选中的 up channel（兼容旧逻辑，用于启动时指定） */
  selectedUpChannel: number
  /** 选中的 down channel（用于发送） */
  selectedDownChannel: number
  /** 接收到的字节数（总计） */
  bytesReceived: number
  /** 发送的字节数 */
  bytesSent: number
  /** 错误信息 */
  error: string | null
  /** 显示模式 */
  displayMode: DisplayMode
  /** 输入模式：bar=InputBar 发送，terminal=终端直接输入 */
  inputMode: InputMode
  /** 本地回显（仅 terminal 输入模式生效；下位机不回显时使用） */
  localEcho: boolean
  /** 是否自动换行 */
  autoWrap: boolean
  /** 控制块搜索地址（hex 字符串，空则自动检测） */
  searchAddress: string
  /** 控制块搜索范围（hex 字符串，空则自动） */
  searchSize: string
  /** RTT 日志 */
  logs: LogEvent[]

  /** 多终端 Tab 列表 */
  tabs: RttTab[]
  /** 当前激活的 Tab ID */
  activeTabId: string

  setRunning: (running: boolean) => void
  setStarting: (starting: boolean) => void
  setChannels: (up: RttChannel[], down: RttChannel[]) => void
  setSelectedUpChannel: (ch: number) => void
  setSelectedDownChannel: (ch: number) => void
  addBytesReceived: (n: number) => void
  addBytesSent: (n: number) => void
  setError: (error: string | null) => void
  setDisplayMode: (mode: DisplayMode) => void
  setInputMode: (mode: InputMode) => void
  setLocalEcho: (on: boolean) => void
  setAutoWrap: (autoWrap: boolean) => void
  setSearchAddress: (addr: string) => void
  setSearchSize: (size: string) => void
  addLog: (log: LogEvent) => void
  clearLogs: () => void
  reset: () => void

  /** 向指定 Tab 追加数据 */
  appendTabData: (tabId: string, data: Uint8Array) => void
  /** 清空指定 Tab 的数据缓冲 */
  clearTabData: (tabId: string) => void
  /** 获取指定 Tab 的数据缓冲（拼接为单个 Uint8Array） */
  getTabData: (tabId: string) => Uint8Array
  /** 添加新 Tab（单通道模式） */
  addTab: (channel: number, channelName?: string) => string
  /** 关闭 Tab */
  removeTab: (tabId: string) => void
  /** 设置激活 Tab */
  setActiveTab: (tabId: string) => void
  /** 重置 Tab（启动新会话时） */
  resetTabs: () => void
}

/** 创建初始 All Channel Tab */
function createAllChannelTab(): RttTab {
  return {
    id: 'all',
    title: 'All Channel',
    mode: 'all',
    dataBuffer: [],
    bufferSize: 0,
    bytesReceived: 0,
  }
}

export const useRttStore = create<RttState>((set, get) => ({
  running: false,
  starting: false,
  upChannels: [],
  downChannels: [],
  selectedUpChannel: 0,
  selectedDownChannel: 0,
  bytesReceived: 0,
  bytesSent: 0,
  error: null,
  displayMode: 'text',
  inputMode: loadInputMode(),
  localEcho: loadLocalEcho(),
  autoWrap: true,
  searchAddress: '',
  searchSize: '',
  logs: [],

  tabs: [createAllChannelTab()],
  activeTabId: 'all',

  setRunning: (running) => set({ running }),
  setStarting: (starting) => set({ starting }),
  setChannels: (up, down) => set({ upChannels: up, downChannels: down }),
  setSelectedUpChannel: (ch) => set({ selectedUpChannel: ch }),
  setSelectedDownChannel: (ch) => set({ selectedDownChannel: ch }),
  addBytesReceived: (n) => set((s) => ({ bytesReceived: s.bytesReceived + n })),
  addBytesSent: (n) => set((s) => ({ bytesSent: s.bytesSent + n })),
  setError: (error) => set({ error }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setInputMode: (mode) => {
    try { localStorage.setItem(INPUT_MODE_KEY, mode) } catch { /* ignore */ }
    set({ inputMode: mode })
  },
  setLocalEcho: (on) => {
    try { localStorage.setItem(LOCAL_ECHO_KEY, on ? '1' : '0') } catch { /* ignore */ }
    set({ localEcho: on })
  },
  setAutoWrap: (autoWrap) => set({ autoWrap }),
  setSearchAddress: (addr) => set({ searchAddress: addr }),
  setSearchSize: (size) => set({ searchSize: size }),
  addLog: (log) => set((s) => ({ logs: [...s.logs, log].slice(-500) })),
  clearLogs: () => set({ logs: [] }),
  reset: () =>
    set({
      running: false,
      starting: false,
      upChannels: [],
      downChannels: [],
      selectedUpChannel: 0,
      selectedDownChannel: 0,
      bytesReceived: 0,
      bytesSent: 0,
      error: null,
      tabs: [createAllChannelTab()],
      activeTabId: 'all',
    }),

  appendTabData: (tabId, data) =>
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (tab.id !== tabId) return tab
        const newBuffer = [...tab.dataBuffer, data]
        let newSize = tab.bufferSize + data.length
        // 超限时移除旧数据
        while (newSize > MAX_BUFFER_SIZE && newBuffer.length > 1) {
          const removed = newBuffer.shift()!
          newSize -= removed.length
        }
        return {
          ...tab,
          dataBuffer: newBuffer,
          bufferSize: newSize,
          bytesReceived: tab.bytesReceived + data.length,
        }
      }),
    })),

  clearTabData: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, dataBuffer: [], bufferSize: 0, bytesReceived: 0 }
          : tab
      ),
    })),

  getTabData: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return new Uint8Array(0)
    const total = tab.dataBuffer.reduce((sum, b) => sum + b.length, 0)
    const result = new Uint8Array(total)
    let offset = 0
    for (const buf of tab.dataBuffer) {
      result.set(buf, offset)
      offset += buf.length
    }
    return result
  },

  addTab: (channel, channelName) => {
    const id = genTabId()
    const title = `Ch${channel}${channelName ? ` - ${channelName}` : ''}`
    set((s) => ({
      tabs: [...s.tabs, {
        id,
        title,
        mode: 'single' as const,
        channel,
        dataBuffer: [],
        bufferSize: 0,
        bytesReceived: 0,
      }],
      activeTabId: id,
    }))
    return id
  },

  removeTab: (tabId) =>
    set((s) => {
      // 不允许关闭 All Channel tab
      if (tabId === 'all') return s
      const newTabs = s.tabs.filter((t) => t.id !== tabId)
      const newActive = s.activeTabId === tabId ? 'all' : s.activeTabId
      return { tabs: newTabs, activeTabId: newActive }
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  resetTabs: () => set({ tabs: [createAllChannelTab()], activeTabId: 'all' }),
}))
