import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Usb, Cpu, MemoryStick } from 'lucide-react'
import { useProbeStore, SPEED_OPTIONS } from '@/stores/probe.store'

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

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value ?? '-'}</span>
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
    <div className="space-y-3">
      {/* 接口信息 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Usb className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">接口信息</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <InfoRow label="接口类型" value={pendingInterface.toUpperCase()} />
          <InfoRow label="速度" value={speedLabel} />
          <InfoRow label="状态" value={isConnected ? '已连接' : '未连接'} />
        </CardContent>
      </Card>

      {/* 目标设备信息 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">目标设备信息</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <InfoRow label="设备" value={deviceInfo?.display_name ?? target?.part_number} />
          <InfoRow label="制造商" value={deviceInfo?.vendor} />
          <InfoRow label="内核" value={target?.core} />
          <InfoRow label="大小端" value={target?.endian ?? 'Little'} />
          <InfoRow label="Core ID" value={target?.core_id} />
          <InfoRow label="Target RAM" value={deviceInfo ? `${formatKb(deviceInfo.ram_size)} (${deviceInfo.ram_base_address})` : null} />
        </CardContent>
      </Card>

      {/* Flash 信息 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <MemoryStick className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Flash 信息</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <InfoRow label="Bank" value="Bank 1" />
          <InfoRow label="基地址" value={target ? formatHex(target.flash_start) : (deviceInfo?.flash_base_address ?? null)} />
          <InfoRow label="大小" value={target ? formatSize(target.flash_size) : (deviceInfo ? formatKb(deviceInfo.flash_size) : null)} />
          <InfoRow label="Page 大小" value={target ? formatSize(target.page_size) : null} />
          <InfoRow label="Sector 大小" value={target ? formatSize(target.sector_size) : null} />
        </CardContent>
      </Card>
    </div>
  )
}
