import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw, Usb, Plug, PlugZap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProbeStore } from '@/stores/probe.store'
import type { ProbeState } from '@shared/types'

const stateConfig: Record<ProbeState, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  disconnected: { label: '未连接', variant: 'outline' },
  connecting: { label: '连接中', variant: 'secondary' },
  connected: { label: '已连接', variant: 'default' },
  error: { label: '错误', variant: 'destructive' },
}

function formatUid(uid: string): string {
  if (uid.length <= 20) return uid
  return `${uid.slice(0, 8)}...${uid.slice(-8)}`
}

export function ProbeSelector() {
  const {
    probes,
    selectedUid,
    loadingProbes,
    connecting,
    fetchProbes,
    selectProbe,
    connectProbe,
    disconnectProbe,
  } = useProbeStore()

  const selectedProbe = probes.find((p) => p.uid === selectedUid)
  const isConnected = selectedProbe?.state === 'connected'

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Usb className="size-5 text-muted-foreground" />
          <CardTitle>仿真器选择</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => fetchProbes()}
          disabled={loadingProbes}
        >
          <RefreshCw className={cn('size-4', loadingProbes && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent>
        {probes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Usb className="size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {loadingProbes ? '正在扫描仿真器...' : '未检测到仿真器'}
            </p>
            {!loadingProbes && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => fetchProbes()}
              >
                <RefreshCw className="size-4" />
                重新扫描
              </Button>
            )}
          </div>
        ) : (
          <>
            <ScrollArea className="h-[200px] pr-3">
              <div className="space-y-2">
                {probes.map((probe) => {
                  const isSelected = probe.uid === selectedUid
                  const state = stateConfig[probe.state]
                  return (
                    <div
                      key={probe.uid}
                      onClick={() => selectProbe(probe.uid)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent'
                      )}
                    >
                      {/* 选中指示器 */}
                      <div
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                          isSelected ? 'border-primary' : 'border-muted-foreground/30'
                        )}
                      >
                        {isSelected && (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>

                      {/* 仿真器信息 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {probe.product || 'DAPLink'}
                          </span>
                          <Badge variant={state.variant}>{state.label}</Badge>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{probe.vendor || 'Unknown'}</span>
                          <span>·</span>
                          <span className="font-mono">{formatUid(probe.uid)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            {/* 连接/断开按钮 */}
            {selectedProbe && (
              <div className="mt-3 flex gap-2">
                {isConnected ? (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => disconnectProbe(selectedProbe.uid)}
                    disabled={connecting}
                  >
                    <Plug className="size-4" />
                    断开连接
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    onClick={() => connectProbe(selectedProbe.uid)}
                    disabled={connecting || selectedProbe.state === 'connecting'}
                  >
                    <PlugZap className="size-4" />
                    {selectedProbe.state === 'connecting' ? '连接中...' : '连接'}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
