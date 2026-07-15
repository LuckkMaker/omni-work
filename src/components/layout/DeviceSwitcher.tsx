import { useEffect } from 'react'
import { Usb, ChevronsUpDown, Check, RefreshCw, Plug, PlugZap, Cpu, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import type { ProbeState } from '@shared/types'

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

  const selectedProbe = getSelectedProbe()
  const target = getSelectedTarget()
  const isConnected = selectedProbe?.state === 'connected'
  const isTargetIdentified =
    !!target && target.part_number !== 'cortex_m' && target.flash_size > 0

  // 加载目标芯片列表
  useEffect(() => {
    if (targetList.length === 0) {
      fetchTargets()
    }
  }, [targetList.length, fetchTargets])

  return (
    <DropdownMenu>
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
                  : '点击选择探针'}
            </div>
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)" align="start" sideOffset={4}>
        {/* 探针列表 */}
        <DropdownMenuLabel>已检测到的探针</DropdownMenuLabel>
        {probes.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {loadingProbes ? '扫描中...' : '未检测到探针'}
          </div>
        ) : (
          probes.map((probe) => {
            const isSelected = probe.uid === selectedUid
            return (
              <DropdownMenuItem
                key={probe.uid}
                onClick={() => selectProbe(probe.uid)}
              >
                <Check className={cn('size-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{formatProbeName(probe.product, probe.vendor)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {probe.vendor} · {stateLabel[probe.state]}
                  </div>
                </div>
                {probe.state === 'connected' && (
                  <Badge variant={stateVariant[probe.state]} className="ml-auto">
                    连
                  </Badge>
                )}
              </DropdownMenuItem>
            )
          })
        )}

        <DropdownMenuSeparator />

        {/* 刷新按钮 */}
        <DropdownMenuItem onClick={() => fetchProbes()}>
          <RefreshCw className={cn('size-4', loadingProbes && 'animate-spin')} />
          刷新设备列表
        </DropdownMenuItem>

        {/* 连接/断开 */}
        {selectedProbe && (
          <>
            <DropdownMenuSeparator />
            {isConnected ? (
              <DropdownMenuItem
                onClick={() => disconnectProbe(selectedProbe.uid)}
                disabled={connecting}
              >
                <Plug className="size-4" />
                断开连接
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => connectProbe(selectedProbe.uid)}
                disabled={connecting || selectedProbe.state === 'connecting'}
              >
                <PlugZap className="size-4" />
                {selectedProbe.state === 'connecting' ? '连接中...' : '连接探针'}
              </DropdownMenuItem>
            )}
          </>
        )}

        {/* MCU 型号选择子菜单 */}
        {selectedProbe && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
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
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
