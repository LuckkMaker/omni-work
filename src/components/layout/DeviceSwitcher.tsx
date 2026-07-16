import { useEffect, useState } from 'react'
import { Usb, ChevronsUpDown, Check, RefreshCw, Cpu, Plug, PlugZap, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { TargetDeviceDialog } from '@/components/TargetDeviceDialog'
import { useProbeStore } from '@/stores/probe.store'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import type { ProbeState, ProbeWithState } from '@shared/types'

const stateLabel: Record<ProbeState, string> = {
  disconnected: '未连接',
  connecting: '连接中',
  connected: '已连接',
  error: '错误',
}

const stateVariant: Record<ProbeState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  disconnected: 'outline',
  connecting: 'secondary',
  connected: 'default',
  error: 'destructive',
}

function formatProbeName(product: string, vendor: string): string {
  if (product && product !== 'Unknown') return product
  if (vendor && vendor !== 'Unknown') return vendor
  return 'DAPLink'
}

export function DeviceSwitcher() {
  const {
    probes,
    selectedUid,
    deviceList,
    connecting,
    loadingProbes,
    fetchProbes,
    fetchDevices,
    selectProbe,
    connectProbe,
    disconnectProbe,
    setTarget,
    getSelectedProbe,
    getSelectedTarget,
    getDeviceInfo,
  } = useProbeStore()

  const { status } = useBackendStatus()
  const selectedProbe = getSelectedProbe()
  const target = getSelectedTarget()
  const isConnected = selectedProbe?.state === 'connected'

  // 当前设备显示名：优先从设备目录取 display_name，否则用 part_number
  const currentDeviceName = target
    ? getDeviceInfo(target.part_number)?.display_name ?? target.part_number
    : null

  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false)

  // 后端就绪后加载设备目录
  useEffect(() => {
    if (status && deviceList.length === 0) {
      fetchDevices()
    }
  }, [status, deviceList.length, fetchDevices])

  // 点击仿真器项：选中 + 自动连接/断开切换
  const handleProbeClick = (probe: ProbeWithState) => {
    selectProbe(probe.uid)
    if (probe.state === 'connected') {
      disconnectProbe(probe.uid)
    } else if (probe.state === 'disconnected' || probe.state === 'error') {
      connectProbe(probe.uid)
    }
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open && status) fetchProbes() }}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent data-[state=open]:bg-accent"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
              <Usb className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {selectedProbe
                  ? formatProbeName(selectedProbe.product, selectedProbe.vendor)
                  : '未选择设备'}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {currentDeviceName
                  ? currentDeviceName
                  : selectedProbe
                    ? stateLabel[selectedProbe.state]
                    : '点击选择仿真器'}
              </div>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)" align="start" sideOffset={4}>
          {/* 仿真器列表 */}
          <DropdownMenuLabel>
            <span>已检测到的仿真器</span>
            {loadingProbes && <RefreshCw className="ml-2 inline size-3 animate-spin text-muted-foreground" />}
          </DropdownMenuLabel>
          {probes.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {loadingProbes ? '扫描中...' : '未检测到仿真器'}
            </div>
          ) : (
            probes.map((probe) => {
              const isSelected = probe.uid === selectedUid
              const probeConnected = probe.state === 'connected'
              const probeConnecting = probe.state === 'connecting'
              return (
                <DropdownMenuItem
                  key={probe.uid}
                  onClick={() => handleProbeClick(probe)}
                  disabled={probeConnecting || connecting}
                >
                  <Check className={cn('size-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{formatProbeName(probe.product, probe.vendor)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {probe.vendor} · {stateLabel[probe.state]}
                    </div>
                  </div>
                  {probeConnected ? (
                    <Plug className="size-4 shrink-0 text-primary" />
                  ) : probeConnecting ? (
                    <PlugZap className="size-4 shrink-0 text-muted-foreground animate-pulse" />
                  ) : null}
                </DropdownMenuItem>
              )
            })
          )}

          {/* 目标设备选择（始终显示，点击打开弹窗） */}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDeviceDialogOpen(true)}>
            <Cpu className="size-4" />
            <span>目标设备...</span>
            {currentDeviceName && (
              <Badge variant="outline" className="ml-auto">
                {currentDeviceName}
              </Badge>
            )}
            <ChevronRight className="size-4 text-muted-foreground" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 目标设备选择弹窗 */}
      <TargetDeviceDialog
        open={deviceDialogOpen}
        onOpenChange={setDeviceDialogOpen}
        deviceList={deviceList}
        currentPartNumber={target?.part_number ?? null}
        onConfirm={(partNumber) => setTarget(partNumber)}
        disabled={!isConnected || connecting}
      />
    </>
  )
}
