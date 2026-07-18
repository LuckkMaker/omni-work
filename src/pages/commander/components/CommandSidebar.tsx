import { useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { CommandInfo } from '@/services/commander.service'

interface CommandSidebarProps {
  onRunCommand: (cmd: string) => void
  commands: CommandInfo[]
  connected: boolean
}

/** 快捷命令定义 */
interface QuickCommand {
  label: string
  cmd: string
  icon: typeof Play
  group: string
}

const QUICK_COMMANDS: QuickCommand[] = [
  // 运行控制
  { label: 'Halt', cmd: 'halt', icon: Square, group: '运行控制' },
  { label: 'Continue', cmd: 'continue', icon: Play, group: '运行控制' },
  { label: 'Step', cmd: 'step', icon: SkipForward, group: '运行控制' },
  { label: 'Reset', cmd: 'reset', icon: RotateCcw, group: '运行控制' },
  { label: 'Status', cmd: 'status', icon: Search, group: '运行控制' },
  // 寄存器
  { label: 'Regs (all)', cmd: 'reg', icon: Cpu, group: '寄存器' },
  { label: 'Where (PC)', cmd: 'where', icon: TerminalIcon, group: '寄存器' },
  // 内存
  { label: 'Read32', cmd: 'read32 ', icon: MemoryStick, group: '内存' },
  { label: 'Write32', cmd: 'write32 ', icon: MemoryStick, group: '内存' },
]

/** 命令分类中文映射 */
const CATEGORY_LABELS: Record<string, string> = {
  core: '核心控制',
  registers: '寄存器',
  memory: '内存',
  device: '设备',
  breakpoints: '断点',
  symbols: '符号',
  flash: 'Flash',
  dpap: '调试端口',
  other: '其他',
}

export function CommandSidebar({ onRunCommand, commands, connected }: CommandSidebarProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [showReference, setShowReference] = useState(false)

  // 按分组组织快捷命令
  const quickGroups = QUICK_COMMANDS.reduce<Record<string, QuickCommand[]>>((acc, cmd) => {
    ;(acc[cmd.group] ??= []).push(cmd)
    return acc
  }, {})

  // 按分类组织命令参考
  const refGroups = commands.reduce<Record<string, CommandInfo[]>>((acc, cmd) => {
    const cat = cmd.category || 'other'
    ;(acc[cat] ??= []).push(cmd)
    return acc
  }, {})

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-muted/30">
      {/* 快捷命令 */}
      <div className="border-b border-border p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">快捷命令</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(quickGroups).map(([group, cmds]) => (
          <div key={group} className="mb-3">
            <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground/70">{group}</div>
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

      {/* 命令参考 */}
      <div className="border-t border-border">
        <button
          onClick={() => setShowReference((v) => !v)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium hover:bg-muted/40 transition-colors"
        >
          <ChevronRight
            className={cn('size-3 transition-transform', showReference && 'rotate-90')}
          />
          <BookOpen className="size-3.5 text-muted-foreground" />
          命令参考
          <span className="ml-auto text-[10px] text-muted-foreground">{commands.length}</span>
        </button>
        {showReference && (
          <div className="max-h-[40vh] overflow-y-auto border-t border-border/50">
            {Object.entries(refGroups).map(([cat, cmds]) => (
              <div key={cat} className="border-b border-border/50 last:border-b-0">
                <button
                  onClick={() =>
                    setExpandedCategory(expandedCategory === cat ? null : cat)
                  }
                  className="flex w-full items-center gap-1 px-2 py-1.5 text-[11px] font-medium hover:bg-muted/30 transition-colors"
                >
                  <ChevronRight
                    className={cn(
                      'size-3 transition-transform',
                      expandedCategory === cat && 'rotate-90'
                    )}
                  />
                  {CATEGORY_LABELS[cat] ?? cat}
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
                          <code className="font-mono text-[11px] text-primary">{cmd.name}</code>
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
