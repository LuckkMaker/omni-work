import { useEffect, useRef, useCallback, useState } from 'react'
import { RttTerminal, type RttTerminalApi } from './components/RttTerminal'
import { ConfigPanel } from './components/ConfigPanel'
import { InputBar } from './components/InputBar'
import { RttTabBar } from './components/RttTabBar'
import { LogConsole, ResizeHandle } from '@/components/LogConsole'
import { useProbeStore } from '@/stores/probe.store'
import { useRttStore } from '@/stores/rtt.store'
import { cn } from '@/lib/utils'

const LOG_MIN_HEIGHT = 80
const LOG_DEFAULT_EXPANDED = 220
const SIDEBAR_MIN_WIDTH = 240
const SIDEBAR_DEFAULT_WIDTH = 288 // w-72

export default function RttPage() {
  const terminalRef = useRef<RttTerminalApi | null>(null)
  // 日志区默认收缩到最小值；lastExpandedHeight 保存上次展开值用于双击恢复
  const [bottomHeight, setBottomHeight] = useState(LOG_MIN_HEIGHT)
  const lastExpandedHeight = useRef(LOG_DEFAULT_EXPANDED)
  // 右侧配置面板宽度（可拖拽调整，双击折叠）
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const lastExpandedWidth = useRef(SIDEBAR_DEFAULT_WIDTH)

  const selectedProbe = useProbeStore((s) => {
    const uid = s.selectedUid
    return uid ? s.probes.find((p) => p.uid === uid) ?? null : null
  })
  const isConnected = selectedProbe?.state === 'connected'
  const uid = selectedProbe?.uid ?? null

  const running = useRttStore((s) => s.running)
  const activeTabId = useRttStore((s) => s.activeTabId)
  const logs = useRttStore((s) => s.logs)
  const clearLogs = useRttStore((s) => s.clearLogs)

  // 侧边栏宽度变化后触发 resize 让 xterm 重新 fit
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [sidebarWidth])

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => {
      const next = Math.max(SIDEBAR_MIN_WIDTH, Math.min(window.innerWidth / 2, w + delta))
      if (next > SIDEBAR_MIN_WIDTH) lastExpandedWidth.current = next
      return next
    })
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setSidebarWidth((w) => {
      if (w > SIDEBAR_MIN_WIDTH) return SIDEBAR_MIN_WIDTH
      return lastExpandedWidth.current
    })
  }, [])

  const handleResize = useCallback((deltaY: number) => {
    setBottomHeight((h) => {
      const next = Math.max(LOG_MIN_HEIGHT, Math.min(window.innerHeight / 2, h - deltaY))
      if (next > LOG_MIN_HEIGHT) lastExpandedHeight.current = next
      return next
    })
  }, [])

  const handleToggleLog = useCallback(() => {
    setBottomHeight((h) => {
      if (h > LOG_MIN_HEIGHT) return LOG_MIN_HEIGHT
      return lastExpandedHeight.current
    })
  }, [])

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：终端 + 输入栏 + 日志 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Tab 栏 */}
        <RttTabBar running={running} />

        {/* 终端 */}
        <div className="flex-1 overflow-hidden bg-[#0f172a]">
          {isConnected ? (
            <RttTerminal
              key={activeTabId}
              ref={terminalRef}
              uid={uid}
              running={running}
              tabId={activeTabId}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {uid ? '仿真器未连接' : '请选择并连接仿真器'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 输入栏 */}
        <InputBar uid={uid} running={running} />

        {/* 可拖拽分隔 */}
        <ResizeHandle
          onResize={handleResize}
          onToggle={handleToggleLog}
          expanded={bottomHeight > LOG_MIN_HEIGHT}
        />

        {/* 底部日志 */}
        <div className="shrink-0 border-t border-border" style={{ height: bottomHeight }}>
          <LogConsole logs={logs} onClear={clearLogs} title="RTT 日志" />
        </div>
      </div>

      {/* 水平拖拽分隔条（双击折叠/展开） */}
      <ResizeHandle
        direction="horizontal"
        onResize={handleSidebarResize}
        onToggle={handleToggleSidebar}
        expanded={sidebarWidth > SIDEBAR_MIN_WIDTH}
      />

      {/* 右侧配置面板（可变宽度） */}
      <div
        className="flex shrink-0 flex-col overflow-hidden border-l border-border bg-card"
        style={{ width: sidebarWidth }}
      >
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
    </div>
  )
}
