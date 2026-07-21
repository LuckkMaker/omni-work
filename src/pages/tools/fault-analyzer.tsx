import { useState, useCallback } from 'react'
import {
  Play,
  Eraser,
  RotateCcw,
  Square,
  ListOrdered,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProbeStore } from '@/stores/probe.store'
import { execCommand } from '@/services/commander.service'
import { cn } from '@/lib/utils'

// ── Cortex-M 故障寄存器地址 ──────────────────

const FAULT_ADDRS = {
  CFSR: 0xe000ed28,
  HFSR: 0xe000ed2c,
  DFSR: 0xe000ed30,
  MMFAR: 0xe000ed34,
  BFAR: 0xe000ed38,
  AFSR: 0xe000ed3c,
}

// ── 故障位定义 ──────────────────────────────────

interface FaultBit {
  bit: number
  name: string
  desc: string
}

const MMFSR_BITS: FaultBit[] = [
  { bit: 0, name: 'IACCVIOL', desc: '指令访问违例 — 取指时访问了 MPU 禁止的区域' },
  { bit: 1, name: 'DACCVIOL', desc: '数据访问违例 — 读写时访问了 MPU 禁止的区域' },
  { bit: 3, name: 'MUNSTKERR', desc: '异常返回出栈错误 — MemManage' },
  { bit: 4, name: 'MSTKERR', desc: '异常入栈错误 — MemManage' },
  { bit: 5, name: 'MLSPERR', desc: '浮点延迟栈错误 — MemManage' },
  { bit: 7, name: 'MMARVALID', desc: 'MMFAR 包含有效地址' },
]

const BFSR_BITS: FaultBit[] = [
  { bit: 8, name: 'IBUSERR', desc: '指令总线错误 — 取指时总线错误' },
  { bit: 9, name: 'PRECISERR', desc: '精确数据总线错误 — BFAR 包含有效地址' },
  { bit: 10, name: 'IMPRECISERR', desc: '不精确数据总线错误' },
  { bit: 11, name: 'UNSTKERR', desc: '异常返回出栈错误 — BusFault' },
  { bit: 12, name: 'STKERR', desc: '异常入栈错误 — BusFault' },
  { bit: 13, name: 'LSPERR', desc: '浮点延迟栈错误 — BusFault' },
  { bit: 15, name: 'BFARVALID', desc: 'BFAR 包含有效地址' },
]

const UFSR_BITS: FaultBit[] = [
  { bit: 16, name: 'UNDEFINSTR', desc: '未定义指令 — 执行了无效的指令编码' },
  { bit: 17, name: 'INVSTATE', desc: '无效 T 状态 — Thumb 位不正确' },
  { bit: 18, name: 'INVPC', desc: '异常返回 PC 无效 — LR 值非法' },
  { bit: 19, name: 'NOCP', desc: '协处理器不可用 — 尝试执行 FPU 指令但 FPU 未使能' },
  { bit: 20, name: 'STKOF', desc: '栈溢出 — 8 位递减栈计数器下溢 (ARMv8-M)' },
  { bit: 24, name: 'UNALIGNED', desc: '未对齐访问 — 产生了未对齐的内存访问' },
  { bit: 25, name: 'DIVBYZERO', desc: '除零错误 — 执行了 SDIV/UDIV 且除数为 0' },
]

const HFSR_BITS: FaultBit[] = [
  { bit: 1, name: 'VECTTBL', desc: '向量表读取失败 — 取异常向量时总线错误' },
  { bit: 30, name: 'FORCED', desc: '强制 HardFault — 可配置故障（MemManage/Bus/Usage）升级为 HardFault' },
  { bit: 31, name: 'DEBUGEVT', desc: '调试事件触发 — 调试器产生的 HardFault' },
]

// ── 类型 ──────────────────────────────────

interface RegState {
  cfsr: string
  hfsr: string
  mmfar: string
  bfar: string
}

interface StackFrame {
  r0: string
  r1: string
  r2: string
  r3: string
  r12: string
  lr: string
  pc: string
  xpsr: string
  sp: string
}

const EMPTY_REGS: RegState = { cfsr: '00000000', hfsr: '00000000', mmfar: '00000000', bfar: '00000000' }

// ── 主组件 ──────────────────────────────────

export default function FaultAnalyzer() {
  const [regs, setRegs] = useState<RegState>(EMPTY_REGS)
  const [stackFrame, setStackFrame] = useState<StackFrame | null>(null)
  const [loading, setLoading] = useState(false)
  const [regOutput, setRegOutput] = useState<string | null>(null)

  const selectedProbe = useProbeStore((s) => {
    const uid = s.selectedUid
    return uid ? s.probes.find((p) => p.uid === uid) ?? null : null
  })
  const isConnected = selectedProbe?.state === 'connected'
  const uid = selectedProbe?.uid ?? null

  const parseHex = (s: string): number => {
    const cleaned = s.trim().replace(/^0x/i, '')
    return parseInt(cleaned, 16) || 0
  }

  // ── 工具栏操作 ──────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!uid || !isConnected) return
    setLoading(true)
    try {
      const readReg = async (addr: number): Promise<string> => {
        const result = await execCommand(uid, `read32 0x${addr.toString(16)}`)
        const match = result.output.match(/0x([0-9a-fA-F]+)\s*$/m)
        return match ? match[1].padStart(8, '0').toLowerCase() : '00000000'
      }

      const [cfsr, hfsr, mmfar, bfar] = await Promise.all([
        readReg(FAULT_ADDRS.CFSR),
        readReg(FAULT_ADDRS.HFSR),
        readReg(FAULT_ADDRS.MMFAR),
        readReg(FAULT_ADDRS.BFAR),
      ])
      setRegs({ cfsr, hfsr, mmfar, bfar })

      // 读取 CPU 异常栈帧
      try {
        const mspResult = await execCommand(uid, 'reg msp')
        const mspMatch = mspResult.output.match(/0x([0-9a-fA-F]+)/)
        if (mspMatch) {
          const msp = parseInt(mspMatch[1], 16)
          const sfRegs = await Promise.all([
            execCommand(uid, `read32 0x${msp.toString(16)}`),
            execCommand(uid, `read32 0x${(msp + 4).toString(16)}`),
            execCommand(uid, `read32 0x${(msp + 8).toString(16)}`),
            execCommand(uid, `read32 0x${(msp + 12).toString(16)}`),
            execCommand(uid, `read32 0x${(msp + 16).toString(16)}`),
            execCommand(uid, `read32 0x${(msp + 20).toString(16)}`),
            execCommand(uid, `read32 0x${(msp + 24).toString(16)}`),
            execCommand(uid, `read32 0x${(msp + 28).toString(16)}`),
          ])
          const sfVals = sfRegs.map((r) => {
            const m = r.output.match(/0x([0-9a-fA-F]+)\s*$/m)
            return m ? m[1].padStart(8, '0').toLowerCase() : '00000000'
          })
          setStackFrame({
            r0: sfVals[0], r1: sfVals[1], r2: sfVals[2], r3: sfVals[3],
            r12: sfVals[4], lr: sfVals[5], pc: sfVals[6], xpsr: sfVals[7],
            sp: mspMatch[1].padStart(8, '0').toLowerCase(),
          })
        }
      } catch {
        // 读取栈帧失败，忽略
      }
    } catch {
      // 忽略
    } finally {
      setLoading(false)
    }
  }, [uid, isConnected])

  const handleClear = useCallback(() => {
    setRegs(EMPTY_REGS)
    setStackFrame(null)
  }, [])

  const handleReset = useCallback(async () => {
    if (!uid) return
    try {
      await execCommand(uid, 'reset')
    } catch {
      // 忽略
    }
  }, [uid])

  const handleHalt = useCallback(async () => {
    if (!uid) return
    try {
      await execCommand(uid, 'halt')
    } catch {
      // 忽略
    }
  }, [uid])

  const handleReg = useCallback(async () => {
    if (!uid) return
    try {
      const result = await execCommand(uid, 'reg')
      setRegOutput(result.output)
    } catch {
      // 忽略
    }
  }, [uid])

  // ── 派生值 ──────────────────────────────────

  const cfsrVal = parseHex(regs.cfsr)
  const hfsrVal = parseHex(regs.hfsr)
  const mmfarVal = parseHex(regs.mmfar)
  const bfarVal = parseHex(regs.bfar)

  const mmfsrVal = cfsrVal & 0xff
  const bfsrVal = (cfsrVal >> 8) & 0xff
  const ufsrVal = (cfsrVal >> 16) & 0xffff

  const mmarValid = (mmfsrVal >> 7) & 1
  const bfarValid = (bfsrVal >> 7) & 1

  const hasData = cfsrVal !== 0 || hfsrVal !== 0 || stackFrame !== null

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      {/* 工具栏 */}
      <div className="flex items-center gap-1 border-b border-border px-1 py-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          disabled={!isConnected || loading}
          onClick={handleAnalyze}
          className="h-8 gap-1.5"
        >
          {loading ? <RefreshCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          开始分析
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          variant="ghost"
          size="sm"
          disabled={!hasData}
          onClick={handleClear}
          className="h-8 gap-1.5"
        >
          <Eraser className="size-3.5" />
          清空数据
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          variant="ghost"
          size="sm"
          disabled={!isConnected}
          onClick={handleReset}
          className="h-8 gap-1.5"
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          variant="ghost"
          size="sm"
          disabled={!isConnected}
          onClick={handleHalt}
          className="h-8 gap-1.5"
        >
          <Square className="size-3.5" />
          Halt
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          variant="ghost"
          size="sm"
          disabled={!isConnected}
          onClick={handleReg}
          className="h-8 gap-1.5"
        >
          <ListOrdered className="size-3.5" />
          Reg
        </Button>
      </div>

      {/* 1. CPU capture during exception（第一部分） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CpuIcon />
            CPU capture during exception
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stackFrame ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                异常栈帧（从 MSP = 0x{stackFrame.sp} 读取）
              </div>
              <div className="grid grid-cols-4 gap-3">
                <StackReg label="R0" value={stackFrame.r0} />
                <StackReg label="R1" value={stackFrame.r1} />
                <StackReg label="R2" value={stackFrame.r2} />
                <StackReg label="R3" value={stackFrame.r3} />
                <StackReg label="R12" value={stackFrame.r12} />
                <StackReg label="LR" value={stackFrame.lr} highlight />
                <StackReg label="PC" value={stackFrame.pc} highlight />
                <StackReg label="xPSR" value={stackFrame.xpsr} />
              </div>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                <span className="text-muted-foreground">故障地址（PC）: </span>
                <span className="font-mono text-primary">0x{stackFrame.pc}</span>
                <span className="ml-4 text-muted-foreground">返回地址（LR）: </span>
                <span className="font-mono text-primary">0x{stackFrame.lr}</span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {isConnected
                ? '点击"开始分析"获取异常栈帧（需目标处于 halt 状态）'
                : '连接探针后可从目标读取异常栈帧'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Hard Faults */}
      <FaultSection
        title="Hard Faults"
        register="HFSR"
        value={hfsrVal}
        bits={HFSR_BITS}
        accent="destructive"
      />

      {/* 3. Usage Faults */}
      <FaultSection
        title="Usage Faults"
        register="UFSR"
        value={ufsrVal}
        bits={UFSR_BITS}
        accent="warning"
      />

      {/* 4. Bus Faults */}
      <FaultSection
        title="Bus Faults"
        register="BFSR"
        value={bfsrVal}
        bits={BFSR_BITS}
        accent="info"
      />

      {/* 5. Memory Management Faults */}
      <FaultSection
        title="Memory Management Faults"
        register="MMFSR"
        value={mmfsrVal}
        bits={MMFSR_BITS}
        accent="secondary"
      />

      {/* 辅助地址信息 */}
      {(mmarValid || bfarValid) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">故障地址</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mmarValid && (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">MMFAR</span>
                <span className="font-mono text-primary">0x{regs.mmfar}</span>
                <span className="text-xs text-muted-foreground">— Memory Management Fault 地址寄存器</span>
              </div>
            )}
            {bfarValid && (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">BFAR</span>
                <span className="font-mono text-primary">0x{regs.bfar}</span>
                <span className="text-xs text-muted-foreground">— Bus Fault 地址寄存器</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reg 弹窗 */}
      <Dialog open={regOutput !== null} onOpenChange={(v) => !v && setRegOutput(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>寄存器列表</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-y-auto rounded-md bg-muted/30 p-3 font-mono text-xs leading-relaxed">
            {regOutput}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── 子组件 ──────────────────────────────────

const accentMap = {
  destructive: { text: 'text-destructive', border: 'border-destructive/30', bg: 'bg-destructive/10' },
  warning: { text: 'text-yellow-600 dark:text-yellow-500', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10' },
  info: { text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10' },
  secondary: { text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
} as const

function CpuIcon() {
  return (
    <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </svg>
  )
}

function FaultSection({
  title,
  register,
  value,
  bits,
  accent,
}: {
  title: string
  register: string
  value: number
  bits: FaultBit[]
  accent: keyof typeof accentMap
}) {
  const colors = accentMap[accent]
  const activeBits = bits.filter((b) => (value >> b.bit) & 1)
  const hasFault = value !== 0

  return (
    <Card className={cn(hasFault && colors.border)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className={cn('flex items-center gap-2 text-sm', colors.text)}>
            {title}
            {hasFault && (
              <span className="flex items-center gap-1 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                {activeBits.length} flag(s) active
              </span>
            )}
          </CardTitle>
          <span className="font-mono text-xs text-muted-foreground">
            {register} = 0x{value.toString(16).padStart(8, '0').toUpperCase()}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {hasFault ? (
          <div className="space-y-1.5">
            {activeBits.map((b) => (
              <div
                key={b.bit}
                className="flex items-start gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm"
              >
                <span className={cn('font-mono text-xs font-bold', colors.text)}>
                  bit {b.bit}
                </span>
                <span className="font-mono text-xs font-medium">{b.name}</span>
                <span className="flex-1 text-xs text-muted-foreground">{b.desc}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-2 text-center text-xs text-muted-foreground">
            无 {title} 标志位
          </div>
        )}

        {/* 位域可视化 */}
        <div className="mt-3 flex flex-wrap gap-1">
          {bits.map((b) => {
            const isActive = (value >> b.bit) & 1
            return (
              <div
                key={b.bit}
                title={`${b.name}: ${b.desc}`}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded text-[10px] font-mono font-bold transition-colors',
                  isActive
                    ? cn(colors.bg, colors.text)
                    : 'bg-muted/30 text-muted-foreground'
                )}
              >
                {isActive ? '1' : '0'}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function StackReg({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'rounded-md border p-2',
      highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'
    )}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('font-mono text-sm font-medium', highlight && 'text-primary')}>
        0x{value}
      </div>
    </div>
  )
}
