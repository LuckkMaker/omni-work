import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Cpu, CheckCircle2, AlertCircle } from 'lucide-react'
import { useProbeStore } from '@/stores/probe.store'
import { useBackendStatus } from '@/hooks/useBackendStatus'

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
    selectedUid,
    targetList,
    connecting,
    getSelectedProbe,
    getSelectedTarget,
    setTarget,
    fetchTargets,
  } = useProbeStore()

  const probe = getSelectedProbe()
  const target = getSelectedTarget()
  const isConnected = probe?.state === 'connected'
  const { status } = useBackendStatus()

  const [manualTarget, setManualTarget] = useState<string>('')

  // 后端就绪后加载目标芯片列表
  useEffect(() => {
    if (status && targetList.length === 0) {
      fetchTargets()
    }
  }, [status, targetList.length, fetchTargets])

  // 判断目标是否已正确识别（非通用 cortex_m 且有 Flash 信息）
  const isTargetIdentified =
    !!target && target.part_number !== 'cortex_m' && target.flash_size > 0

  // 当目标已正确识别时清空手动选择
  useEffect(() => {
    if (isTargetIdentified) {
      setManualTarget('')
    }
  }, [isTargetIdentified])

  // 未选中仿真器
  if (!probe) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-muted-foreground" />
            <CardTitle>目标信息</CardTitle>
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
            <CardTitle>目标信息</CardTitle>
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

  // 已连接 — 目标已正确识别
  if (isTargetIdentified && target) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="size-5 text-muted-foreground" />
              <CardTitle>目标信息</CardTitle>
            </div>
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="size-3" />
              已识别
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted-foreground">MCU</dt>
            <dd className="font-medium">{target.part_number}</dd>

            <dt className="text-muted-foreground">Core</dt>
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
        </CardContent>
      </Card>
    )
  }

  // 已连接 — 目标未识别，手动选择
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="size-5 text-muted-foreground" />
            <CardTitle>目标信息</CardTitle>
          </div>
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="size-3" />
            未识别
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            自动识别失败，请手动选择 MCU 型号：
          </p>
          <Select value={manualTarget} onValueChange={setManualTarget}>
            <SelectTrigger>
              <SelectValue placeholder="选择 MCU 型号..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {targetList.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            className="w-full"
            disabled={!manualTarget || connecting}
            onClick={() => manualTarget && setTarget(manualTarget)}
          >
            {connecting ? '设置中...' : '设置目标'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
