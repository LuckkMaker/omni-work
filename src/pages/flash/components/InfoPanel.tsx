import { useState } from 'react'
import { Usb, Cpu, MemoryStick, ChevronRight } from 'lucide-react'
import { useProbeStore, SPEED_OPTIONS } from '@/stores/probe.store'
import { cn } from '@/lib/utils'

function formatHex(addr: number): string {
  return `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatKb(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`
  return `${kb} KB`
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2 py-0.5 text-[11px] leading-tight">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-right truncate">{value ?? '-'}</span>
    </div>
  )
}

function CollapsibleSection({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 hover:bg-muted/30 transition-colors"
      >
        <ChevronRight className={cn('size-3 transition-transform shrink-0', open && 'rotate-90')} />
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-xs font-medium truncate">{title}</span>
      </button>
      {open && <div className="px-2 pb-1.5 pl-6">{children}</div>}
    </div>
  )
}

export function InfoPanel() {
  const {
    getSelectedProbe,
    getSelectedTarget,
    getDeviceInfo,
    pendingInterface,
    pendingSpeed,
  } = useProbeStore()

  const probe = getSelectedProbe()
  const target = getSelectedTarget()
  const isConnected = probe?.state === 'connected'
  const deviceInfo = target ? getDeviceInfo(target.part_number) : undefined
  const speedLabel = SPEED_OPTIONS.find((s) => s.value === pendingSpeed)?.label ?? `${pendingSpeed} Hz`

  return (
    <div className="overflow-y-auto">
      <CollapsibleSection icon={<Usb className="size-3" />} title="接口信息">
        <Row label="接口" value={pendingInterface.toUpperCase()} />
        <Row label="速度" value={speedLabel} />
        <Row label="状态" value={isConnected ? '已连接' : '未连接'} />
      </CollapsibleSection>

      <CollapsibleSection icon={<Cpu className="size-3" />} title="目标设备" defaultOpen>
        <Row label="设备" value={deviceInfo?.display_name ?? target?.part_number} />
        <Row label="厂商" value={deviceInfo?.vendor} />
        <Row label="内核" value={target?.core} />
        <Row label="大小端" value={target?.endian ?? 'Little'} />
        <Row label="Core ID" value={target?.core_id} />
        <Row label="RAM" value={deviceInfo ? `${formatKb(deviceInfo.ram_size)} (${deviceInfo.ram_base_address})` : null} />
      </CollapsibleSection>

      <CollapsibleSection icon={<MemoryStick className="size-3" />} title="Flash 信息">
        <Row label="Bank" value="Bank 1" />
        <Row label="基地址" value={target ? formatHex(target.flash_start) : (deviceInfo?.flash_base_address ?? null)} />
        <Row label="大小" value={target ? formatSize(target.flash_size) : (deviceInfo ? formatKb(deviceInfo.flash_size) : null)} />
        <Row label="Page" value={target ? formatSize(target.page_size) : null} />
        <Row label="Sector" value={target ? formatSize(target.sector_size) : null} />
      </CollapsibleSection>
    </div>
  )
}
