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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
const REF_DEFAULT_HEIGHT = 200
const REF_MIN_HEIGHT = 80
const REF_MAX_HEIGHT = 500

export function CommandSidebar({
  onRunCommand,
  commands,
  connected,
  onClear,
  onResetContext,
}: CommandSidebarProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [showReference, setShowReference] = useState(false)

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
      // 向上拖增大高度（deltaY 为负）
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

      {/* Quick Commands 区（flex-1 撑满剩余空间） */}
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

      {/* Command Reference 区（固定底部，可向上拉伸） */}
      <div
        className="shrink-0 border-t border-border bg-muted/50"
        style={{ height: showReference ? refHeight : 'auto' }}
      >
        {/* 拖拽条（仅展开时显示） */}
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

        {/* 命令列表（可滚动） */}
        {showReference && (
          <div className="overflow-y-auto" style={{ height: refHeight - 44 }}>
            {sortedCategories.map((cat) => {
              const cmds = refGroups[cat]
              return (
                <div key={cat} className="border-b border-border/50 last:border-b-0">
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
                  {expandedCategory === cat && (
                    <div className="pb-1">
                      {cmds.map((cmd) => (
                        <button
                          key={cmd.name}
                          onClick={() => onRunCommand(cmd.name + (cmd.usage ? ' ' : ''))}
                          disabled={!connected}
                          className="block w-full px-2 py-1 pl-6 text-left transition-colors hover:bg-primary/5 disabled:opacity-50"
                          title={cmd.help}
                        >
                          <div className="flex items-baseline gap-1">
                            <code className="font-mono text-[11px] text-primary">
                              {cmd.name}
                            </code>
                            {cmd.usage && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {cmd.usage}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] leading-tight text-muted-foreground truncate">
                            {cmd.help}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
