import { useEffect, useRef } from 'react'
import { Info, CheckCircle2, AlertTriangle, XCircle, Loader2, X } from 'lucide-react'
import { useNotificationStore, type Notification } from '@/stores/notification.store'
import { cn } from '@/lib/utils'

const typeConfig = {
  info: { icon: Info, accent: 'border-l-primary', iconColor: 'text-primary' },
  success: { icon: CheckCircle2, accent: 'border-l-green-500', iconColor: 'text-green-500' },
  warning: { icon: AlertTriangle, accent: 'border-l-yellow-500', iconColor: 'text-yellow-500' },
  error: { icon: XCircle, accent: 'border-l-red-500', iconColor: 'text-red-500' },
  progress: { icon: Loader2, accent: 'border-l-primary', iconColor: 'text-primary' },
} as const

function NotificationItem({ notification }: { notification: Notification }) {
  const { dismiss } = useNotificationStore()
  const config = typeConfig[notification.type]
  const Icon = config.icon
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 自动关闭
  useEffect(() => {
    if (notification.autoClose) {
      timerRef.current = setTimeout(() => {
        dismiss(notification.id)
      }, notification.autoCloseDelay)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [notification.autoClose, notification.autoCloseDelay, notification.id, dismiss])

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-3 rounded-md border border-border border-l-4 bg-popover p-3 shadow-lg',
        'animate-in slide-in-from-right-5 fade-in duration-300',
        config.accent
      )}
    >
      {/* 图标 */}
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          config.iconColor,
          notification.type === 'progress' && 'animate-spin'
        )}
      />

      {/* 内容 */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-popover-foreground">{notification.title}</div>
        {notification.message && (
          <div className="mt-0.5 text-xs text-muted-foreground break-words">{notification.message}</div>
        )}
        {/* 进度条 */}
        {notification.type === 'progress' && notification.progress != null && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${notification.progress}%` }}
              />
            </div>
            <div className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
              {notification.progress.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* 关闭按钮 */}
      <button
        onClick={() => dismiss(notification.id)}
        className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function NotificationContainer() {
  const { notifications } = useNotificationStore()

  if (notifications.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-h-[calc(100vh-2rem)] flex-col-reverse gap-2 overflow-y-auto">
      {notifications.map((n) => (
        <NotificationItem key={n.id} notification={n} />
      ))}
    </div>
  )
}
