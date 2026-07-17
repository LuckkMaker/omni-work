import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Zap, Terminal, Radio, Activity, Settings, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { useProbeWs } from '@/hooks/useProbeWs'
import { useProbeStore } from '@/stores/probe.store'
import { resetApiClient } from '@/services/api'
import { DeviceSwitcher } from '@/components/layout/DeviceSwitcher'
import { NotificationContainer } from '@/components/NotificationContainer'

const navItems = [
  { to: '/flash', label: 'Flash', icon: Zap },
  { to: '/commander', label: 'Commander', icon: Terminal },
  { to: '/rtt', label: 'RTT Viewer', icon: Radio },
  { to: '/swo', label: 'SWO Viewer', icon: Activity },
  { to: '/scope', label: 'Scope', icon: Cpu },
  { to: '/settings', label: '设置', icon: Settings }
]

export default function MainLayout() {
  // 全局后端状态 + WebSocket 初始化（所有页面共享）
  const { status, port } = useBackendStatus()
  useProbeWs(port)

  const { fetchProbes, fetchTargets, error, clearError } = useProbeStore()

  // 后端就绪后重置 API 客户端并拉取仿真器列表和目标列表
  useEffect(() => {
    if (status) {
      resetApiClient()
      fetchProbes()
      fetchTargets()
    }
  }, [status, fetchProbes, fetchTargets])

  return (
    <div className="flex h-screen w-full">
      <aside className="flex w-56 flex-col border-r border-border bg-muted/30">
        {/* 设备选择器（替代原来的品牌区） */}
        <div className="border-b border-border p-2">
          <DeviceSwitcher />
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* 底部：后端状态 + 错误提示 */}
        <div className="border-t border-border p-3 space-y-2">
          {error && (
            <div className="flex items-center justify-between rounded-md border border-destructive/50 px-2 py-1.5">
              <span className="truncate text-xs text-destructive">{error}</span>
              <button
                className="shrink-0 text-xs text-destructive/70 hover:text-destructive"
                onClick={clearError}
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Badge variant={status ? 'default' : 'destructive'} className="text-[10px]">
              {status ? '后端在线' : '后端离线'}
            </Badge>
            <span className="text-xs text-muted-foreground">v0.1.0</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* 全局通知容器 */}
      <NotificationContainer />
    </div>
  )
}
