import { Plus, Eye, EyeOff } from 'lucide-react'
import { useMonitorStore } from '@/stores/monitor.store'
import { cn } from '@/lib/utils'

interface Props {
  uid: string | null
  onAddVariable: () => void
}

export function ChannelPanel({ onAddVariable }: Props) {
  const variables = useMonitorStore((s) => s.variables)
  const channels = useMonitorStore((s) => s.channels)
  const samples = useMonitorStore((s) => s.samples)
  const running = useMonitorStore((s) => s.running)
  const setChannel = useMonitorStore((s) => s.setChannel)

  // 取最新采样值
  const lastSample = samples[samples.length - 1]
  const lastValues = new Map<string, number | null>()
  if (lastSample) {
    for (const v of lastSample.values) {
      lastValues.set(v.id, v.value)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：添加变量按钮 */}
      <div className="border-b border-border p-2">
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded border border-primary bg-primary/10 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
          onClick={onAddVariable}
        >
          <Plus className="size-3.5" />
          添加变量
        </button>
      </div>

      {/* 通道列表 */}
      <div className="min-h-0 flex-1 overflow-auto">
        {variables.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-center text-xs text-muted-foreground">
              点击上方按钮<br />从 ELF 添加变量
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {variables.map((v) => {
              const ch = channels.find((c) => c.varId === v.id)
              if (!ch) return null
              return (
                <div
                  key={v.id}
                  className={cn(
                    'rounded border border-border bg-background p-2',
                    !ch.visible && 'opacity-50'
                  )}
                >
                  {/* 颜色 + 名称 + 显隐 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      value={ch.color}
                      onChange={(e) => setChannel(v.id, { color: e.target.value })}
                      title="通道颜色"
                    />
                    <span className="flex-1 truncate text-xs font-medium" title={v.name}>
                      {v.name}
                    </span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setChannel(v.id, { visible: !ch.visible })}
                      title={ch.visible ? '隐藏' : '显示'}
                    >
                      {ch.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                  </div>

                  {/* 当前值 */}
                  {running && (
                    <div className="mt-1 text-xs font-mono tabular-nums text-muted-foreground">
                      {lastValues.has(v.id)
                        ? (lastValues.get(v.id) ?? 'N/A')
                        : '—'}
                    </div>
                  )}

                  {/* Y 轴偏移/缩放 */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <label className="text-[10px] text-muted-foreground">偏移</label>
                    <input
                      type="number"
                      className="h-5 w-12 rounded border border-border bg-background px-1 text-[10px]"
                      value={ch.yOffset}
                      onChange={(e) => setChannel(v.id, { yOffset: Number(e.target.value) })}
                      step="any"
                    />
                    <label className="text-[10px] text-muted-foreground">缩放</label>
                    <input
                      type="number"
                      className="h-5 w-12 rounded border border-border bg-background px-1 text-[10px]"
                      value={ch.yScale}
                      onChange={(e) => setChannel(v.id, { yScale: Number(e.target.value) })}
                      step="any"
                    />
                  </div>

                  {/* 地址 + 类型 */}
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                    <span className="font-mono">0x{v.address.toString(16).toUpperCase().padStart(8, '0')}</span>
                    <span className="font-mono">{v.type}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
