import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          全局配置
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>常规</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">暂无可配置项</p>
        </CardContent>
      </Card>
    </div>
  )
}
