import { create } from 'zustand'
import * as commanderService from '@/services/commander.service'
import type { CommandInfo, CommandResult } from '@/services/commander.service'

interface CommanderStore {
  // ── 状态 ──────────────────────────────
  /** 命令历史（最近在前，用于 ↑↓ 键浏览） */
  history: string[]
  /** 当前正在执行的命令（null 表示空闲） */
  runningCommand: string | null
  /** 可用命令列表（侧边面板用） */
  commands: CommandInfo[]
  /** 命令列表是否已加载 */
  commandsLoaded: boolean
  /** 错误信息 */
  error: string | null

  // ── 操作 ──────────────────────────────
  /** 执行命令，返回结果（终端写入由组件处理） */
  execute: (uid: string, command: string) => Promise<CommandResult>
  /** 拉取可用命令列表 */
  fetchCommands: (uid: string | null) => Promise<void>
  /** 获取历史命令（用于 ↑↓ 键），index 从 0 开始，0 = 最近一条 */
  getHistory: (index: number) => string | undefined
  /** 清空命令历史 */
  clearHistory: () => void
  /** 清除错误 */
  clearError: () => void
}

export const useCommanderStore = create<CommanderStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────
  history: [],
  runningCommand: null,
  commands: [],
  commandsLoaded: false,
  error: null,

  // ── 操作 ──────────────────────────────
  execute: async (uid, command) => {
    const trimmed = command.trim()
    if (!trimmed) {
      return { success: false, output: '', error: 'Empty command', command: trimmed }
    }

    set({ runningCommand: trimmed, error: null })
    try {
      const result = await commanderService.execCommand(uid, trimmed)

      // 记录到历史（去重连续相同命令）
      set((state) => {
        const last = state.history[0]
        const newHistory = last === trimmed
          ? state.history
          : [trimmed, ...state.history].slice(0, 200)
        return { history: newHistory, runningCommand: null }
      })

      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Command execution failed'
      set({ runningCommand: null, error: msg })
      return {
        success: false,
        output: '',
        error: msg,
        command: trimmed,
      }
    }
  },

  fetchCommands: async (uid) => {
    try {
      const cmds = uid
        ? await commanderService.listCommands(uid)
        : await commanderService.listAllCommands()
      set({ commands: cmds, commandsLoaded: true })
    } catch (err) {
      console.error('[commander.store] fetchCommands failed:', err)
    }
  },

  getHistory: (index) => {
    const { history } = get()
    if (index < 0 || index >= history.length) return undefined
    return history[index]
  },

  clearHistory: () => set({ history: [] }),
  clearError: () => set({ error: null }),
}))
