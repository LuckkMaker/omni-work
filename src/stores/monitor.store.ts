import { create } from 'zustand'
import type { MonitorVariable, SamplePoint } from '@/services/monitor.service'

/** 前端 ring buffer 容量上限（与后端对齐，5.2 阶段 uPlot 渲染用） */
const MAX_SAMPLES = 100000

/** 通道配置（5.2 阶段波形渲染用）
 *
 *  min/max：用户设定的 Y 轴量程（用于固定量程模式，区别于 Follow 自适应）。
 *  movingAverage：是否启用滑动平均滤波。
 *  yResolution：Y 轴分辨率（每个刻度代表的数值大小，用于网格标注）。
 *  这些字段属于通道显示配置，可随变量配置一起持久化（JSON）。
 */
export interface ChannelConfig {
  varId: string
  color: string
  visible: boolean
  yOffset: number
  yScale: number
  format: 'dec' | 'hex' | 'bin'
  /** Y 轴最小值（固定量程模式，null 表示跟随自适应） */
  min: number | null
  /** Y 轴最大值（固定量程模式，null 表示跟随自适应） */
  max: number | null
  /** 是否启用滑动平均 */
  movingAverage: boolean
  /** Y 轴分辨率（每格代表的数值，0 表示自动） */
  yResolution: number
}

interface MonitorState {
  // ── 运行状态 ──
  running: boolean
  paused: boolean
  starting: boolean
  error: string | null
  rateHz: number
  transport: 'swd' | 'rtt'

  // ── ELF ──
  elfPath: string | null
  elfLoaded: boolean
  symbolCount: number

  // ── 变量 ──
  variables: MonitorVariable[]

  // ── 采样数据（前端 ring buffer）──
  samples: SamplePoint[]
  totalSamples: number

  // ── 显示配置 ──
  follow: boolean
  channels: ChannelConfig[]

  // ── actions ──
  setRunning: (running: boolean) => void
  setPaused: (paused: boolean) => void
  setStarting: (starting: boolean) => void
  setError: (error: string | null) => void
  setRateHz: (hz: number) => void
  setTransport: (t: 'swd' | 'rtt') => void
  setFollow: (on: boolean) => void

  setElf: (path: string, count: number) => void
  setVariables: (vars: MonitorVariable[]) => void
  addVariable: (v: MonitorVariable) => void
  removeVariable: (id: string) => void
  updateVariable: (id: string, patch: Partial<MonitorVariable>) => void

  /** WS 推送采样点时调用，写入 ring buffer */
  appendSamples: (pts: SamplePoint[]) => void
  clearSamples: () => void

  /** 同步通道配置（变量增删时） */
  syncChannels: () => void
  setChannel: (varId: string, patch: Partial<ChannelConfig>) => void

  reset: () => void
}

/** 默认通道调色板（blue/green/orange/purple/cyan 循环） */
const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#dc2626', '#db2777', '#65a30d']

function makeChannel(varId: string, index: number): ChannelConfig {
  return {
    varId,
    color: PALETTE[index % PALETTE.length],
    visible: true,
    yOffset: 0,
    yScale: 1,
    format: 'dec',
    min: null,
    max: null,
    movingAverage: false,
    yResolution: 0,
  }
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  running: false,
  paused: false,
  starting: false,
  error: null,
  rateHz: 1000,
  transport: 'swd',

  elfPath: null,
  elfLoaded: false,
  symbolCount: 0,

  variables: [],

  samples: [],
  totalSamples: 0,

  follow: true,
  channels: [],

  setRunning: (running) => set({ running }),
  setPaused: (paused) => set({ paused }),
  setStarting: (starting) => set({ starting }),
  setError: (error) => set({ error }),
  setRateHz: (hz) => set({ rateHz: hz }),
  setTransport: (t) => set({ transport: t }),
  setFollow: (on) => set({ follow: on }),

  setElf: (path, count) => set({ elfPath: path, elfLoaded: true, symbolCount: count }),

  setVariables: (vars) => {
    set({ variables: vars })
    get().syncChannels()
  },

  addVariable: (v) => {
    set((s) => ({ variables: [...s.variables, v] }))
    get().syncChannels()
  },

  removeVariable: (id) => {
    set((s) => ({
      variables: s.variables.filter((v) => v.id !== id),
      channels: s.channels.filter((c) => c.varId !== id),
    }))
  },

  updateVariable: (id, patch) => set((s) => ({
    variables: s.variables.map((v) => (v.id === id ? { ...v, ...patch } : v)),
  })),

  appendSamples: (pts) => set((s) => {
    const next = [...s.samples, ...pts]
    // 超限时丢弃最旧数据（slice 比 shift 高效）
    if (next.length > MAX_SAMPLES) {
      next.splice(0, next.length - MAX_SAMPLES)
    }
    return { samples: next, totalSamples: s.totalSamples + pts.length }
  }),

  clearSamples: () => set({ samples: [], totalSamples: 0 }),

  syncChannels: () => set((s) => {
    const existing = new Map(s.channels.map((c) => [c.varId, c]))
    const channels = s.variables.map((v, i) =>
      existing.get(v.id) ?? makeChannel(v.id, i)
    )
    return { channels }
  }),

  setChannel: (varId, patch) => set((s) => ({
    channels: s.channels.map((c) => (c.varId === varId ? { ...c, ...patch } : c)),
  })),

  reset: () => set({
    running: false,
    paused: false,
    starting: false,
    error: null,
    samples: [],
    totalSamples: 0,
    channels: [],
  }),
}))
