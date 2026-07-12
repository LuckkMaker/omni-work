import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useBackendStatus } from '@/hooks/useBackendStatus'

export default function FlashPage() {
  const { status, port } = useBackendStatus()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Flash 烧录</h1>
        <p className="text-sm text-muted-foreground mt-1">
          固件烧录、擦除、校验
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>后端状态</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant={status ? 'default' : 'destructive'}>
              {status ? '运行中' : '未连接'}
            </Badge>
            {port && (
              <span className="text-sm text-muted-foreground">
                Python 后端端口: {port}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
