import { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFlashStore } from '@/stores/flash.store'
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

export function LogConsole() {
  const { logs } = useFlashStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <Card className="flex flex-col">
      <CardHeader className="shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="size-5 text-muted-foreground" />
          <CardTitle>日志</CardTitle>
          {logs.length > 0 && (
            <span className="text-xs text-muted-foreground">({logs.length})</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto px-4 pb-4 font-mono text-xs leading-relaxed"
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
