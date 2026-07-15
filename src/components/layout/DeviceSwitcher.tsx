import { useEffect } from 'react'
import { Usb, ChevronsUpDown, Check, RefreshCw, Cpu, Plug, PlugZap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
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
    targetList,
    connecting,
    loadingProbes,
    fetchProbes,
    fetchTargets,
    selectProbe,
    connectProbe,
    disconnectProbe,
    setTarget,
    getSelectedProbe,
    getSelectedTarget,
  } = useProbeStore()

  const { status } = useBackendStatus()
  const selectedProbe = getSelectedProbe()
  const target = getSelectedTarget()
  const isConnected = selectedProbe?.state === 'connected'
  const isTargetIdentified =
    !!target && target.part_number !== 'cortex_m' && target.flash_size > 0

  // 后端就绪后加载目标芯片列表
  useEffect(() => {
    if (status && targetList.length === 0) {
      fetchTargets()
    }
  }, [status, targetList.length, fetchTargets])

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
              {isTargetIdentified
                ? target.part_number
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

        {/* MCU 型号选择子菜单（始终显示，未连接时禁用选择） */}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Cpu className="size-4" />
            MCU 型号
            {isTargetIdentified && (
              <Badge variant="outline" className="ml-auto">
                {target.part_number}
              </Badge>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
            {targetList.map((t) => (
              <DropdownMenuItem
                key={t}
                onClick={() => setTarget(t)}
                disabled={!isConnected || connecting}
              >
                <Check
                  className={cn(
                    'size-4',
                    target?.part_number === t ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
