import { create } from 'zustand'

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'progress'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  /** 进度百分比 0-100，仅 type='progress' */
  progress?: number
  timestamp: number
  /** 是否自动关闭，非 progress 类型默认 true */
  autoClose: boolean
  /** 自动关闭延迟（ms），默认 5000 */
  autoCloseDelay: number
}

interface NotificationStore {
  /** 活跃通知（显示在右下角） */
  notifications: Notification[]
  /** 历史通知（已关闭，可通过铃铛查看） */
  history: Notification[]
  /** 历史通知面板是否可见 */
  historyVisible: boolean

  /** 新增通知，返回 id */
  push: (n: Omit<Notification, 'id' | 'timestamp' | 'autoClose' | 'autoCloseDelay'> & Partial<Pick<Notification, 'autoClose' | 'autoCloseDelay'>>) => string
  /** 更新通知（进度/消息/类型） */
  update: (id: string, patch: Partial<Omit<Notification, 'id' | 'timestamp'>>) => void
  /** 关闭单条通知（移入历史） */
  dismiss: (id: string) => void
  /** 清空所有活跃通知 */
  clear: () => void
  /** 清空历史 */
  clearHistory: () => void
  /** 删除单条历史通知 */
  removeFromHistory: (id: string) => void
  /** 切换历史面板可见性 */
  toggleHistory: () => void
  /** 设置历史面板可见性 */
  setHistoryVisible: (visible: boolean) => void
}

let counter = 0
function genId(): string {
  counter += 1
  return `notif-${Date.now()}-${counter}`
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  history: [],
  historyVisible: false,

  push: (n) => {
    const id = genId()
    const isProgress = n.type === 'progress'
    const notification: Notification = {
      id,
      type: n.type,
      title: n.title,
      message: n.message,
      progress: n.progress,
      timestamp: Date.now(),
      autoClose: n.autoClose ?? !isProgress,
      autoCloseDelay: n.autoCloseDelay ?? (isProgress ? 3000 : 5000),
    }
    set((state) => ({
      notifications: [...state.notifications, notification],
      history: [notification, ...state.history].slice(0, 100), // 保留最近 100 条
    }))
    return id
  },

  update: (id, patch) => {
    set((state) => {
      const updateFn = (n: Notification) => n.id === id ? { ...n, ...patch } : n
      return {
        notifications: state.notifications.map(updateFn),
        history: state.history.map(updateFn),
      }
    })
  },

  dismiss: (id) => {
    set((state) => {
      const dismissed = state.notifications.find((n) => n.id === id)
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        // 如果历史中还没有这条通知，则添加
        history: dismissed && !state.history.some((h) => h.id === id)
          ? [dismissed, ...state.history].slice(0, 100)
          : state.history,
      }
    })
  },

  clear: () => set({ notifications: [] }),
  clearHistory: () => set({ history: [] }),
  /** 删除单条历史通知 */
  removeFromHistory: (id: string) => set((state) => ({
    history: state.history.filter((n) => n.id !== id),
  })),
  toggleHistory: () => set((state) => ({ historyVisible: !state.historyVisible })),
  setHistoryVisible: (visible) => set({ historyVisible: visible }),
}))
