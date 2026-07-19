import { useState } from 'react'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useMonitorStore } from '@/stores/monitor.store'
import { useNotificationStore } from '@/stores/notification.store'
import { monitorService, type MonitorVarType } from '@/services/monitor.service'
import { cn } from '@/lib/utils'

interface Props {
  uid: string | null
}

/** 列定义：Name / Address / Type / Value / Refresh(s) / Remark */
const VAR_TYPES: MonitorVarType[] = [
  'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'float',
]

export function WatchPanel({ uid }: Props) {
  const variables = useMonitorStore((s) => s.variables)
  const samples = useMonitorStore((s) => s.samples)
  const running = useMonitorStore((s) => s.running)
  const removeVariable = useMonitorStore((s) => s.removeVariable)
  const updateVariable = useMonitorStore((s) => s.updateVariable)
  const pushNotification = useNotificationStore((s) => s.push)

  const [collapsed, setCollapsed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // 取最新值
  const lastSample = samples[samples.length - 1]
  const lastValues = new Map<string, number | null>()
  if (lastSample) {
    for (const v of lastSample.values) lastValues.set(v.id, v.value)
  }
  const prevValues = new Map<string, number | null>()
  const prev = samples[samples.length - 2]
  if (prev) {
    for (const v of prev.values) prevValues.set(v.id, v.value)
  }

  const handleRemove = async (id: string) => {
    if (!uid) return
    try {
      await monitorService.removeVariable(uid, id)
      removeVariable(id)
    } catch (e) {
      pushNotification({
        type: 'error', title: '移除失败',
        message: e instanceof Error ? e.message : String(e),
        autoClose: true, autoCloseDelay: 3000,
      })
    }
  }

  const handleWriteValue = async (id: string) => {
    if (!uid) return
    const val = parseInt(editValue, editValue.startsWith('0x') ? 16 : 10)
    if (isNaN(val)) {
      pushNotification({
        type: 'warning', title: '无效的值', message: '请输入十进制或 0x 前缀的十六进制',
        autoClose: true, autoCloseDelay: 3000,
      })
      return
    }
    try {
      await monitorService.writeVariable(uid, id, val)
      setEditingId(null)
    } catch (e) {
      pushNotification({
        type: 'error', title: '写入失败',
        message: e instanceof Error ? e.message : String(e),
        autoClose: true, autoCloseDelay: 3000,
      })
    }
  }

  if (collapsed) {
    return (
      <button
        className="flex h-5 items-center justify-center border-t border-border text-[10px] text-muted-foreground hover:bg-muted/30"
        onClick={() => setCollapsed(false)}
      >
        <ChevronUp className="size-3" /> Watch
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 标题栏 + 折叠 */}
      <div
        className="flex items-center justify-between border-b border-border bg-muted/30 px-2 py-1 cursor-pointer"
        onClick={() => setCollapsed(true)}
      >
        <span className="text-xs font-medium">Watch 监视面板</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </div>

      {/* 表格 */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Name</th>
              <th className="px-2 py-1 text-left font-medium w-28">Address</th>
              <th className="px-2 py-1 text-left font-medium w-16">Type</th>
              <th className="px-2 py-1 text-right font-medium w-24">Value</th>
              <th className="px-2 py-1 text-center font-medium w-20">Refresh(s)</th>
              <th className="px-2 py-1 text-left font-medium">Remark</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {variables.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                  暂无监视变量
                </td>
              </tr>
            ) : variables.map((v, i) => {
              const val = lastValues.get(v.id)
              const prevVal = prevValues.get(v.id)
              const changed = running && val !== undefined && prevVal !== undefined && val !== prevVal
              return (
                <tr
                  key={v.id}
                  className={cn(
                    'border-b border-border/50',
                    i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                >
                  <td className="px-2 py-1 truncate" title={v.name}>{v.name}</td>
                  <td className="px-2 py-1 font-mono">0x{v.address.toString(16).toUpperCase().padStart(8, '0')}</td>
                  <td className="px-2 py-1 font-mono">{v.type}</td>
                  <td
                    className={cn(
                      'px-2 py-1 text-right font-mono tabular-nums transition-colors',
                      changed && 'bg-primary/10',
                      editingId === v.id && 'p-0'
                    )}
                    onDoubleClick={() => { setEditingId(v.id); setEditValue('') }}
                  >
                    {editingId === v.id ? (
                      <input
                        className="w-full bg-background px-2 py-1 text-right font-mono outline-none ring-1 ring-primary"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleWriteValue(v.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={() => setEditingId(null)}
                        placeholder={val?.toString() ?? ''}
                      />
                    ) : val === undefined ? '—' : val === null ? 'N/A' : val}
                  </td>
                  <td className="px-2 py-1 text-center font-mono">
                    {v.refresh_sec > 0 ? v.refresh_sec.toFixed(3) : '—'}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="w-full bg-transparent text-xs outline-none focus:bg-background focus:ring-1 focus:ring-primary rounded px-1"
                      value={v.remark}
                      onChange={(e) => updateVariable(v.id, { remark: e.target.value })}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-1">
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(v.id)}
                      title="移除变量"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {running && (
        <div className="border-t border-border bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
          双击 Value 单元格修改变量值 · {samples.length} 个采样点
        </div>
      )}
    </div>
  )
}
