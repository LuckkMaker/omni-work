import { useEffect, useRef, useCallback, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { RttTerminal, type RttTerminalApi } from './components/RttTerminal'
import { ConfigPanel } from './components/ConfigPanel'
import { InputBar } from './components/InputBar'
import { useProbeStore } from '@/stores/probe.store'
import { useRttStore } from '@/stores/rtt.store'
import { wsClient } from '@/services/ws'
import { rttService } from '@/services/rtt.service'

export default function RttPage() {
  const terminalRef = useRef<RttTerminalApi | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const selectedProbe = useProbeStore((s) => {
    const uid = s.selectedUid
    return uid ? s.probes.find((p) => p.uid === uid) ?? null : null
  })
  const isConnected = selectedProbe?.state === 'connected'
  const uid = selectedProbe?.uid ?? null

  const running = useRttStore((s) => s.running)
  const setRunning = useRttStore((s) => s.setRunning)
  const reset = useRttStore((s) => s.reset)

  // 同步 uid 到 ref（供 WebSocket 回调使用）
  const uidRef = useRef<string | null>(uid)
  uidRef.current = uid

  // WebSocket 事件订阅
  useEffect(() => {
    // rtt.started: 后端确认 RTT 已启动
    const unsubStarted = wsClient.on('rtt.started', (data: unknown) => {
      const payload = data as { uid: string }
      if (payload.uid !== uidRef.current) return
      setRunning(true)
    })

    // rtt.stopped: RTT 已停止（用户操作或探针断开）
    const unsubStopped = wsClient.on('rtt.stopped', (data: unknown) => {
      const payload = data as { uid: string; reason: string }
      if (payload.uid !== uidRef.current) return
      setRunning(false)
      if (payload.reason === 'disconnected') {
        reset()
      }
    })

    return () => {
      unsubStarted()
      unsubStopped()
    }
  }, [setRunning, reset])

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

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v)
  }, [])

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧配置面板 */}
      {!sidebarCollapsed && (
        <div className="flex w-64 flex-col border-r border-border bg-card/50">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">RTT 配置</h2>
            <button
              onClick={handleToggleSidebar}
              className="text-muted-foreground hover:text-foreground"
              title="折叠侧边栏"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
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

      {/* 右侧终端区域 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶栏 */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            {sidebarCollapsed && (
              <button
                onClick={handleToggleSidebar}
                className="text-muted-foreground hover:text-foreground"
                title="展开侧边栏"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <h1 className="text-sm font-semibold">RTT Viewer</h1>
            {running && (
              <span className="flex items-center gap-1.5 text-xs text-green-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                运行中
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedProbe ? (
              <>
                {selectedProbe.vendor} {selectedProbe.product}
              </>
            ) : (
              '未选择探针'
            )}
          </div>
        </div>

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
      </div>
    </div>
  )
}
