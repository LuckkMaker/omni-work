import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal, type TerminalApi } from './components/Terminal'
import { CommandSidebar } from './components/CommandSidebar'
import { useProbeStore } from '@/stores/probe.store'
import { useCommanderStore } from '@/stores/commander.store'
import { resetContext } from '@/services/commander.service'
import { cn } from '@/lib/utils'

export default function CommanderPage() {
  const terminalApiRef = useRef<TerminalApi | null>(null)

  // 侧边栏折叠状态
  const [collapsed, setCollapsed] = useState(false)

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

  /** 折叠/展开时触发 resize，让 xterm.js FitAddon 重新计算尺寸 */
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [collapsed])

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

      {/* 折叠/展开竖条按钮（只做折叠/展开，无拖拽调整宽度） */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'group flex w-3 shrink-0 cursor-pointer items-center justify-center transition-colors',
          collapsed
            ? 'bg-primary/40 hover:bg-primary/60'
            : 'bg-border hover:bg-primary/30'
        )}
      >
        {/* 中间装饰性竖条指示器（纯视觉，提示可点击） */}
        <div
          className={cn(
            'h-8 w-0.5 rounded-full transition-colors',
            collapsed
              ? 'bg-primary-foreground/60'
              : 'bg-muted-foreground/30 group-hover:bg-primary'
          )}
        />
      </button>

      {/* 侧边命令面板（固定宽度 w-72，折叠时隐藏） */}
      {!collapsed && (
        <div className="w-72 shrink-0">
          <CommandSidebar
            onRunCommand={handleSidebarCommand}
            commands={commands}
            connected={isConnected}
            onClear={handleClear}
            onResetContext={handleResetContext}
          />
        </div>
      )}
    </div>
  )
}
