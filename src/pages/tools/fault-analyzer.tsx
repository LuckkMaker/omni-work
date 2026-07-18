import { useState, useCallback } from 'react'
import { Cpu, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

// MMFSR — Memory Management Fault Status Register (CFSR bits 0-7)
const MMFSR_BITS: FaultBit[] = [
  { bit: 0, name: 'IACCVIOL', desc: '指令访问违例 — 取指时访问了 MPU 禁止的区域' },
  { bit: 1, name: 'DACCVIOL', desc: '数据访问违例 — 读写时访问了 MPU 禁止的区域' },
  { bit: 3, name: 'MUNSTKERR', desc: '异常返回出栈错误 — MemManage' },
  { bit: 4, name: 'MSTKERR', desc: '异常入栈错误 — MemManage' },
  { bit: 5, name: 'MLSPERR', desc: '浮点延迟栈错误 — MemManage' },
  { bit: 7, name: 'MMARVALID', desc: 'MMFAR 包含有效地址' },
]

// BFSR — Bus Fault Status Register (CFSR bits 8-15)
const BFSR_BITS: FaultBit[] = [
  { bit: 8, name: 'IBUSERR', desc: '指令总线错误 — 取指时总线错误' },
  { bit: 9, name: 'PRECISERR', desc: '精确数据总线错误 — BFAR 包含有效地址' },
  { bit: 10, name: 'IMPRECISERR', desc: '不精确数据总线错误' },
  { bit: 11, name: 'UNSTKERR', desc: '异常返回出栈错误 — BusFault' },
  { bit: 12, name: 'STKERR', desc: '异常入栈错误 — BusFault' },
  { bit: 13, name: 'LSPERR', desc: '浮点延迟栈错误 — BusFault' },
  { bit: 15, name: 'BFARVALID', desc: 'BFAR 包含有效地址' },
]

// UFSR — Usage Fault Status Register (CFSR bits 16-31)
const UFSR_BITS: FaultBit[] = [
  { bit: 16, name: 'UNDEFINSTR', desc: '未定义指令 — 执行了无效的指令编码' },
  { bit: 17, name: 'INVSTATE', desc: '无效 T 状态 — Thumb 位不正确' },
  { bit: 18, name: 'INVPC', desc: '异常返回 PC 无效 — LR 值非法' },
  { bit: 19, name: 'NOCP', desc: '协处理器不可用 — 尝试执行 FPU 指令但 FPU 未使能' },
  { bit: 20, name: 'STKOF', desc: '栈溢出 — 8 位递减栈计数器下溢 (ARMv8-M)' },
  { bit: 24, name: 'UNALIGNED', desc: '未对齐访问 — 产生了未对齐的内存访问' },
  { bit: 25, name: 'DIVBYZERO', desc: '除零错误 — 执行了 SDIV/UDIV 且除数为 0' },
]

// HFSR — Hard Fault Status Register
const HFSR_BITS: FaultBit[] = [
  { bit: 1, name: 'VECTTBL', desc: '向量表读取失败 — 取异常向量时总线错误' },
  { bit: 30, name: 'FORCED', desc: '强制 HardFault — 可配置故障（MemManage/Bus/Usage）升级为 HardFault' },
  { bit: 31, name: 'DEBUGEVT', desc: '调试事件触发 — 调试器产生的 HardFault' },
]

// ── 组件 ──────────────────────────────────

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

export default function FaultAnalyzer() {
  const [regs, setRegs] = useState<RegState>({
    cfsr: '00000000',
    hfsr: '00000000',
    mmfar: '00000000',
    bfar: '00000000',
  })
  const [stackFrame, setStackFrame] = useState<StackFrame | null>(null)
  const [loading, setLoading] = useState(false)

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

  const handleReadFromTarget = useCallback(async () => {
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

      // 尝试读取 CPU 异常栈帧（需要目标处于 halt 状态）
      try {
        // 读取 MSP
        const mspResult = await execCommand(uid, 'reg msp')
        const mspMatch = mspResult.output.match(/0x([0-9a-fA-F]+)/)
        if (mspMatch) {
          const msp = parseInt(mspMatch[1], 16)
          // 异常栈帧位于 MSP 指向的地址
          // 偏移: R0(0), R1(4), R2(8), R3(12), R12(16), LR(20), PC(24), xPSR(28)
          const sfRegs = await Promise.all([
            execCommand(uid, `read32 0x${msp.toString(16)}`),         // R0
            execCommand(uid, `read32 0x${(msp + 4).toString(16)}`),    // R1
            execCommand(uid, `read32 0x${(msp + 8).toString(16)}`),    // R2
            execCommand(uid, `read32 0x${(msp + 12).toString(16)}`),   // R3
            execCommand(uid, `read32 0x${(msp + 16).toString(16)}`),   // R12
            execCommand(uid, `read32 0x${(msp + 20).toString(16)}`),   // LR
            execCommand(uid, `read32 0x${(msp + 24).toString(16)}`),   // PC
            execCommand(uid, `read32 0x${(msp + 28).toString(16)}`),   // xPSR
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

  const cfsrVal = parseHex(regs.cfsr)
  const hfsrVal = parseHex(regs.hfsr)
  const mmfarVal = parseHex(regs.mmfar)
  const bfarVal = parseHex(regs.bfar)

  // 分解 CFSR
  const mmfsrVal = cfsrVal & 0xff         // bits 0-7
  const bfsrVal = (cfsrVal >> 8) & 0xff   // bits 8-15
  const ufsrVal = (cfsrVal >> 16) & 0xffff // bits 16-31

  const mmarValid = (mmfsrVal >> 7) & 1
  const bfarValid = (bfsrVal >> 7) & 1

  const hasFault = cfsrVal !== 0 || hfsrVal !== 0

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      {/* 顶层寄存器输入 */}
      <div className="flex items-end justify-between gap-3">
        <div className="grid flex-1 grid-cols-4 gap-3">
        <RegInput
          label="CFSR"
          addr={FAULT_ADDRS.CFSR}
          value={regs.cfsr}
          onChange={(v) => setRegs({ ...regs, cfsr: v })}
        />
        <RegInput
          label="HFSR"
          addr={FAULT_ADDRS.HFSR}
          value={regs.hfsr}
          onChange={(v) => setRegs({ ...regs, hfsr: v })}
        />
        <RegInput
          label="MMFAR"
          addr={FAULT_ADDRS.MMFAR}
          value={regs.mmfar}
          onChange={(v) => setRegs({ ...regs, mmfar: v })}
          dimmed={!mmarValid}
        />
        <RegInput
          label="BFAR"
          addr={FAULT_ADDRS.BFAR}
          value={regs.bfar}
          onChange={(v) => setRegs({ ...regs, bfar: v })}
          dimmed={!bfarValid}
        />
        </div>
        <Button
          onClick={handleReadFromTarget}
          disabled={!isConnected || loading}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          {loading ? <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" /> : <Cpu className="mr-1.5 h-4 w-4" />}
          {loading ? '读取中...' : '从目标读取'}
        </Button>
      </div>

      {/* Hard Faults */}
      <FaultSection
        title="Hard Faults"
        register="HFSR"
        value={hfsrVal}
        bits={HFSR_BITS}
        accentColor="text-red-500"
        borderColor="border-red-500/30"
      />

      {/* Usage Faults */}
      <FaultSection
        title="Usage Faults"
        register="UFSR"
        value={ufsrVal}
        bits={UFSR_BITS}
        accentColor="text-amber-500"
        borderColor="border-amber-500/30"
      />

      {/* Bus Faults */}
      <FaultSection
        title="Bus Faults"
        register="BFSR"
        value={bfsrVal}
        bits={BFSR_BITS}
        accentColor="text-cyan-500"
        borderColor="border-cyan-500/30"
      />

      {/* Memory Management Faults */}
      <FaultSection
        title="Memory Management Faults"
        register="MMFSR"
        value={mmfsrVal}
        bits={MMFSR_BITS}
        accentColor="text-purple-500"
        borderColor="border-purple-500/30"
      />

      {/* CPU capture during exception */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4 text-blue-500" />
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
              <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-3 text-sm">
                <span className="text-muted-foreground">故障地址（PC）: </span>
                <span className="font-mono text-blue-500">0x{stackFrame.pc}</span>
                <span className="ml-4 text-muted-foreground">返回地址（LR）: </span>
                <span className="font-mono text-blue-500">0x{stackFrame.lr}</span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {isConnected
                ? '点击"从目标读取"获取异常栈帧（需目标处于 halt 状态）'
                : '连接探针后可从目标读取异常栈帧'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── 子组件 ──────────────────────────────────

function RegInput({
  label,
  addr,
  value,
  onChange,
  dimmed,
}: {
  label: string
  addr: number
  value: string
  onChange: (v: string) => void
  dimmed?: boolean
}) {
  return (
    <div className={cn(dimmed && 'opacity-40')}>
      <Label className="mb-1 flex items-center justify-between text-xs">
        <span className="font-mono font-medium">{label}</span>
        <span className="text-muted-foreground">@0x{addr.toString(16).padStart(8, '0').toUpperCase()}</span>
      </Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">0x</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
          placeholder="00000000"
          className="pl-8 font-mono text-sm"
        />
      </div>
    </div>
  )
}

function FaultSection({
  title,
  register,
  value,
  bits,
  accentColor,
  borderColor,
}: {
  title: string
  register: string
  value: number
  bits: FaultBit[]
  accentColor: string
  borderColor: string
}) {
  const activeBits = bits.filter((b) => (value >> b.bit) & 1)
  const hasFault = value !== 0

  return (
    <Card className={cn(borderColor, hasFault && 'border')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className={cn('flex items-center gap-2 text-sm', accentColor)}>
            {title}
            {hasFault && (
              <span className="flex items-center gap-1 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
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
                <span className={cn('font-mono text-xs font-bold', accentColor)}>
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
                    ? cn('bg-opacity-20', accentColor.replace('text-', 'bg-'))
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
      highlight ? 'border-blue-500/40 bg-blue-500/5' : 'border-border bg-muted/20'
    )}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('font-mono text-sm font-medium', highlight && 'text-blue-500')}>
        0x{value}
      </div>
    </div>
  )
}
