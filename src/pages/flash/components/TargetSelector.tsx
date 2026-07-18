import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Cpu, CheckCircle2 } from 'lucide-react'
import { useProbeStore } from '@/stores/probe.store'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatHex(addr: number): string {
  return `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`
}

export function TargetSelector() {
  const {
    getSelectedProbe,
    getSelectedTarget,
    getDeviceInfo,
  } = useProbeStore()

  const probe = getSelectedProbe()
  const target = getSelectedTarget()
  const isConnected = probe?.state === 'connected'

  // 设备目录中的显示名
  const deviceInfo = target ? getDeviceInfo(target.part_number) : undefined
  const displayName = deviceInfo?.display_name ?? target?.part_number

  // 未选中仿真器
  if (!probe) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-muted-foreground" />
            <CardTitle>目标设备</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            请先选择仿真器
          </div>
        </CardContent>
      </Card>
    )
  }

  // 仿真器未连接
  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-muted-foreground" />
            <CardTitle>目标设备</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            请先连接仿真器
          </div>
        </CardContent>
      </Card>
    )
  }

  // 已连接 — 显示目标设备信息
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-muted-foreground" />
            <CardTitle>目标设备</CardTitle>
          </div>
          {target && (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="size-3" />
              已连接
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {target ? (
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted-foreground">设备</dt>
            <dd className="font-medium">{displayName}</dd>

            <dt className="text-muted-foreground">制造商</dt>
            <dd className="font-medium">{deviceInfo?.vendor ?? '-'}</dd>

            <dt className="text-muted-foreground">内核</dt>
            <dd className="font-medium">{target.core}</dd>

            <dt className="text-muted-foreground">Flash 起始</dt>
            <dd className="font-mono font-medium">{formatHex(target.flash_start)}</dd>

            <dt className="text-muted-foreground">Flash 大小</dt>
            <dd className="font-medium">{formatSize(target.flash_size)}</dd>

            <dt className="text-muted-foreground">Page 大小</dt>
            <dd className="font-medium">{formatSize(target.page_size)}</dd>

            <dt className="text-muted-foreground">Sector 大小</dt>
            <dd className="font-medium">{formatSize(target.sector_size)}</dd>
          </dl>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            请在侧边栏选择目标设备
          </div>
        )}
      </CardContent>
    </Card>
  )
}
