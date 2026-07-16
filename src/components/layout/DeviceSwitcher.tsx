import { useEffect, useState } from 'react'
import { Usb, ChevronsUpDown, RefreshCw, Cpu, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TargetDeviceDialog } from '@/components/TargetDeviceDialog'
import { useProbeStore, SPEED_OPTIONS } from '@/stores/probe.store'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import type { ProbeState } from '@shared/types'

const stateLabel: Record<ProbeState, string> = {
  disconnected: '未连接',
  connecting: '连接中',
  connected: '已连接',
  error: '错误',
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
    pendingTarget,
    pendingInterface,
    pendingSpeed,
    fetchProbes,
    fetchDevices,
    selectProbe,
    connectProbe,
    disconnectProbe,
    setPendingTarget,
    setPendingInterface,
    setPendingSpeed,
    getSelectedProbe,
    getSelectedTarget,
    getDeviceInfo,
  } = useProbeStore()

  const { status } = useBackendStatus()
  const selectedProbe = getSelectedProbe()
  const target = getSelectedTarget()
  const isConnected = selectedProbe?.state === 'connected'

  // 当前设备显示名
  const currentDeviceName = target
    ? getDeviceInfo(target.part_number)?.display_name ?? target.part_number
    : pendingTarget
      ? getDeviceInfo(pendingTarget)?.display_name ?? pendingTarget
      : null

  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 后端就绪后加载设备目录
  useEffect(() => {
    if (status && deviceList.length === 0) {
      fetchDevices()
    }
  }, [status, deviceList.length, fetchDevices])

  // 打开配置弹窗时刷新仿真器列表
  const handleConfigOpen = (open: boolean) => {
    setConfigDialogOpen(open)
    if (open && status) {
      fetchProbes()
    }
  }

  // 确认按钮：连接/断开切换
  const handleConfirm = () => {
    if (!selectedProbe) return
    // 断开操作不需要检查目标设备
    if (selectedProbe.state === 'connected') {
      disconnectProbe(selectedProbe.uid)
      setConfigDialogOpen(false)
      setErrorMsg(null)
      return
    }
    // 连接前必须选择目标设备
    if (!pendingTarget) {
      setErrorMsg('请先选择目标设备')
      return
    }
    if (selectedProbe.state === 'disconnected' || selectedProbe.state === 'error') {
      connectProbe(selectedProbe.uid)
      setConfigDialogOpen(false)
      setErrorMsg(null)
    }
  }

  return (
    <>
      {/* 侧边栏顶部触发按钮 */}
      <button
        onClick={() => handleConfigOpen(true)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
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

      {/* 配置弹窗 */}
      <Dialog open={configDialogOpen} onOpenChange={handleConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>连接配置</DialogTitle>
          </DialogHeader>

          {/* 仿真器选择 + 刷新 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">仿真器</span>
              <Button variant="ghost" size="sm" onClick={() => fetchProbes()} disabled={loadingProbes}>
                <RefreshCw className={cn('size-4', loadingProbes && 'animate-spin')} />
              </Button>
            </div>
            <Select
              value={selectedUid ?? ''}
              onValueChange={(v) => selectProbe(v)}
              disabled={probes.length === 0}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={loadingProbes ? '扫描中...' : '未检测到仿真器'} />
              </SelectTrigger>
              <SelectContent>
                {probes.map((probe) => (
                  <SelectItem key={probe.uid} value={probe.uid}>
                    {formatProbeName(probe.product, probe.vendor)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 目标设备 */}
          <div className="space-y-2">
            <span className="text-sm font-medium">目标设备</span>
            <button
              onClick={() => { setDeviceDialogOpen(true); setErrorMsg(null) }}
              className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span className={currentDeviceName ? 'font-medium' : 'text-muted-foreground'}>
                {currentDeviceName ?? '点击选择目标设备'}
              </span>
              <Cpu className="size-4 text-muted-foreground" />
            </button>
            {errorMsg && (
              <p className="text-xs text-red-500">{errorMsg}</p>
            )}
          </div>

          {/* 接口 + 速度 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-sm font-medium">接口</span>
              <Select value={pendingInterface} onValueChange={(v) => setPendingInterface(v as 'swd' | 'jtag')}>
                <SelectTrigger className="h-9" disabled={isConnected}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="swd">SWD</SelectItem>
                  <SelectItem value="jtag">JTAG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">速度</span>
              <Select value={String(pendingSpeed)} onValueChange={(v) => setPendingSpeed(Number(v))}>
                <SelectTrigger className="h-9" disabled={isConnected}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEED_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 确认按钮 */}
          {selectedProbe && (
            <div className="flex justify-end pt-2">
              <Button
                className="gap-2"
                variant={isConnected ? 'outline' : 'default'}
                onClick={handleConfirm}
                disabled={connecting || selectedProbe.state === 'connecting'}
              >
                {connecting ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Wifi className="size-4" />
                )}
                确认
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 目标设备选择弹窗（二级） */}
      <TargetDeviceDialog
        open={deviceDialogOpen}
        onOpenChange={setDeviceDialogOpen}
        deviceList={deviceList}
        currentPartNumber={pendingTarget}
        onConfirm={(partNumber) => setPendingTarget(partNumber)}
      />
    </>
  )
}
