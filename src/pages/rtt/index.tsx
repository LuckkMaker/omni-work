import { useEffect, useRef, useCallback, useState } from 'react'
import { RttTerminal, type RttTerminalApi } from './components/RttTerminal'
import { ConfigPanel } from './components/ConfigPanel'
import { InputBar } from './components/InputBar'
import { LogConsole, ResizeHandle } from '@/components/LogConsole'
import { useProbeStore } from '@/stores/probe.store'
import { useRttStore } from '@/stores/rtt.store'
import { wsClient } from '@/services/ws'
import { rttService } from '@/services/rtt.service'
import { cn } from '@/lib/utils'

export default function RttPage() {
  const terminalRef = useRef<RttTerminalApi | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [bottomHeight, setBottomHeight] = useState(160)

  const selectedProbe = useProbeStore((s) => {
    const uid = s.selectedUid
    return uid ? s.probes.find((p) => p.uid === uid) ?? null : null
  })
  const isConnected = selectedProbe?.state === 'connected'
  const uid = selectedProbe?.uid ?? null

  const running = useRttStore((s) => s.running)
  const setRunning = useRttStore((s) => s.setRunning)
  const reset = useRttStore((s) => s.reset)
  const logs = useRttStore((s) => s.logs)
  const clearLogs = useRttStore((s) => s.clearLogs)
  const addLog = useRttStore((s) => s.addLog)

  // 同步 uid 到 ref（供 WebSocket 回调使用）
  const uidRef = useRef<string | null>(uid)
  uidRef.current = uid

  // WebSocket 事件订阅
  useEffect(() => {
    const unsubStarted = wsClient.on('rtt.started', (data: unknown) => {
      const payload = data as { uid: string }
      if (payload.uid !== uidRef.current) return
      setRunning(true)
      addLog({ level: 'info', message: 'RTT 会话已启动', timestamp: new Date().toISOString() })
    })

    const unsubStopped = wsClient.on('rtt.stopped', (data: unknown) => {
      const payload = data as { uid: string; reason: string }
      if (payload.uid !== uidRef.current) return
      setRunning(false)
      addLog({ level: 'info', message: `RTT 会话已停止 (${payload.reason})`, timestamp: new Date().toISOString() })
      if (payload.reason === 'disconnected') {
        reset()
      }
    })

    const unsubError = wsClient.on('rtt.error', (data: unknown) => {
      const payload = data as { uid: string; error: string }
      if (payload.uid !== uidRef.current) return
      addLog({ level: 'error', message: payload.error, timestamp: new Date().toISOString() })
    })

    return () => {
      unsubStarted()
      unsubStopped()
      unsubError()
    }
  }, [setRunning, reset, addLog])

  // 探针断开时停止 RTT
  useEffect(() => {
    if (!isConnected && running && uid) {
      void rttService.stop(uid).catch(() => {})
      setRunning(false)
      reset()
    }
  }, [isConnected, running, uid, setRunning, reset])

  // 页面卸载时停止 RTT
  useEffect(() => {
    return () => {
      if (uidRef.current && useRttStore.getState().running) {
        void rttService.stop(uidRef.current).catch(() => {})
      }
    }
  }, [])

  // 侧边栏折叠/展开后触发 resize 让 xterm 重新 fit
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [sidebarCollapsed])

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v)
  }, [])

  const handleResize = useCallback((deltaY: number) => {
    setBottomHeight((h) => Math.max(80, Math.min(window.innerHeight / 2, h - deltaY)))
  }, [])

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：终端 + 输入栏 + 日志 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 终端 */}
        <div className="flex-1 overflow-hidden bg-[#0f172a]">
          {isConnected ? (
            <RttTerminal ref={terminalRef} uid={uid} running={running} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {uid ? '探针未连接' : '请选择并连接探针'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  连接探针后即可使用 RTT Viewer
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 输入栏 */}
        <InputBar uid={uid} running={running} />

        {/* 可拖拽分隔 */}
        <ResizeHandle onResize={handleResize} expanded={bottomHeight > 80} />

        {/* 底部日志 */}
        <div className="shrink-0 border-t border-border" style={{ height: bottomHeight }}>
          <LogConsole logs={logs} onClear={clearLogs} title="RTT 日志" />
        </div>
      </div>

      {/* 中间折叠竖条（Commander 风格） */}
      <button
        onClick={handleToggleSidebar}
        className={cn(
          'group flex w-3 shrink-0 cursor-pointer items-center justify-center transition-colors',
          sidebarCollapsed
            ? 'bg-primary/40 hover:bg-primary/60'
            : 'bg-border hover:bg-primary/30'
        )}
        title={sidebarCollapsed ? '展开配置面板' : '折叠配置面板'}
      >
        <div className={cn(
          'h-8 w-0.5 rounded-full transition-colors',
          sidebarCollapsed
            ? 'bg-primary-foreground/60'
            : 'bg-muted-foreground/30 group-hover:bg-primary'
        )} />
      </button>

      {/* 右侧配置面板 */}
      {!sidebarCollapsed && (
        <div className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-card">
          <div className="shrink-0 border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold">RTT 配置</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ConfigPanel
              uid={uid}
              connected={isConnected}
              terminalRef={terminalRef}
            />
          </div>
        </div>
      )}
    </div>
  )
}
