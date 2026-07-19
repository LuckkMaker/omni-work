/**
 * 终端配色方案
 *
 * 为 Commander 和 RTT Viewer 终端提供统一的主题配置。
 * 选中高亮使用不透明高对比色，避免半透明导致看不清。
 */

/** xterm.js ITheme 兼容类型 */
export interface TerminalTheme {
  /** 主题唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 是否深色主题 */
  isDark: boolean
  /** xterm.js theme 配置 */
  theme: {
    background: string
    foreground: string
    cursor: string
    cursorAccent?: string
    selectionBackground: string
    selectionForeground?: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
}

/** 预设主题列表 */
export const TERMINAL_THEMES: TerminalTheme[] = [
  {
    id: 'slate-dark',
    name: 'Slate Dark（默认）',
    isDark: true,
    theme: {
      background: '#0f172a',
      foreground: '#e2e8f0',
      cursor: '#2563eb',
      selectionBackground: '#264f78',
      selectionForeground: '#ffffff',
      black: '#0f172a',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#eab308',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#f8fafc',
      brightBlack: '#64748b',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#facc15',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    isDark: true,
    theme: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      selectionBackground: '#6272a4',
      selectionForeground: '#ffffff',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e67',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    isDark: true,
    theme: {
      background: '#272822',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      selectionBackground: '#49483e',
      selectionForeground: '#ffffff',
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#f4bf75',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    isDark: true,
    theme: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      selectionBackground: '#073642',
      selectionForeground: '#eee8d5',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    isDark: true,
    theme: {
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#528bff',
      selectionBackground: '#3e4451',
      selectionForeground: '#ffffff',
      black: '#282c34',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'slate-light',
    name: 'Slate Light',
    isDark: false,
    theme: {
      background: '#f1f5f9',
      foreground: '#1e293b',
      cursor: '#2563eb',
      selectionBackground: '#93c5fd',
      selectionForeground: '#0f172a',
      black: '#1e293b',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#ca8a04',
      blue: '#2563eb',
      magenta: '#9333ea',
      cyan: '#0891b2',
      white: '#f1f5f9',
      brightBlack: '#64748b',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#eab308',
      brightBlue: '#3b82f6',
      brightMagenta: '#a855f7',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    isDark: false,
    theme: {
      background: '#fdf6e3',
      foreground: '#657b83',
      cursor: '#586e75',
      selectionBackground: '#eee8d5',
      selectionForeground: '#073642',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'one-light',
    name: 'One Light',
    isDark: false,
    theme: {
      background: '#fafafa',
      foreground: '#383a42',
      cursor: '#526fff',
      selectionBackground: '#e5e5e6',
      selectionForeground: '#383a42',
      black: '#383a42',
      red: '#e45649',
      green: '#50a14f',
      yellow: '#c18401',
      blue: '#4078f2',
      magenta: '#a626a4',
      cyan: '#0184bc',
      white: '#fafafa',
      brightBlack: '#9d9d9f',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#383a42',
    },
  },
]

/** 默认主题 ID */
export const DEFAULT_TERMINAL_THEME_ID = 'slate-dark'

/** localStorage 存储 key */
const STORAGE_KEY = 'trae.terminalThemeId'

/** 获取当前主题 ID（从 localStorage 读取，默认 slate-dark） */
export function getStoredThemeId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    if (id && TERMINAL_THEMES.some((t) => t.id === id)) {
      return id
    }
  } catch {
    // localStorage 不可用时忽略
  }
  return DEFAULT_TERMINAL_THEME_ID
}

/** 存储主题 ID 到 localStorage */
export function storeThemeId(themeId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, themeId)
  } catch {
    // 忽略
  }
}

/** 根据 ID 获取主题，找不到则返回默认主题 */
export function getThemeById(themeId: string): TerminalTheme {
  return TERMINAL_THEMES.find((t) => t.id === themeId) ?? TERMINAL_THEMES[0]
}
