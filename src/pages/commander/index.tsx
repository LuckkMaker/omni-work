import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal, type TerminalApi } from './components/Terminal'
import { CommandSidebar } from './components/CommandSidebar'
import { ResizeHandle } from '@/components/LogConsole'
import { useProbeStore } from '@/stores/probe.store'
import { useCommanderStore } from '@/stores/commander.store'
import { resetContext } from '@/services/commander.service'

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_DEFAULT_WIDTH = 288 // w-72

export default function CommanderPage() {
  const terminalApiRef = useRef<TerminalApi | null>(null)

  // 侧边栏宽度状态（默认展开，宽度可拖拽调整）
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const lastExpandedWidth = useRef(SIDEBAR_DEFAULT_WIDTH)

  const selectedProbe = useProbeStore((s) => {
    const uid = s.selectedUid
    return uid ? s.probes.find((p) => p.uid === uid) ?? null : null
  })
  const isConnected = selectedProbe?.state === 'connected'
  const uid = selectedProbe?.uid ?? null

  const commands = useCommanderStore((s) => s.commands)
  const commandsLoaded = useCommanderStore((s) => s.commandsLoaded)
  const fetchCommands = useCommanderStore((s) => s.fetchCommands)

  // 挂载时拉取全量命令列表
  useEffect(() => {
    if (isConnected && uid) {
      void fetchCommands(uid)
    } else if (!commandsLoaded) {
      void fetchCommands(null)
    }
  }, [isConnected, uid, commandsLoaded, fetchCommands])

  // 断开时重置 commandsLoaded
  useEffect(() => {
    if (!isConnected) {
      useCommanderStore.setState({ commandsLoaded: false })
    }
  }, [isConnected])

  /** 侧边栏命令点击处理 */
  const handleSidebarCommand = useCallback((cmd: string) => {
    if (!terminalApiRef.current) return
    if (cmd.endsWith(' ')) {
      terminalApiRef.current.insertText(cmd)
    } else {
      terminalApiRef.current.runCommand(cmd)
    }
    // 焦点回到终端，方便用户按回车或继续输入
    terminalApiRef.current.focus()
  }, [])

  /** 清屏 */
  const handleClear = useCallback(() => {
    terminalApiRef.current?.clear()
  }, [])

  /** 重置命令上下文 */
  const handleResetContext = useCallback(async () => {
    if (!uid) return
    try {
      await resetContext(uid)
      await fetchCommands(uid)
      terminalApiRef.current?.runCommand('status')
    } catch {
      // 忽略
    }
  }, [uid, fetchCommands])

  /** 拖拽调整侧边栏宽度 */
  const handleSidebarResize = useCallback((delta: number) => {
    // 右侧边栏：鼠标向右拖（delta > 0）应增加宽度
    setSidebarWidth((w) => {
      const next = Math.max(SIDEBAR_MIN_WIDTH, Math.min(window.innerWidth / 2, w + delta))
      if (next > SIDEBAR_MIN_WIDTH) lastExpandedWidth.current = next
      return next
    })
  }, [])

  /** 双击折叠/展开侧边栏 */
  const handleToggleSidebar = useCallback(() => {
    setSidebarWidth((w) => {
      if (w > SIDEBAR_MIN_WIDTH) return SIDEBAR_MIN_WIDTH
      return lastExpandedWidth.current
    })
  }, [])

  /** 侧边栏宽度变化后触发 resize，让 xterm.js FitAddon 重新计算尺寸 */
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [sidebarWidth])

  return (
    <div className="flex h-full min-h-0">
      {/* 终端区 */}
      <div className="relative min-w-0 flex-1 bg-[#0f172a]">
        <Terminal
          uid={uid}
          connected={isConnected}
          commands={commands}
          apiRef={terminalApiRef}
        />
      </div>

      {/* 水平拖拽分隔条（双击折叠/展开） */}
      <ResizeHandle
        direction="horizontal"
        onResize={handleSidebarResize}
        onToggle={handleToggleSidebar}
        expanded={sidebarWidth > SIDEBAR_MIN_WIDTH}
      />

      {/* 侧边命令面板（可变宽度） */}
      <div
        className="shrink-0 overflow-hidden border-l border-border bg-card"
        style={{ width: sidebarWidth }}
      >
        <CommandSidebar
          onRunCommand={handleSidebarCommand}
          commands={commands}
          connected={isConnected}
          onClear={handleClear}
          onResetContext={handleResetContext}
        />
      </div>
    </div>
  )
}
