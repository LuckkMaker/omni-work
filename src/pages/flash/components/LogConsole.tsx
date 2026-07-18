import { useEffect, useRef, useCallback } from 'react'
import { Terminal, Trash2, Download } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useFlashStore } from '@/stores/flash.store'
import { useNotificationStore } from '@/stores/notification.store'
import { cn } from '@/lib/utils'
import type { LogEvent } from '@shared/types'

const levelColor: Record<LogEvent['level'], string> = {
  info: 'text-foreground',
  warning: 'text-yellow-500',
  error: 'text-red-500',
}

const levelTag: Record<LogEvent['level'], string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERR ',
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  } catch {
    return ts
  }
}

interface LogConsoleProps {
  /** 日志区高度 (px) */
  height: number
}

export function LogConsole({ height }: LogConsoleProps) {
  const { logs, clearLogs } = useFlashStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  // Ctrl+A 全选日志区内所有文本
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      const el = scrollRef.current
      if (!el) return
      const range = document.createRange()
      range.selectNodeContents(el)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }, [])

  // Ctrl+C 复制选中文本（浏览器默认支持，但确保在无选区时复制最后一条日志）
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) return
    e.preventDefault()
    const lastLog = logs[logs.length - 1]
    if (lastLog) {
      e.clipboardData.setData('text/plain', `[${formatTime(lastLog.timestamp)}] [${levelTag[lastLog.level].trim()}] ${lastLog.message}`)
    }
  }, [logs])

  const handleSave = async () => {
    if (logs.length === 0) return
    const savePath = await window.electron?.saveFileDialog?.(`log_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.log`)
    if (!savePath) return

    const content = logs.map((log) =>
      `[${formatTime(log.timestamp)}] [${levelTag[log.level].trim()}] ${log.message}`
    ).join('\n')

    // 用 base64 编码发送到后端保存
    const base64 = btoa(unescape(encodeURIComponent(content)))
    const { api } = await import('@/services/api')
    const client = await api()
    await client.post('/api/files/save', { file_path: savePath, data: base64 })

    useNotificationStore.getState().push({
      type: 'success',
      title: '日志已保存',
      message: savePath.split(/[\\/]/).pop() ?? savePath,
      autoClose: true,
      autoCloseDelay: 3000,
    })
  }

  return (
    <Card className="flex flex-col" style={{ height }}>
      <CardHeader className="shrink-0 py-1.5 px-3">
        <div className="flex items-center gap-1.5">
          <Terminal className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">日志</span>
          {logs.length > 0 && (
            <span className="text-[10px] text-muted-foreground">({logs.length})</span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={logs.length === 0}
              className="h-6 w-6 p-0"
              title="保存日志"
            >
              <Download className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearLogs}
              disabled={logs.length === 0}
              className="h-6 w-6 p-0"
              title="清除日志"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div
          ref={scrollRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onCopy={handleCopy}
          className="h-full overflow-y-auto px-3 pb-2 font-mono text-xs leading-relaxed outline-none"
        >
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              暂无日志
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="shrink-0 text-muted-foreground/60">{formatTime(log.timestamp)}</span>
                <span className={cn('shrink-0 font-bold', levelColor[log.level])}>
                  [{levelTag[log.level]}]
                </span>
                <span className={levelColor[log.level]}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** 拖拽分隔条组件 */
export function ResizeHandle({
  onResize,
  expanded,
}: {
  onResize: (deltaY: number) => void
  expanded: boolean
}) {
  const dragging = useRef(false)
  const lastY = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastY.current = e.clientY
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const deltaY = e.clientY - lastY.current
      lastY.current = e.clientY
      onResize(deltaY)
    }
    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onResize])

  return (
    <div
      onMouseDown={handleMouseDown}
      className="group flex h-1.5 cursor-row-resize items-center justify-center transition-colors hover:bg-primary/20"
    >
      <div className={cn(
        'h-0.5 w-8 rounded-full transition-colors',
        expanded ? 'bg-primary/40' : 'bg-border group-hover:bg-primary/40'
      )} />
    </div>
  )
}
