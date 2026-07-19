import { useEffect, useRef, useCallback, useState } from 'react'
import { Keyboard, MessageSquare, Eye } from 'lucide-react'
import { RttTerminal, type RttTerminalApi } from './components/RttTerminal'
import { ConfigPanel } from './components/ConfigPanel'
import { InputBar } from './components/InputBar'
import { RttTabBar } from './components/RttTabBar'
import { LogConsole, ResizeHandle } from '@/components/LogConsole'
import { useProbeStore } from '@/stores/probe.store'
import { useRttStore } from '@/stores/rtt.store'
import { useUiStore } from '@/stores/ui.store'
import { cn } from '@/lib/utils'

const LOG_MIN_HEIGHT = 0 // 0 = 完全隐藏
const LOG_DEFAULT_EXPANDED = 220
const SIDEBAR_MAX_RATIO = 0.25 // 最大尺寸 = 窗口宽度 1/4
const SIDEBAR_DEFAULT_WIDTH = 288 // w-72

function getSidebarMaxWidth(): number {
  return Math.floor((window.innerWidth ?? 1280) * SIDEBAR_MAX_RATIO)
}

export default function RttPage() {
  const terminalRef = useRef<RttTerminalApi | null>(null)
  // 日志区默认收缩到最小值；lastExpandedHeight 保存上次展开值用于双击恢复
  const [bottomHeight, setBottomHeight] = useState(LOG_MIN_HEIGHT)
  const lastExpandedHeight = useRef(LOG_DEFAULT_EXPANDED)
  // 右侧配置面板宽度：0 = 完全隐藏；>0 = 展开宽度（上限 = 窗口 1/4）
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)

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
  // 终端主题：用于让终端容器背景跟随主题即时切换（无需启动会话）
  const terminalTheme = useUiStore((s) => s.terminalTheme)
  // 输入模式与本地回显（终端输入模式用）
  const inputMode = useRttStore((s) => s.inputMode)
  const localEcho = useRttStore((s) => s.localEcho)
  const setInputMode = useRttStore((s) => s.setInputMode)
  const setLocalEcho = useRttStore((s) => s.setLocalEcho)

  // 侧边栏宽度变化后触发 resize 让 xterm 重新 fit
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [sidebarWidth])

  const handleSidebarResize = useCallback((delta: number) => {
    // 右侧边栏：鼠标向左拖（delta<0）应扩大宽度，向右拖（delta>0）应缩小宽度
    setSidebarWidth((w) => {
      const next = Math.max(0, Math.min(getSidebarMaxWidth(), w - delta))
      return next
    })
  }, [])

  const handleToggleSidebar = useCallback(() => {
    // 双击在[完全隐藏(0)]和[最大尺寸(窗口1/4)]之间切换
    setSidebarWidth((w) => (w > 0 ? 0 : getSidebarMaxWidth()))
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

        {/* 输入模式工具栏：InputBar(文本/HEX) ↔ Terminal(终端直接输入) */}
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              onClick={() => setInputMode('bar')}
              className={cn(
                'flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors',
                inputMode === 'bar'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="输入栏模式：文本/HEX 发送，支持追加换行"
            >
              <MessageSquare className="size-3" />
              输入栏
            </button>
            <button
              onClick={() => setInputMode('terminal')}
              className={cn(
                'flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors',
                inputMode === 'terminal'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="终端模式：直接在终端输入，支持 Tab/方向键/Ctrl 组合键等（适用于下位机 RTT shell）"
            >
              <Keyboard className="size-3" />
              终端
            </button>
          </div>

          {/* 本地回显开关（仅终端模式显示） */}
          {inputMode === 'terminal' && (
            <button
              onClick={() => setLocalEcho(!localEcho)}
              className={cn(
                'flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors',
                localEcho
                  ? 'border-green-500 bg-green-500/10 text-green-600'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
              title={localEcho ? '本地回显已开启：输入会显示在终端' : '本地回显已关闭：输入不显示（适用于下位机自身回显场景）'}
            >
              <Eye className="size-3" />
              回显
            </button>
          )}

          {inputMode === 'terminal' && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              终端模式：直接输入，Tab 补全 / 方向键 / Ctrl+C 等发送到下位机
            </span>
          )}
        </div>

        {/* 终端：容器背景跟随当前终端主题，未启动会话时也能反映主题切换 */}
        <div
          className="flex-1 overflow-hidden"
          style={{ backgroundColor: terminalTheme.theme.background }}
        >
          {isConnected ? (
            <RttTerminal
              key={activeTabId}
              ref={terminalRef}
              uid={uid}
              running={running}
              tabId={activeTabId}
              inputMode={inputMode}
              localEcho={localEcho}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p style={{ color: terminalTheme.theme.foreground, opacity: 0.7 }}>
                  {uid ? '仿真器未连接' : '请选择并连接仿真器'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 输入栏：仅 bar 模式显示（terminal 模式由终端直接输入） */}
        {inputMode === 'bar' && <InputBar uid={uid} running={running} />}

        {/* 可拖拽分隔（双击完全隐藏/恢复） */}
        <ResizeHandle
          onResize={handleResize}
          onToggle={handleToggleLog}
          expanded={bottomHeight > LOG_MIN_HEIGHT}
        />

        {/* 底部日志（高度为 0 时完全隐藏，避免残留 border） */}
        <div
          className={bottomHeight > LOG_MIN_HEIGHT ? 'shrink-0 border-t border-border' : 'hidden'}
          style={bottomHeight > LOG_MIN_HEIGHT ? { height: bottomHeight } : undefined}
        >
          <LogConsole logs={logs} onClear={clearLogs} title="RTT 日志" />
        </div>
      </div>

      {/* 水平拖拽分隔条（双击在[完全隐藏]与[最大尺寸]之间切换） */}
      <ResizeHandle
        direction="horizontal"
        onResize={handleSidebarResize}
        onToggle={handleToggleSidebar}
        expanded={sidebarWidth > 0}
      />

      {/* 右侧配置面板（宽度为 0 时完全隐藏，避免残留 border） */}
      <div
        className={sidebarWidth > 0 ? 'flex shrink-0 flex-col overflow-hidden border-l border-border bg-card' : 'hidden'}
        style={sidebarWidth > 0 ? { width: sidebarWidth } : undefined}
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
