import { create } from 'zustand'
import type { RttChannel } from '@/services/rtt.service'
import type { LogEvent } from '@shared/types'

export type DisplayMode = 'text' | 'hex'

interface RttState {
  /** RTT 是否正在运行 */
  running: boolean
  /** 是否正在启动中 */
  starting: boolean
  /** up channels（target -> host） */
  upChannels: RttChannel[]
  /** down channels（host -> target） */
  downChannels: RttChannel[]
  /** 选中的 up channel */
  selectedUpChannel: number
  /** 选中的 down channel */
  selectedDownChannel: number
  /** 接收到的字节数 */
  bytesReceived: number
  /** 发送的字节数 */
  bytesSent: number
  /** 错误信息 */
  error: string | null
  /** 显示模式 */
  displayMode: DisplayMode
  /** 是否自动换行 */
  autoWrap: boolean
  /** 控制块搜索地址（hex 字符串，空则自动检测） */
  searchAddress: string
  /** 控制块搜索范围（hex 字符串，空则自动） */
  searchSize: string
  /** RTT 日志 */
  logs: LogEvent[]

  setRunning: (running: boolean) => void
  setStarting: (starting: boolean) => void
  setChannels: (up: RttChannel[], down: RttChannel[]) => void
  setSelectedUpChannel: (ch: number) => void
  setSelectedDownChannel: (ch: number) => void
  addBytesReceived: (n: number) => void
  addBytesSent: (n: number) => void
  setError: (error: string | null) => void
  setDisplayMode: (mode: DisplayMode) => void
  setAutoWrap: (autoWrap: boolean) => void
  setSearchAddress: (addr: string) => void
  setSearchSize: (size: string) => void
  addLog: (log: LogEvent) => void
  clearLogs: () => void
  reset: () => void
}

export const useRttStore = create<RttState>((set) => ({
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
  autoWrap: true,
  searchAddress: '',
  searchSize: '',
  logs: [],

  setRunning: (running) => set({ running }),
  setStarting: (starting) => set({ starting }),
  setChannels: (up, down) => set({ upChannels: up, downChannels: down }),
  setSelectedUpChannel: (ch) => set({ selectedUpChannel: ch }),
  setSelectedDownChannel: (ch) => set({ selectedDownChannel: ch }),
  addBytesReceived: (n) => set((s) => ({ bytesReceived: s.bytesReceived + n })),
  addBytesSent: (n) => set((s) => ({ bytesSent: s.bytesSent + n })),
  setError: (error) => set({ error }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
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
    }),
}))
