import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useEffect, useMemo, useState } from 'react'
import { useUiStore, TERMINAL_THEMES } from '@/stores/ui.store'
import { systemService, type SystemInfo } from '@/services/system.service'
import { Loader2, AlertTriangle } from 'lucide-react'

export default function SettingsPage() {
  const terminalThemeId = useUiStore((s) => s.terminalThemeId)
  const setTerminalTheme = useUiStore((s) => s.setTerminalTheme)
  const currentTheme = TERMINAL_THEMES.find((t) => t.id === terminalThemeId)

  // 主题下拉选项按字母顺序排列
  const sortedThemes = useMemo(
    () => [...TERMINAL_THEMES].sort((a, b) => a.name.localeCompare(b.name, 'en')),
    [],
  )

  // ── 关于：系统信息加载 ──
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [sysLoading, setSysLoading] = useState(true)
  const [sysError, setSysError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSysLoading(true)
    setSysError(null)
    systemService
      .getInfo()
      .then((info) => {
        if (!cancelled) setSysInfo(info)
      })
      .catch((e) => {
        if (cancelled) return
        const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          ?? (e instanceof Error ? e.message : String(e))
        setSysError(detail)
      })
      .finally(() => {
        if (!cancelled) setSysLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
                {sortedThemes.map((t) => (
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

      {/* 关于：应用版本、后端版本、数据库版本、数据库路径 */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>关于</CardTitle>
        </CardHeader>
        <CardContent>
          {sysLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在加载系统信息...
            </div>
          ) : sysError ? (
            <div className="flex items-start gap-2 text-sm text-red-500">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">加载系统信息失败</div>
                <div className="text-xs mt-0.5 break-all">{sysError}</div>
              </div>
            </div>
          ) : sysInfo ? (
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">应用版本</dt>
              <dd className="font-mono">v{__APP_VERSION__}</dd>

              <dt className="text-muted-foreground">后端版本</dt>
              <dd className="font-mono break-all">{sysInfo.backend_version || '—'}</dd>

              <dt className="text-muted-foreground">数据库版本</dt>
              <dd className="font-mono break-all">{sysInfo.db_version || '—'}</dd>

              <dt className="text-muted-foreground">数据库路径</dt>
              <dd className="font-mono text-xs break-all">{sysInfo.db_path || '—'}</dd>
            </dl>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
