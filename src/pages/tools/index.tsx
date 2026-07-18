import { NavLink, Outlet } from 'react-router-dom'
import { AlertOctagon, FileBarChart, Binary, FileCheck2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const toolsNav = [
  { to: '/tools/fault', label: 'Fault Analyzer', icon: AlertOctagon, desc: 'Cortex-M 故障寄存器解码' },
  { to: '/tools/map', label: 'Map Analyzer', icon: FileBarChart, desc: '链接映射文件分析' },
  { to: '/tools/number', label: 'Number Converter', icon: Binary, desc: '进制与位域转换' },
  { to: '/tools/checksum', label: 'File Checksum', icon: FileCheck2, desc: '文件校验和计算' },
]

export default function ToolsLayout() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* 二级导航 */}
      <div className="flex w-60 flex-col border-r border-border bg-card/50">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">工具</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">嵌入式开发辅助工具</p>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {toolsNav.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )
                }
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium">{item.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.desc}</div>
                </div>
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* 工具内容 */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
