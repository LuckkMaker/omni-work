/**
 * 设备配置弹窗
 *
 * 参考 J-Link MCU 配置界面，展示目标设备的核心信息。
 * 布局：
 * 1. 目标设备（型号、厂商、内核、大小端、Core ID）
 * 2. 目标 RAM（基地址、大小）
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { TargetInfo, DeviceInfo } from '@shared/types'

interface DeviceConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: TargetInfo | null
  deviceInfo?: DeviceInfo
}

export function DeviceConfigDialog({ open, onOpenChange, target, deviceInfo }: DeviceConfigDialogProps) {
  const partNumber = target?.part_number ?? deviceInfo?.part_number ?? 'Unknown'
  const displayName = deviceInfo?.display_name ?? partNumber
  const vendor = deviceInfo?.vendor ?? '-'
  // 内核信息：优先从 device_info.json 获取（更具体，如 "Cortex-M4"）
  const core = deviceInfo?.core ?? target?.core ?? '-'
  const endian = target?.endian ?? 'Little'

  // Core ID（仅连接后可用，从 DPIDR 读取）
  const coreId = target?.core_id ?? ''

  // Device ID 和 Revision ID（仅连接后可用，从 DBGMCU_IDCODE 读取）
  const deviceId = target?.device_id ?? ''
  const revisionId = target?.revision_id ?? ''

  // RAM 信息：基地址优先从 device_info.json 获取
  const ramBaseAddress = deviceInfo?.ram_base_address ?? (target?.ram_start ? `0x${target.ram_start.toString(16).toUpperCase().padStart(8, '0')}` : '-')
  const ramSizeBytes = target?.ram_size ?? (deviceInfo ? deviceInfo.ram_size * 1024 : 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>设备配置</DialogTitle>
          <DialogDescription>
            目标设备信息和配置
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 目标设备 */}
          <Section title="目标设备">
            <Row label="厂商" value={vendor} />
            <Row label="设备" value={partNumber} mono />
            <Row label="内核" value={core} />
            <Row label="大小端" value={endian === 'Little' ? 'Little Endian' : 'Big Endian'} />
            <Row label="Core ID" value={coreId || '-'} mono />
            <Row label="Device ID" value={deviceId || '-'} mono />
            <Row label="Revision ID" value={revisionId || '-'} mono />
          </Section>

          {/* 目标 RAM */}
          <Section title="目标 RAM">
            <Row label="基地址" value={ramBaseAddress} mono />
            <Row label="大小" value={ramSizeBytes ? formatSize(ramSizeBytes) : '-'} />
          </Section>

          {!target && !deviceInfo && (
            <div className="text-center text-sm text-muted-foreground py-8">
              暂无设备信息，连接仿真器后可加载实时数据
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-muted-foreground mb-1.5">{title}</h4>
      <div className="rounded-md border bg-muted/20 divide-y divide-border/50">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={mono ? 'font-mono' : ''}>{value}</span>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
