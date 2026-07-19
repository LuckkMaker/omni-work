import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useUiStore, TERMINAL_THEMES } from '@/stores/ui.store'

export default function SettingsPage() {
  const terminalThemeId = useUiStore((s) => s.terminalThemeId)
  const setTerminalTheme = useUiStore((s) => s.setTerminalTheme)
  const currentTheme = TERMINAL_THEMES.find((t) => t.id === terminalThemeId)

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
          <CardTitle>终端</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">终端配色主题</Label>
            <Select
              value={terminalThemeId}
              onValueChange={(v) => setTerminalTheme(v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_THEMES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentTheme && (
              <div className="flex items-center gap-3 pt-2">
                <span className="text-xs text-muted-foreground">预览：</span>
                <div
                  className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-xs"
                  style={{
                    backgroundColor: currentTheme.theme.background,
                    color: currentTheme.theme.foreground,
                  }}
                >
                  <span style={{ color: currentTheme.theme.cyan }}>root@omni</span>
                  <span>:</span>
                  <span style={{ color: currentTheme.theme.blue }}>~</span>
                  <span style={{ color: currentTheme.theme.green }}>$</span>
                  <span>ls -la</span>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-1">
              主题会应用到 Commander 和 RTT Viewer 的终端。选择后立即生效并持久化保存。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
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
