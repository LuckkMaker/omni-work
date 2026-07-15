import { create } from 'zustand'
import type { ProbeWithState, TargetInfo } from '@shared/types'
import * as probeService from '@/services/probe.service'
import { listTargets } from '@/services/target.service'

interface ProbeStore {
  // ── 状态 ──────────────────────────────
  /** 探针列表（含连接状态） */
  probes: ProbeWithState[]
  /** 当前选中的探针 UID */
  selectedUid: string | null
  /** 所有支持的 MCU 型号列表 */
  targetList: string[]
  /** 加载探针中 */
  loadingProbes: boolean
  /** 连接/断开操作中 */
  connecting: boolean
  /** 错误信息 */
  error: string | null

  // ── 派生获取器 ────────────────────────
  /** 获取当前选中的探针 */
  getSelectedProbe: () => ProbeWithState | null
  /** 获取当前选中探针的目标信息 */
  getSelectedTarget: () => TargetInfo | null

  // ── 操作 ──────────────────────────────
  /** 拉取探针列表 */
  fetchProbes: () => Promise<void>
  /** 拉取支持的 MCU 型号列表 */
  fetchTargets: () => Promise<void>
  /** 选中探针 */
  selectProbe: (uid: string | null) => void
  /** 连接探针 */
  connectProbe: (uid: string) => Promise<void>
  /** 断开探针 */
  disconnectProbe: (uid: string) => Promise<void>
  /** 手动设置目标芯片 */
  setTarget: (partNumber: string) => Promise<void>
  /** 清除错误 */
  clearError: () => void

  // ── WebSocket 事件处理 ────────────────
  /** 探针列表更新（热插拔 / 手动刷新） */
  onProbeList: (probes: ProbeWithState[]) => void
  /** 探针已连接 */
  onProbeConnected: (uid: string, target: TargetInfo | null) => void
  /** 探针已断开 */
  onProbeDisconnected: (uid: string) => void
}

export const useProbeStore = create<ProbeStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────
  probes: [],
  selectedUid: null,
  targetList: [],
  loadingProbes: false,
  connecting: false,
  error: null,

  // ── 派生获取器 ────────────────────────
  getSelectedProbe: () => {
    const { probes, selectedUid } = get()
    return probes.find((p) => p.uid === selectedUid) ?? null
  },

  getSelectedTarget: () => {
    const probe = get().getSelectedProbe()
    return probe?.target ?? null
  },

  // ── 操作 ──────────────────────────────
  fetchProbes: async () => {
    set({ loadingProbes: true, error: null })
    try {
      const probes = await probeService.listProbes()
      set({ probes, loadingProbes: false })
    } catch (err) {
      set({
        loadingProbes: false,
        error: err instanceof Error ? err.message : '获取探针列表失败',
      })
    }
  },

  fetchTargets: async () => {
    try {
      const targets = await listTargets()
      set({ targetList: targets })
    } catch {
      // 目标列表获取失败不阻塞主流程
    }
  },

  selectProbe: (uid) => set({ selectedUid: uid }),

  connectProbe: async (uid) => {
    set({ connecting: true, error: null })
    // 先将状态标记为 connecting
    set((state) => ({
      probes: state.probes.map((p) =>
        p.uid === uid ? { ...p, state: 'connecting' as const } : p
      ),
    }))
    try {
      const result = await probeService.connectProbe(uid)
      // 连接成功，更新探针状态和目标信息
      set((state) => ({
        probes: state.probes.map((p) =>
          p.uid === uid
            ? { ...p, state: 'connected' as const, target: result.target }
            : p
        ),
        connecting: false,
      }))
    } catch (err) {
      set((state) => ({
        probes: state.probes.map((p) =>
          p.uid === uid ? { ...p, state: 'error' as const } : p
        ),
        connecting: false,
        error: err instanceof Error ? err.message : '连接探针失败',
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
        error: err instanceof Error ? err.message : '断开探针失败',
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
      // 保持已选中的探针（如果仍然存在）
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
