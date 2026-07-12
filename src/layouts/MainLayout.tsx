import { NavLink, Outlet } from 'react-router-dom'
import { Zap, Terminal, Radio, Activity, Settings, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/flash', label: 'Flash', icon: Zap },
  { to: '/commander', label: 'Commander', icon: Terminal },
  { to: '/rtt', label: 'RTT Viewer', icon: Radio },
  { to: '/swo', label: 'SWO Viewer', icon: Activity },
  { to: '/scope', label: 'Scope', icon: Cpu },
  { to: '/settings', label: '设置', icon: Settings }
]

export default function MainLayout() {
  return (
    <div className="flex h-screen w-full">
      <aside className="flex w-56 flex-col border-r border-border bg-muted/30">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold">
            DW
          </div>
          <span className="text-sm font-semibold">DAPLink Work</span>
        </div>
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
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          v0.1.0
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
