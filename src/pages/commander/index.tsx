import { useEffect, useRef, useCallback } from 'react'
import { Eraser, Loader2, Circle, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Terminal, type TerminalApi } from './components/Terminal'
import { CommandSidebar } from './components/CommandSidebar'
import { useProbeStore } from '@/stores/probe.store'
import { useCommanderStore } from '@/stores/commander.store'
import { resetContext } from '@/services/commander.service'
import { cn } from '@/lib/utils'

export default function CommanderPage() {
  const terminalApiRef = useRef<TerminalApi | null>(null)

  const selectedProbe = useProbeStore((s) => {
    const uid = s.selectedUid
    return uid ? s.probes.find((p) => p.uid === uid) ?? null : null
  })
  const isConnected = selectedProbe?.state === 'connected'
  const uid = selectedProbe?.uid ?? null
  const targetName = selectedProbe?.target?.part_number

  const commands = useCommanderStore((s) => s.commands)
  const commandsLoaded = useCommanderStore((s) => s.commandsLoaded)
  const fetchCommands = useCommanderStore((s) => s.fetchCommands)
  const runningCommand = useCommanderStore((s) => s.runningCommand)

  // 挂载时拉取全量命令列表（不依赖探针连接），连接后再拉取含 target 专属命令的完整列表
  useEffect(() => {
    if (isConnected && uid) {
      void fetchCommands(uid)
    } else if (!commandsLoaded) {
      void fetchCommands(null)
    }
  }, [isConnected, uid, commandsLoaded, fetchCommands])

  // 断开时重置 commandsLoaded，以便重连后重新拉取
  useEffect(() => {
    if (!isConnected) {
      useCommanderStore.setState({ commandsLoaded: false })
    }
  }, [isConnected])

  /** 侧边栏命令点击处理：有尾随空格 = 需要参数 → 插入；否则立即执行 */
  const handleSidebarCommand = useCallback((cmd: string) => {
    if (!terminalApiRef.current) return
    if (cmd.endsWith(' ')) {
      // 需要参数，插入到输入行等用户补全
      terminalApiRef.current.insertText(cmd)
    } else {
      // 无参数命令，立即执行
      terminalApiRef.current.runCommand(cmd)
    }
  }, [])

  /** 清屏 */
  const handleClear = useCallback(() => {
    terminalApiRef.current?.clear()
  }, [])

  /** 重置命令上下文（目标切换后） */
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

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
        {/* 连接状态指示 */}
        <div className="flex items-center gap-1.5">
          <Circle
            className={cn(
              'size-2.5 fill-current',
              isConnected ? 'text-green-500' : 'text-muted-foreground/40'
            )}
          />
          <span className="text-xs font-medium">
            {isConnected ? (targetName ?? 'Connected') : 'Not connected'}
          </span>
        </div>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* 执行状态 */}
        {runningCommand && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span className="font-mono">{runningCommand}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!isConnected}
            onClick={handleResetContext}
            className="h-7 gap-1.5 text-xs"
            title="重置命令上下文（目标切换后使用）"
          >
            <Power className="size-3.5" />
            重置上下文
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 gap-1.5 text-xs"
          >
            <Eraser className="size-3.5" />
            清屏
          </Button>
        </div>
      </div>

      {/* 主体：终端 + 侧边命令面板 */}
      <div className="flex flex-1 min-h-0">
        {/* 终端区 */}
        <div className="flex-1 min-w-0 bg-[#0f172a]">
          <Terminal uid={uid} connected={isConnected} apiRef={terminalApiRef} />
        </div>

        {/* 侧边命令面板 */}
        <div className="w-60 shrink-0">
          <CommandSidebar
            onRunCommand={handleSidebarCommand}
            commands={commands}
            connected={isConnected}
          />
        </div>
      </div>
    </div>
  )
}
