import { useState, useCallback } from 'react'
import { AlertOctagon, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProbeStore } from '@/stores/probe.store'
import { execCommand } from '@/services/commander.service'
import { cn } from '@/lib/utils'

// ── Cortex-M 故障寄存器定义 ──────────────────

const CFSR_BITS: Record<number, string> = {
  0: 'IACCVIOL — 指令访问违例（MemManage）',
  1: 'DACCVIOL — 数据访问违例（MemManage）',
  3: 'MUNSTKERR — 异常返回出栈错误（MemManage）',
  4: 'MSTKERR — 异常入栈错误（MemManage）',
  5: 'MLSPERR — 浮点延迟栈错误（MemManage）',
  7: 'MMARVALID — MMFAR 包含有效地址',
  8: 'IBUSERR — 指令总线错误（BusFault）',
  9: 'PRECISERR — 精确数据总线错误（BusFault）',
  10: 'IMPRECISERR — 不精确数据总线错误（BusFault）',
  11: 'UNSTKERR — 异常返回出栈错误（BusFault）',
  12: 'STKERR — 异常入栈错误（BusFault）',
  13: 'LSPERR — 浮点延迟栈错误（BusFault）',
  15: 'BFARVALID — BFAR 包含有效地址',
  16: 'UNDEFINSTR — 未定义指令（UsageFault）',
  17: 'INVSTATE — 无效 T 状态（UsageFault）',
  18: 'INVPC — 异常返回 PC 无效（UsageFault）',
  19: 'NOCP — 协处理器不可用（UsageFault）',
  20: 'STKOF — 栈溢出（UsageFault, ARMv8-M）',
  24: 'UNALIGNED — 未对齐访问（UsageFault）',
  25: 'DIVBYZERO — 除零错误（UsageFault）',
}

const HFSR_BITS: Record<number, string> = {
  1: 'VECTTBL — 向量表读取失败',
  30: 'FORCED — 强制 HardFault（可配置故障升级）',
  31: 'DEBUGEVT — 调试事件触发',
}

const FAULT_ADDRS = {
  CFSR: 0xe000ed28,
  HFSR: 0xe000ed2c,
  MMFAR: 0xe000ed34,
  BFAR: 0xe000ed38,
  AFSR: 0xe000ed3c,
}

interface RegState {
  cfsr: string
  hfsr: string
  mmfar: string
  bfar: string
}

export default function FaultAnalyzer() {
  const [regs, setRegs] = useState<RegState>({
    cfsr: '',
    hfsr: '',
    mmfar: '',
    bfar: '',
  })
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
      // 通过 Commander 的 read32 命令读取故障寄存器
      const readReg = async (addr: number): Promise<string> => {
        const result = await execCommand(uid, `read32 0x${addr.toString(16)}`)
        // pyOCD 输出格式: "0xe000ed28: 0x00000000"
        const match = result.output.match(/0x([0-9a-fA-F]+)\s*$/m)
        return match ? match[1].padStart(8, '0') : '00000000'
      }
      const [cfsr, hfsr, mmfar, bfar] = await Promise.all([
        readReg(FAULT_ADDRS.CFSR),
        readReg(FAULT_ADDRS.HFSR),
        readReg(FAULT_ADDRS.MMFAR),
        readReg(FAULT_ADDRS.BFAR),
      ])
      setRegs({ cfsr, hfsr, mmfar, bfar })
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

  const activeCfsrBits = Object.entries(CFSR_BITS)
    .filter(([bit]) => (cfsrVal >> Number(bit)) & 1)
    .map(([bit, desc]) => ({ bit: Number(bit), desc }))

  const activeHfsrBits = Object.entries(HFSR_BITS)
    .filter(([bit]) => (hfsrVal >> Number(bit)) & 1)
    .map(([bit, desc]) => ({ bit: Number(bit), desc }))

  const hasFault = cfsrVal !== 0 || hfsrVal !== 0
  const mmarValid = (cfsrVal >> 7) & 1
  const bfarValid = (cfsrVal >> 15) & 1

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertOctagon className="h-6 w-6 text-orange-500" />
          <div>
            <h1 className="text-xl font-bold">Fault Analyzer</h1>
            <p className="text-sm text-muted-foreground">Cortex-M 故障寄存器解码与分析</p>
          </div>
        </div>
        <Button
          onClick={handleReadFromTarget}
          disabled={!isConnected || loading}
          variant="outline"
          size="sm"
        >
          <Cpu className="mr-1.5 h-4 w-4" />
          {loading ? '读取中...' : '从目标读取'}
        </Button>
      </div>

      {/* 寄存器输入 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">故障寄存器</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
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
        </CardContent>
      </Card>

      {/* 分析结果 */}
      {hasFault ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              故障分析结果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* CFSR 解码 */}
            {activeCfsrBits.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">CFSR — 可配置故障状态</h3>
                <div className="space-y-1.5">
                  {activeCfsrBits.map(({ bit, desc }) => (
                    <div key={bit} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-sm">
                      <span className="font-mono text-xs text-orange-500">bit {bit}</span>
                      <span>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HFSR 解码 */}
            {activeHfsrBits.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">HFSR — HardFault 状态</h3>
                <div className="space-y-1.5">
                  {activeHfsrBits.map(({ bit, desc }) => (
                    <div key={bit} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-sm">
                      <span className="font-mono text-xs text-red-500">bit {bit}</span>
                      <span>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 故障地址 */}
            {(mmarValid || bfarValid) && (
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">故障地址</h3>
                <div className="flex gap-4">
                  {mmarValid && (
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">MMFAR: </span>
                      <span className="font-mono">0x{mmfarVal.toString(16).padStart(8, '0')}</span>
                    </div>
                  )}
                  {bfarValid && (
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">BFAR: </span>
                      <span className="font-mono">0x{bfarVal.toString(16).padStart(8, '0')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 故障类型推断 */}
            <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
              <h3 className="mb-1 text-xs font-medium text-orange-500">故障类型推断</h3>
              <p className="text-sm">{inferFaultType(cfsrVal, hfsrVal)}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-12">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">输入故障寄存器值或从目标读取</p>
            <p className="mt-1 text-xs text-muted-foreground">CFSR / HFSR 全为 0 时无故障</p>
          </div>
        </div>
      )}
    </div>
  )
}

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
        <span className="text-muted-foreground">0x{addr.toString(16).padStart(8, '0').toUpperCase()}</span>
      </Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">0x</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
          placeholder="00000000"
          className="pl-8 font-mono"
        />
      </div>
    </div>
  )
}

function inferFaultType(cfsr: number, hfsr: number): string {
  const forced = (hfsr >> 30) & 1
  const vecttbl = (hfsr >> 1) & 1
  const debugevt = (hfsr >> 31) & 1

  if (vecttbl) return '向量表读取失败 — 检查向量表是否正确映射到地址 0x00000000'
  if (debugevt) return '调试事件触发的 HardFault — 检查调试配置'

  const iaccviol = cfsr & 1
  const daccviol = (cfsr >> 1) & 1
  const ibuserr = (cfsr >> 8) & 1
  const preciserr = (cfsr >> 9) & 1
  const impreciserr = (cfsr >> 10) & 1
  const undefinstr = (cfsr >> 16) & 1
  const invstate = (cfsr >> 17) & 1
  const invpc = (cfsr >> 18) & 1
  const unaligned = (cfsr >> 24) & 1
  const divbyzero = (cfsr >> 25) & 1

  if (forced) {
    if (iaccviol || daccviol) return 'MemManage 故障升级为 HardFault — 可能访问了 MPU 保护的区域'
    if (ibuserr || preciserr || impreciserr) return 'BusFault 升级为 HardFault — 可能访问了无效地址或外设未使能'
    if (undefinstr) return 'UsageFault 升级为 HardFault — 执行了未定义指令，检查函数指针'
    if (invstate) return 'UsageFault 升级为 HardFault — 无效的 Thumb 状态，检查函数指针声明'
    if (invpc) return 'UsageFault 升级为 HardFault — 异常返回 PC 无效'
    if (unaligned) return 'UsageFault 升级为 HardFault — 未对齐的内存访问'
    if (divbyzero) return 'UsageFault 升级为 HardFault — 除零错误'
  }
  return '检测到故障状态位，请查看上方详细解码'
}
