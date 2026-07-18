import { useState, useRef, useEffect } from 'react'
import { Bell, Usb, ChevronDown, CheckCircle2, AlertTriangle, XCircle, Info, Loader2, Trash2, X } from 'lucide-react'
import { useProbeStore, SPEED_OPTIONS, type DebugInterface } from '@/stores/probe.store'
import { useNotificationStore } from '@/stores/notification.store'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { cn } from '@/lib/utils'

const typeConfig = {
  info: { icon: Info, color: 'text-blue-400' },
  success: { icon: CheckCircle2, color: 'text-green-400' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400' },
  error: { icon: XCircle, color: 'text-red-400' },
  progress: { icon: Loader2, color: 'text-blue-400' },
} as const

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

/** 下拉选择器（接口/速度） */
function DropdownSelector({
  label,
  value,
  options,
  onSelect,
  disabled,
}: {
  label: string
  value: string
  options: { label: string; value: string | number }[]
  onSelect: (value: string | number) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(!open) }}
        disabled={disabled}
        className="flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-white/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={disabled ? '断开连接后才能修改' : label}
      >
        <span className="text-white/60">{label}:</span>
        <span className="text-white font-medium">{value}</span>
        <ChevronDown className={cn('size-3 text-white/60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && !disabled && (
        <div className="absolute bottom-full left-0 mb-1 min-w-[120px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-[100] py-0.5">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => { onSelect(opt.value); setOpen(false) }}
              className="block w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 通知历史面板 */
function NotificationHistory() {
  const { history, clearHistory, removeFromHistory, setHistoryVisible } = useNotificationStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setHistoryVisible(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [setHistoryVisible])

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-1 w-96 max-h-[400px] flex flex-col rounded-md border border-border bg-popover text-popover-foreground shadow-xl z-[100]"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium">通知历史</span>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            title="清空历史"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            onClick={() => setHistoryVisible(false)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto flex-1">
        {history.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">暂无通知记录</div>
        ) : (
          history.map((n) => {
            const config = typeConfig[n.type]
            const Icon = config.icon
            return (
              <div key={n.id} className="group flex items-start gap-2 px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors">
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', config.color, n.type === 'progress' && 'animate-spin')} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{n.title}</div>
                  {n.message && <div className="text-xs text-muted-foreground mt-0.5 break-words">{n.message}</div>}
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{formatTime(n.timestamp)}</div>
                </div>
                <button
                  onClick={() => removeFromHistory(n.id)}
                  className="p-0.5 text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive transition-colors shrink-0"
                  title="删除此通知"
                >
                  <X className="size-3" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function StatusBar() {
  const pendingInterface = useProbeStore((s) => s.pendingInterface)
  const pendingSpeed = useProbeStore((s) => s.pendingSpeed)
  const setPendingInterface = useProbeStore((s) => s.setPendingInterface)
  const setPendingSpeed = useProbeStore((s) => s.setPendingSpeed)
  const selectedUid = useProbeStore((s) => s.selectedUid)
  const probes = useProbeStore((s) => s.probes)
  const { status } = useBackendStatus()
  const { history, historyVisible, toggleHistory } = useNotificationStore()

  const probe = probes.find((p) => p.uid === selectedUid) ?? null
  const isConnected = probe?.state === 'connected'
  const isConnecting = probe?.state === 'connecting'
  const speedLabel = SPEED_OPTIONS.find((s) => s.value === pendingSpeed)?.label ?? `${pendingSpeed} Hz`
  const interfaceDisabled = isConnected || isConnecting

  return (
    <div className="flex h-6 items-center justify-between bg-primary text-white px-1 text-xs select-none shrink-0">
      {/* 左侧：后端状态 + 接口/速度 */}
      <div className="flex items-center gap-0.5">
        {/* 后端状态 */}
        <div className="flex items-center gap-1 px-2">
          <div className={cn('size-1.5 rounded-full', status ? 'bg-green-400' : 'bg-red-400')} />
          <span className="text-white/80">{status ? 'Backend Online' : 'Backend Offline'}</span>
        </div>

        <div className="w-px h-3 bg-white/20" />

        {/* 接口选择 */}
        <DropdownSelector
          label="IF"
          value={pendingInterface.toUpperCase()}
          options={[
            { label: 'SWD', value: 'swd' as DebugInterface },
            { label: 'JTAG', value: 'jtag' as DebugInterface },
          ]}
          onSelect={(v) => setPendingInterface(v as DebugInterface)}
          disabled={interfaceDisabled}
        />

        {/* 速度选择 */}
        <DropdownSelector
          label="Speed"
          value={speedLabel}
          options={SPEED_OPTIONS.map((s) => ({ label: s.label, value: s.value }))}
          onSelect={(v) => setPendingSpeed(v as number)}
          disabled={interfaceDisabled}
        />

        <div className="w-px h-3 bg-white/20" />

        {/* 连接状态 */}
        <div className="flex items-center gap-1 px-2">
          {isConnecting ? (
            <>
              <Loader2 className="size-3 animate-spin text-white/80" />
              <span className="text-white/80">Connecting...</span>
            </>
          ) : isConnected ? (
            <>
              <Usb className="size-3 text-green-400" />
              <span className="text-white/80">Connected</span>
            </>
          ) : (
            <>
              <Usb className="size-3 text-white/40" />
              <span className="text-white/50">Disconnected</span>
            </>
          )}
        </div>
      </div>

      {/* 右侧：铃铛 */}
      <div className="flex items-center">
        {/* 通知计数 */}
        <div className="relative">
          <button
            onClick={toggleHistory}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded transition-colors',
              historyVisible ? 'bg-white/20' : 'hover:bg-white/10'
            )}
            title="通知历史"
          >
            <Bell className="size-3.5" />
            {history.length > 0 && (
              <span className="text-[10px] bg-white/20 px-1 rounded-full min-w-[14px] text-center">
                {history.length > 99 ? '99+' : history.length}
              </span>
            )}
          </button>
          {historyVisible && <NotificationHistory />}
        </div>
      </div>
    </div>
  )
}
