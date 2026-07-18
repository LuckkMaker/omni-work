import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Play,
  Square,
  SkipForward,
  RotateCcw,
  Cpu,
  MemoryStick,
  Search,
  Terminal as TerminalIcon,
  ChevronRight,
  BookOpen,
  Eraser,
  Power,
  Download,
  Upload,
  Trash2,
  GripHorizontal,
  Copy,
  Lightbulb,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CommandInfo } from '@/services/commander.service'

interface CommandSidebarProps {
  onRunCommand: (cmd: string) => void
  commands: CommandInfo[]
  connected: boolean
  onClear: () => void
  onResetContext: () => void
}

/** 快捷命令定义 */
interface QuickCommand {
  label: string
  cmd: string
  icon: typeof Play
  group: string
}

const QUICK_COMMANDS: QuickCommand[] = [
  // Run Control
  { label: 'Halt', cmd: 'halt', icon: Square, group: 'Run Control' },
  { label: 'Continue', cmd: 'continue', icon: Play, group: 'Run Control' },
  { label: 'Step', cmd: 'step', icon: SkipForward, group: 'Run Control' },
  { label: 'Reset', cmd: 'reset', icon: RotateCcw, group: 'Run Control' },
  { label: 'Status', cmd: 'status', icon: Search, group: 'Run Control' },
  // Registers
  { label: 'Regs', cmd: 'reg', icon: Cpu, group: 'Registers' },
  { label: 'Where', cmd: 'where', icon: TerminalIcon, group: 'Registers' },
  // Memory
  { label: 'Read32', cmd: 'read32 ', icon: MemoryStick, group: 'Memory' },
  { label: 'Write32', cmd: 'write32 ', icon: MemoryStick, group: 'Memory' },
  // Flash
  { label: 'Load', cmd: 'load ', icon: Download, group: 'Flash' },
  { label: 'Erase', cmd: 'erase ', icon: Trash2, group: 'Flash' },
  { label: 'SaveMem', cmd: 'savemem ', icon: Upload, group: 'Flash' },
]

// 命令参考区的默认/最小/最大高度（px）
const REF_DEFAULT_HEIGHT = 500
const REF_MIN_HEIGHT = 120
const REF_MAX_HEIGHT = 600

/** 从 extra_help 中提取示例（以 "Examples:" 或 "Example" 开头的行） */
function extractExamples(extraHelp: string): string[] {
  if (!extraHelp) return []
  const lines = extraHelp.split('\n')
  const examples: string[] = []
  let inExamples = false
  for (const line of lines) {
    if (/^examples?:/i.test(line.trim())) {
      inExamples = true
      continue
    }
    if (inExamples) {
      const trimmed = line.trim()
      if (trimmed === '') {
        if (examples.length > 0) break
        continue
      }
      if (/^[A-Z]/.test(trimmed) && !trimmed.startsWith('$') && !trimmed.startsWith('!') && !trimmed.startsWith('>')) {
        break
      }
      examples.push(trimmed)
    }
  }
  return examples
}

export function CommandSidebar({
  onRunCommand,
  commands,
  connected,
  onClear,
  onResetContext,
}: CommandSidebarProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [showReference, setShowReference] = useState(false)
  const [exampleCmd, setExampleCmd] = useState<CommandInfo | null>(null)

  // 命令参考区高度（可拖拽拉伸）
  const [refHeight, setRefHeight] = useState(REF_DEFAULT_HEIGHT)
  const draggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  // 按分组组织快捷命令（保持定义顺序）
  const quickGroups = QUICK_COMMANDS.reduce<Record<string, QuickCommand[]>>((acc, cmd) => {
    ;(acc[cmd.group] ??= []).push(cmd)
    return acc
  }, {})

  // 按分类组织命令参考，分类名按字母排序
  const refGroups = commands.reduce<Record<string, CommandInfo[]>>((acc, cmd) => {
    const cat = cmd.category || 'other'
    ;(acc[cat] ??= []).push(cmd)
    return acc
  }, {})
  const sortedCategories = Object.keys(refGroups).sort((a, b) => a.localeCompare(b))

  // ── 拖拽拉伸命令参考区 ──────────────────
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      draggingRef.current = true
      startYRef.current = e.clientY
      startHeightRef.current = refHeight
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [refHeight]
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const delta = startYRef.current - e.clientY
      const newHeight = Math.max(
        REF_MIN_HEIGHT,
        Math.min(REF_MAX_HEIGHT, startHeightRef.current + delta)
      )
      setRefHeight(newHeight)
    }

    const handleMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  /** 复制文本到剪贴板 */
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }, [])

  /** 处理命令点击：可用则插入，不可用则全局提示 */
  const handleCommandClick = useCallback(
    (cmd: CommandInfo) => {
      const canRun = connected || !cmd.requires_connection
      if (!canRun) {
        toast.warning('该命令需要连接目标设备')
        return
      }
      onRunCommand(cmd.name + (cmd.usage ? ' ' : ''))
    },
    [connected, onRunCommand]
  )

  /** 处理示例点击：可用则插入，不可用则全局提示 */
  const handleExampleClick = useCallback(
    (example: string) => {
      const cmdText = example.replace(/^[>$!]\s*/, '')
      const cmdName = cmdText.split(/\s/)[0]
      const cmdInfo = commands.find((c) => c.name === cmdName)
      const requiresConn = cmdInfo?.requires_connection ?? true
      if (requiresConn && !connected) {
        toast.warning('该命令需要连接目标设备')
        return
      }
      onRunCommand(cmdText)
    },
    [connected, commands, onRunCommand]
  )

  return (
    <div className="flex h-full w-full flex-col bg-muted/30">
      {/* Header：清屏 + 重置上下文 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border p-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          className="h-7 flex-1 gap-1.5 text-xs"
          title="清屏 (Ctrl+L)"
        >
          <Eraser className="size-3.5 text-muted-foreground" />
          Clear
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!connected}
          onClick={onResetContext}
          className="h-7 flex-1 gap-1.5 text-xs"
          title="重置命令上下文（目标切换后使用）"
        >
          <Power className="size-3.5 text-muted-foreground" />
          Reset
        </Button>
      </div>

      {/* Quick Commands 区 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-2 py-1.5">
          <span className="px-1 text-xs font-medium text-muted-foreground">
            Quick Commands
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {Object.entries(quickGroups).map(([group, cmds]) => (
            <div key={group} className="mb-3">
              <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {group}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {cmds.map((cmd) => (
                  <Button
                    key={cmd.label}
                    variant="outline"
                    size="sm"
                    disabled={!connected}
                    onClick={() => onRunCommand(cmd.cmd)}
                    className="h-7 justify-start gap-1.5 px-2 text-xs"
                  >
                    <cmd.icon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{cmd.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Command Reference 区 */}
      <div
        className="shrink-0 border-t border-border bg-muted/50"
        style={{ height: showReference ? refHeight : 'auto' }}
      >
        {/* 拖拽条 */}
        {showReference && (
          <div
            onMouseDown={handleDragStart}
            className="flex h-1.5 cursor-row-resize items-center justify-center bg-border hover:bg-primary/40 transition-colors"
            title="拖拽调整高度"
          >
            <GripHorizontal className="size-3 text-muted-foreground/50" />
          </div>
        )}

        {/* 标题栏 */}
        <button
          onClick={() => setShowReference((v) => !v)}
          className="flex w-full items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium hover:bg-muted/40 transition-colors"
        >
          <ChevronRight
            className={cn('size-3 transition-transform', showReference && 'rotate-90')}
          />
          <BookOpen className="size-3.5 text-muted-foreground" />
          Command Reference
          <span className="ml-auto text-[10px] text-muted-foreground">{commands.length}</span>
        </button>

        {/* 命令列表 */}
        {showReference && (
          <div className="overflow-y-auto" style={{ height: refHeight - 44 }}>
            {sortedCategories.map((cat) => {
              const cmds = refGroups[cat]
              return (
                <div key={cat} className="border-b border-border/50 last:border-b-0">
                  {/* 分类标题 */}
                  <button
                    onClick={() =>
                      setExpandedCategory(expandedCategory === cat ? null : cat)
                    }
                    className="flex w-full items-center gap-1 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide hover:bg-muted/30 transition-colors"
                  >
                    <ChevronRight
                      className={cn(
                        'size-3 transition-transform',
                        expandedCategory === cat && 'rotate-90'
                      )}
                    />
                    {cat}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {cmds.length}
                    </span>
                  </button>

                  {/* 命令列表 */}
                  {expandedCategory === cat && (
                    <div className="pb-1">
                      {cmds.map((cmd) => {
                        const examples = extractExamples(cmd.extra_help)
                        const canRun = connected || !cmd.requires_connection
                        return (
                          <div
                            key={cmd.name}
                            className="group flex items-center gap-1 px-2 py-1 pl-4 transition-colors hover:bg-primary/5"
                          >
                            {/* 点击命令名插入命令（不执行） */}
                            <button
                              onClick={() => handleCommandClick(cmd)}
                              className={cn(
                                'flex min-w-0 flex-1 items-baseline gap-1 text-left',
                                !canRun && 'opacity-40'
                              )}
                            >
                              <code className="font-mono text-[11px] text-primary">
                                {cmd.name}
                              </code>
                              {cmd.usage && (
                                <span className="font-mono text-[10px] text-muted-foreground truncate">
                                  {cmd.usage}
                                </span>
                              )}
                            </button>
                            {/* 示例按钮（有示例时显示） */}
                            {examples.length > 0 && (
                              <button
                                onClick={() => setExampleCmd(cmd)}
                                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                title="查看示例"
                              >
                                <Lightbulb className="size-3 text-amber-500/70 hover:text-amber-500" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 示例弹窗 */}
      <Dialog open={!!exampleCmd} onOpenChange={(open) => !open && setExampleCmd(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <code className="font-mono text-primary text-base">
                {exampleCmd?.name}
              </code>
              {exampleCmd?.usage && (
                <span className="font-mono text-sm text-muted-foreground">
                  {exampleCmd.usage}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {exampleCmd && (
            <div className="space-y-3">
              {/* 完整说明 */}
              <div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {exampleCmd.help}
                </p>
                {exampleCmd.extra_help && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {exampleCmd.extra_help}
                  </p>
                )}
              </div>
              {/* 别名 */}
              {exampleCmd.aliases.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Aliases:</span>
                  <div className="flex gap-1">
                    {exampleCmd.aliases.map((alias) => (
                      <code key={alias} className="font-mono text-primary/80 bg-muted px-1.5 py-0.5 rounded">
                        {alias}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              {/* 示例列表 */}
              {extractExamples(exampleCmd.extra_help).length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Examples:
                  </div>
                  <div className="space-y-1">
                    {extractExamples(exampleCmd.extra_help).map((ex, idx) => {
                      const cmdName = ex.replace(/^[>$!]\s*/, '').split(/\s/)[0]
                      const cmdInfo = commands.find((c) => c.name === cmdName)
                      const canRunEx = connected || !(cmdInfo?.requires_connection ?? true)
                      return (
                        <div
                          key={idx}
                          className="group/ex flex items-center gap-2 rounded bg-muted/60 px-2 py-1"
                        >
                          <code className={cn(
                            'flex-1 font-mono text-xs break-all',
                            !canRunEx && 'opacity-40'
                          )}>
                            {ex}
                          </code>
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => copyToClipboard(ex.replace(/^[>$!]\s*/, ''))}
                              className="opacity-0 transition-opacity group-hover/ex:opacity-100"
                              title="复制"
                            >
                              <Copy className="size-3 text-muted-foreground hover:text-primary" />
                            </button>
                            <button
                              onClick={() => {
                                if (canRunEx) {
                                  handleExampleClick(ex)
                                  setExampleCmd(null)
                                } else {
                                  toast.warning('该命令需要连接目标设备')
                                }
                              }}
                              className={cn(
                                'opacity-0 transition-opacity group-hover/ex:opacity-100',
                                !canRunEx && 'cursor-not-allowed'
                              )}
                              title={canRunEx ? '插入命令' : '需要连接目标设备'}
                            >
                              <Play className={cn(
                                'size-3',
                                canRunEx ? 'text-primary' : 'text-muted-foreground/50'
                              )} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
