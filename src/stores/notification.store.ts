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
  notifications: Notification[]

  /** 新增通知，返回 id */
  push: (n: Omit<Notification, 'id' | 'timestamp' | 'autoClose' | 'autoCloseDelay'> & Partial<Pick<Notification, 'autoClose' | 'autoCloseDelay'>>) => string
  /** 更新通知（进度/消息/类型） */
  update: (id: string, patch: Partial<Omit<Notification, 'id' | 'timestamp'>>) => void
  /** 关闭单条通知 */
  dismiss: (id: string) => void
  /** 清空所有通知 */
  clear: () => void
}

let counter = 0
function genId(): string {
  counter += 1
  return `notif-${Date.now()}-${counter}`
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

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
    set((state) => ({ notifications: [...state.notifications, notification] }))
    return id
  },

  update: (id, patch) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, ...patch } : n
      ),
    }))
  },

  dismiss: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },

  clear: () => set({ notifications: [] }),
}))
