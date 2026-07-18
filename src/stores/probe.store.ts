import { create } from 'zustand'
import type { ProbeWithState, TargetInfo, DeviceInfo } from '@shared/types'
import * as probeService from '@/services/probe.service'
import { listTargets } from '@/services/target.service'
import { listDevices } from '@/services/device.service'

/** 调试接口类型 */
export type DebugInterface = 'swd' | 'jtag'

/** 速度选项 (Hz) */
export const SPEED_OPTIONS = [
  { label: '100 kHz', value: 100_000 },
  { label: '500 kHz', value: 500_000 },
  { label: '1 MHz', value: 1_000_000 },
  { label: '2 MHz', value: 2_000_000 },
  { label: '4 MHz', value: 4_000_000 },
  { label: '8 MHz', value: 8_000_000 },
  { label: '10 MHz', value: 10_000_000 },
]

interface ProbeStore {
  // ── 状态 ──────────────────────────────
  /** 仿真器列表（含连接状态） */
  probes: ProbeWithState[]
  /** 当前选中的仿真器 UID */
  selectedUid: string | null
  /** pyOCD 支持的目标型号列表 */
  targetList: string[]
  /** 设备目录（来自 device_info.json） */
  deviceList: DeviceInfo[]
  /** 加载仿真器中 */
  loadingProbes: boolean
  /** 连接/断开操作中 */
  connecting: boolean
  /** 错误信息 */
  error: string | null

  // ── 连接前配置 ────────────────────────
  /** 连接前选择的目标设备 part_number */
  pendingTarget: string | null
  /** 连接前选择的调试接口 */
  pendingInterface: DebugInterface
  /** 连接前选择的时钟速度 (Hz) */
  pendingSpeed: number
  /** Flash 配置：选中的扇区索引集合（确定后保存） */
  selectedSectorIndices: Set<number>

  // ── 派生获取器 ────────────────────────
  /** 获取当前选中的仿真器 */
  getSelectedProbe: () => ProbeWithState | null
  /** 获取当前选中仿真器的目标信息 */
  getSelectedTarget: () => TargetInfo | null
  /** 根据 part_number 查找设备目录信息 */
  getDeviceInfo: (partNumber: string) => DeviceInfo | undefined

  // ── 操作 ──────────────────────────────
  /** 拉取仿真器列表 */
  fetchProbes: () => Promise<void>
  /** 拉取支持的 MCU 型号列表 */
  fetchTargets: () => Promise<void>
  /** 拉取设备目录 */
  fetchDevices: () => Promise<void>
  /** 选中仿真器 */
  selectProbe: (uid: string | null) => void
  /** 设置连接前配置 */
  setPendingTarget: (partNumber: string | null) => void
  setPendingInterface: (iface: DebugInterface) => void
  setPendingSpeed: (speed: number) => void
  /** 保存 Flash 配置中选中的扇区索引 */
  setSelectedSectorIndices: (indices: Set<number>) => void
  /** 连接仿真器 */
  connectProbe: (uid: string) => Promise<void>
  /** 断开仿真器 */
  disconnectProbe: (uid: string) => Promise<void>
  /** 手动设置目标芯片 */
  setTarget: (partNumber: string) => Promise<void>
  /** 清除错误 */
  clearError: () => void

  // ── WebSocket 事件处理 ────────────────
  /** 仿真器列表更新（热插拔 / 手动刷新） */
  onProbeList: (probes: ProbeWithState[]) => void
  /** 仿真器已连接 */
  onProbeConnected: (uid: string, target: TargetInfo | null) => void
  /** 仿真器已断开 */
  onProbeDisconnected: (uid: string) => void
}

export const useProbeStore = create<ProbeStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────
  probes: [],
  selectedUid: null,
  targetList: [],
  deviceList: [],
  loadingProbes: false,
  connecting: false,
  error: null,

  // 连接前默认配置
  pendingTarget: null,
  pendingInterface: 'swd',
  pendingSpeed: 1_000_000,
  selectedSectorIndices: new Set(),

  // ── 派生获取器 ────────────────────────
  getSelectedProbe: () => {
    const { probes, selectedUid } = get()
    return probes.find((p) => p.uid === selectedUid) ?? null
  },

  getSelectedTarget: () => {
    const probe = get().getSelectedProbe()
    return probe?.target ?? null
  },

  getDeviceInfo: (partNumber: string) => {
    return get().deviceList.find((d) => d.part_number === partNumber)
  },

  // ── 操作 ──────────────────────────────
  fetchProbes: async () => {
    set({ loadingProbes: true, error: null })
    try {
      const probes = await probeService.listProbes()
      // 未选中仿真器时，默认选中第一个
      const currentUid = get().selectedUid
      const autoUid = currentUid && probes.some((p) => p.uid === currentUid)
        ? currentUid
        : probes.length > 0 ? probes[0].uid : null
      set({ probes, selectedUid: autoUid, loadingProbes: false })
    } catch (err) {
      set({
        loadingProbes: false,
        error: err instanceof Error ? err.message : '获取仿真器列表失败',
      })
    }
  },

  fetchTargets: async () => {
    try {
      const targets = await listTargets()
      set({ targetList: targets })
    } catch (err) {
      console.error('[probe.store] fetchTargets failed:', err)
    }
  },

  fetchDevices: async () => {
    try {
      const devices = await listDevices()
      set({ deviceList: devices })
    } catch (err) {
      console.error('[probe.store] fetchDevices failed:', err)
    }
  },

  selectProbe: (uid) => set({ selectedUid: uid }),

  setPendingTarget: (partNumber) => set({ pendingTarget: partNumber }),
  setPendingInterface: (iface) => set({ pendingInterface: iface }),
  setPendingSpeed: (speed) => set({ pendingSpeed: speed }),
  setSelectedSectorIndices: (indices) => set({ selectedSectorIndices: new Set(indices) }),

  connectProbe: async (uid) => {
    const { pendingTarget, pendingInterface, pendingSpeed } = get()
    set({ connecting: true, error: null })
    // 先将状态标记为 connecting
    set((state) => ({
      probes: state.probes.map((p) =>
        p.uid === uid ? { ...p, state: 'connecting' as const } : p
      ),
    }))
    try {
      const result = await probeService.connectProbe(uid, {
        target: pendingTarget ?? undefined,
        interface: pendingInterface,
        speed: pendingSpeed,
      })
      // 连接成功，更新仿真器状态和目标信息
      set((state) => ({
        probes: state.probes.map((p) =>
          p.uid === uid
            ? { ...p, state: 'connected' as const, target: result.target }
            : p
        ),
        connecting: false,
      }))
      // 连接成功后，如果列表为空则重新加载
      if (get().targetList.length === 0) {
        get().fetchTargets()
      }
      if (get().deviceList.length === 0) {
        get().fetchDevices()
      }
    } catch (err) {
      set((state) => ({
        probes: state.probes.map((p) =>
          p.uid === uid ? { ...p, state: 'error' as const } : p
        ),
        connecting: false,
        error: err instanceof Error ? err.message : '连接仿真器失败',
      }))
    }
  },

  disconnectProbe: async (uid) => {
    set({ connecting: true, error: null })
    try {
      await probeService.disconnectProbe(uid)
      set((state) => ({
        probes: state.probes.map((p) =>
          p.uid === uid
            ? { ...p, state: 'disconnected' as const, target: null }
            : p
        ),
        connecting: false,
      }))
    } catch (err) {
      set({
        connecting: false,
        error: err instanceof Error ? err.message : '断开仿真器失败',
      })
    }
  },

  setTarget: async (partNumber) => {
    const { selectedUid } = get()
    if (!selectedUid) return
    set({ connecting: true, error: null })
    try {
      const result = await probeService.setTarget(selectedUid, partNumber)
      set((state) => ({
        probes: state.probes.map((p) =>
          p.uid === selectedUid
            ? { ...p, state: 'connected' as const, target: result.target }
            : p
        ),
        connecting: false,
      }))
    } catch (err) {
      set({
        connecting: false,
        error: err instanceof Error ? err.message : '设置目标芯片失败',
      })
    }
  },

  clearError: () => set({ error: null }),

  // ── WebSocket 事件处理 ────────────────
  onProbeList: (probes) => {
    set((state) => ({
      probes,
      // 保持已选中的仿真器（如果仍然存在）
      selectedUid:
        state.selectedUid && probes.some((p) => p.uid === state.selectedUid)
          ? state.selectedUid
          : probes.length > 0
            ? probes[0].uid
            : null,
    }))
  },

  onProbeConnected: (uid, target) => {
    set((state) => ({
      probes: state.probes.map((p) =>
        p.uid === uid
          ? { ...p, state: 'connected' as const, target }
          : p
      ),
    }))
  },

  onProbeDisconnected: (uid) => {
    set((state) => ({
      probes: state.probes.map((p) =>
        p.uid === uid
          ? { ...p, state: 'disconnected' as const, target: null }
          : p
      ),
    }))
  },
}))
