import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Zap, Terminal, Radio, Settings, Cpu, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { useProbeWs } from '@/hooks/useProbeWs'
import { useProbeStore } from '@/stores/probe.store'
import { resetApiClient } from '@/services/api'
import { DeviceSwitcher } from '@/components/layout/DeviceSwitcher'
import { InfoPanel } from '@/pages/flash/components/InfoPanel'
import { StatusBar } from '@/components/layout/StatusBar'
import { NotificationContainer } from '@/components/NotificationContainer'

const navItems = [
  { to: '/flash', label: 'Flash', icon: Zap },
  { to: '/commander', label: 'Commander', icon: Terminal },
  { to: '/rtt', label: 'RTT Viewer', icon: Radio },
  { to: '/monitor', label: 'Monitor', icon: Cpu },
  { to: '/tools', label: 'Tools', icon: Wrench },
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
    <div className="flex h-screen w-full flex-col">
      <div className="flex flex-1 min-h-0">
        <aside className="flex w-56 flex-col border-r border-border bg-muted/30">
          {/* 设备选择器（替代原来的品牌区） */}
          <div className="border-b border-border p-2">
            <DeviceSwitcher />
          </div>

          {/* 导航菜单（占据剩余空间，可滚动） */}
          <nav className="flex-1 min-h-0 overflow-y-auto space-y-1 p-3">
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

          {/* 全局信息面板（固定在侧边栏底端，仅设备信息和Flash信息） */}
          <div className="shrink-0 max-h-[45%] overflow-y-auto border-t border-border">
            <InfoPanel />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="border-t border-border p-2">
              <div className="flex items-center justify-between rounded-md border border-destructive/50 px-2 py-1.5">
                <span className="truncate text-xs text-destructive">{error}</span>
                <button
                  className="shrink-0 text-xs text-destructive/70 hover:text-destructive"
                  onClick={clearError}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </aside>
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* 底部状态栏（类似 VSCode） */}
      <StatusBar />

      {/* 全局通知容器 */}
      <NotificationContainer />
    </div>
  )
}
