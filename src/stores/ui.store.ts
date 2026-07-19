import { create } from 'zustand'
import {
  TERMINAL_THEMES,
  DEFAULT_TERMINAL_THEME_ID,
  getStoredThemeId,
  storeThemeId,
  getThemeById,
  type TerminalTheme,
} from '@/config/terminal-themes'

interface UiState {
  /** 当前终端主题 ID */
  terminalThemeId: string
  /** 当前终端主题对象 */
  terminalTheme: TerminalTheme
  /** 切换终端主题 */
  setTerminalTheme: (themeId: string) => void
}

const initialThemeId = getStoredThemeId()

export const useUiStore = create<UiState>((set) => ({
  terminalThemeId: initialThemeId,
  terminalTheme: getThemeById(initialThemeId),
  setTerminalTheme: (themeId: string) => {
    const theme = getThemeById(themeId)
    storeThemeId(themeId)
    set({ terminalThemeId: themeId, terminalTheme: theme })
  },
}))

/** 获取所有可用主题（供 UI 渲染下拉选项） */
export { TERMINAL_THEMES, DEFAULT_TERMINAL_THEME_ID }
