import { Plus, X, Cpu, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useFlashStore } from '@/stores/flash.store'
import { cn } from '@/lib/utils'

export function TabBar() {
  const { tabs, activeTabId, selectTab, closeTab, openFileTab, addDeviceTab } = useFlashStore()

  return (
    <div className="flex items-center gap-0.5 border-b border-border px-1 py-1 shrink-0 overflow-x-auto">
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          onClick={() => selectTab(tab.id)}
          className={cn(
            'group flex items-center gap-1.5 px-2.5 py-1 rounded-t-md cursor-pointer text-xs whitespace-nowrap transition-colors border-b-2',
            activeTabId === tab.id
              ? 'bg-primary/10 text-primary border-primary font-medium'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/30'
          )}
        >
          {tab.type === 'device' ? (
            <Cpu className="size-3 shrink-0" />
          ) : (
            <FileText className="size-3 shrink-0" />
          )}
          <span>{tab.title}</span>
          {tab.loading && <span className="size-2 rounded-full bg-blue-500 animate-pulse" />}
          {/* 第一个 Device Memory tab 不可关闭 */}
          {!(tab.type === 'device' && index === 0) && (
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              className="ml-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}

      {/* "+" 按钮下拉菜单 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
            <Plus className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={openFileTab}>
            <FileText className="size-3.5 mr-1.5" />
            Open File...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={addDeviceTab}>
            <Cpu className="size-3.5 mr-1.5" />
            New Device Memory
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
