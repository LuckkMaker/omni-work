import { useState } from 'react'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useMonitorStore } from '@/stores/monitor.store'
import { useNotificationStore } from '@/stores/notification.store'
import { monitorService } from '@/services/monitor.service'
import { cn } from '@/lib/utils'

interface Props {
  uid: string | null
}

/**
 * Watch 监视面板
 *
 * 表头：Color | Name | Address | Size | Type | Value | Min | Max | Moving Average | Y Resolution | Y Offset | 操作
 * 其中 Min/Max/Moving Average/Y Resolution/Y Offset 属通道显示配置（ChannelConfig），
 * 可随变量配置一起持久化（JSON），与波形采样数据解耦。
 */
export function WatchPanel({ uid }: Props) {
  const variables = useMonitorStore((s) => s.variables)
  const channels = useMonitorStore((s) => s.channels)
  const samples = useMonitorStore((s) => s.samples)
  const running = useMonitorStore((s) => s.running)
  const removeVariable = useMonitorStore((s) => s.removeVariable)
  const setChannel = useMonitorStore((s) => s.setChannel)
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

      {/* 表格（列多，横向滚动） */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr>
              <th className="border border-border px-1.5 py-1 text-left font-medium w-10">Color</th>
              <th className="border border-border px-2 py-1 text-left font-medium">Name</th>
              <th className="border border-border px-2 py-1 text-left font-medium w-24">Address</th>
              <th className="border border-border px-1.5 py-1 text-center font-medium w-10">Size</th>
              <th className="border border-border px-1.5 py-1 text-left font-medium w-14">Type</th>
              <th className="border border-border px-2 py-1 text-right font-medium w-24">Value</th>
              <th className="border border-border px-1.5 py-1 text-center font-medium w-16">Min</th>
              <th className="border border-border px-1.5 py-1 text-center font-medium w-16">Max</th>
              <th className="border border-border px-1.5 py-1 text-center font-medium w-12">Moving Avg</th>
              <th className="border border-border px-1.5 py-1 text-center font-medium w-16">Y Resolution</th>
              <th className="border border-border px-1.5 py-1 text-center font-medium w-16">Y Offset</th>
              <th className="border border-border w-8" />
            </tr>
          </thead>
          <tbody>
            {variables.length === 0 ? (
              <tr>
                <td colSpan={12} className="border border-border px-2 py-4 text-center text-muted-foreground">
                  暂无监视变量
                </td>
              </tr>
            ) : variables.map((v, i) => {
              const val = lastValues.get(v.id)
              const prevVal = prevValues.get(v.id)
              const changed = running && val !== undefined && prevVal !== undefined && val !== prevVal
              const ch = channels.find((c) => c.varId === v.id)
              return (
                <tr
                  key={v.id}
                  className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                >
                  {/* Color */}
                  <td className="border border-border px-1 py-1 text-center">
                    <input
                      type="color"
                      className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      value={ch?.color ?? '#888888'}
                      onChange={(e) => setChannel(v.id, { color: e.target.value })}
                      title="通道颜色"
                    />
                  </td>
                  {/* Name */}
                  <td className="border border-border px-2 py-1 truncate max-w-[160px]" title={v.name}>
                    {v.name}
                  </td>
                  {/* Address */}
                  <td className="border border-border px-2 py-1 font-mono">
                    0x{v.address.toString(16).toUpperCase().padStart(8, '0')}
                  </td>
                  {/* Size */}
                  <td className="border border-border px-1.5 py-1 text-center font-mono">
                    {v.size}
                  </td>
                  {/* Type */}
                  <td className="border border-border px-1.5 py-1 font-mono">
                    {v.type}
                  </td>
                  {/* Value（双击编辑） */}
                  <td
                    className={cn(
                      'border border-border px-2 py-1 text-right font-mono tabular-nums transition-colors',
                      changed && 'bg-primary/10',
                      editingId === v.id && 'p-0',
                    )}
                    onDoubleClick={() => { setEditingId(v.id); setEditValue('') }}
                    title="双击修改变量值"
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
                  {/* Min（null=自适应） */}
                  <td className="border border-border px-1 py-1">
                    <input
                      type="number"
                      className="h-5 w-full bg-transparent text-center font-mono text-[11px] outline-none focus:bg-background focus:ring-1 focus:ring-primary rounded"
                      value={ch?.min ?? ''}
                      onChange={(e) => setChannel(v.id, { min: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="自动"
                      title="Y 轴最小值（空=跟随自适应）"
                    />
                  </td>
                  {/* Max（null=自适应） */}
                  <td className="border border-border px-1 py-1">
                    <input
                      type="number"
                      className="h-5 w-full bg-transparent text-center font-mono text-[11px] outline-none focus:bg-background focus:ring-1 focus:ring-primary rounded"
                      value={ch?.max ?? ''}
                      onChange={(e) => setChannel(v.id, { max: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="自动"
                      title="Y 轴最大值（空=跟随自适应）"
                    />
                  </td>
                  {/* Moving Average */}
                  <td className="border border-border px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      className="size-3 cursor-pointer"
                      checked={ch?.movingAverage ?? false}
                      onChange={(e) => setChannel(v.id, { movingAverage: e.target.checked })}
                      title="启用滑动平均滤波"
                    />
                  </td>
                  {/* Y Resolution */}
                  <td className="border border-border px-1 py-1">
                    <input
                      type="number"
                      className="h-5 w-full bg-transparent text-center font-mono text-[11px] outline-none focus:bg-background focus:ring-1 focus:ring-primary rounded"
                      value={ch?.yResolution ?? 0}
                      onChange={(e) => setChannel(v.id, { yResolution: Number(e.target.value) })}
                      step="any"
                      title="Y 轴分辨率（每格代表的数值，0=自动）"
                    />
                  </td>
                  {/* Y Offset */}
                  <td className="border border-border px-1 py-1">
                    <input
                      type="number"
                      className="h-5 w-full bg-transparent text-center font-mono text-[11px] outline-none focus:bg-background focus:ring-1 focus:ring-primary rounded"
                      value={ch?.yOffset ?? 0}
                      onChange={(e) => setChannel(v.id, { yOffset: Number(e.target.value) })}
                      step="any"
                      title="Y 轴偏移"
                    />
                  </td>
                  {/* 操作 */}
                  <td className="border border-border px-1 text-center">
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
