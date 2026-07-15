import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { useProbeWs } from '@/hooks/useProbeWs'
import { useProbeStore } from '@/stores/probe.store'
import { ProbeSelector } from './components/ProbeSelector'
import { TargetSelector } from './components/TargetSelector'
import { X } from 'lucide-react'

export default function FlashPage() {
  const { status, port } = useBackendStatus()

  // 初始化 WebSocket 事件订阅
  useProbeWs(port)

  const { fetchProbes, error, clearError } = useProbeStore()

  // 后端就绪后自动拉取探针列表
  useEffect(() => {
    if (status) {
      fetchProbes()
    }
  }, [status, fetchProbes])

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Flash 烧录</h1>
        <p className="text-sm text-muted-foreground mt-1">
          固件烧录、擦除、校验
        </p>
      </div>

      {/* 后端状态 */}
      <Card className="mb-4">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Badge variant={status ? 'default' : 'destructive'}>
              {status ? '后端运行中' : '后端未连接'}
            </Badge>
            {port && (
              <span className="text-sm text-muted-foreground">
                端口: {port}
              </span>
            )}
          </div>
          {!status && (
            <span className="text-sm text-muted-foreground">
              等待 Python 后端启动...
            </span>
          )}
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Card className="mb-4 border-destructive">
          <CardContent className="flex items-center justify-between py-3">
            <span className="text-sm text-destructive">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={clearError}
            >
              <X className="size-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 探针选择 + 目标信息 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProbeSelector />
        <TargetSelector />
      </div>
    </div>
  )
}
