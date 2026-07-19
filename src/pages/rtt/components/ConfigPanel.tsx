import { useCallback } from 'react'
import { Play, Square, Trash2, Download, Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useRttStore, type DisplayMode } from '@/stores/rtt.store'
import { rttService } from '@/services/rtt.service'
import { cn } from '@/lib/utils'

interface ConfigPanelProps {
  uid: string | null
  connected: boolean
  terminalRef: React.RefObject<{ clear: () => void; getData: () => Uint8Array; clearData: () => void } | null>
}

export function ConfigPanel({ uid, connected, terminalRef }: ConfigPanelProps) {
  const {
    running,
    starting,
    upChannels,
    downChannels,
    selectedUpChannel,
    selectedDownChannel,
    bytesReceived,
    bytesSent,
    error,
    displayMode,
    searchAddress,
    searchSize,
    setRunning,
    setStarting,
    setChannels,
    setSelectedUpChannel,
    setSelectedDownChannel,
    setError,
    setDisplayMode,
    setSearchAddress,
    setSearchSize,
    reset,
  } = useRttStore()

  const handleStart = useCallback(async () => {
    if (!uid) return
    setStarting(true)
    setError(null)
    try {
      const addr = searchAddress.trim() ? parseInt(searchAddress.trim(), 16) : undefined
      const size = searchSize.trim() ? parseInt(searchSize.trim(), 16) : undefined
      const result = await rttService.start(uid, {
        address: addr,
        size: size,
        up_channel: selectedUpChannel,
        down_channel: selectedDownChannel,
      })
      if (result.success) {
        setChannels(result.up_channels, result.down_channels)
        setRunning(true)
        setSelectedUpChannel(result.up_channel)
        setSelectedDownChannel(result.down_channel)
      } else {
        setError(result.error || '启动失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }, [uid, searchAddress, searchSize, selectedUpChannel, selectedDownChannel, setStarting, setError, setChannels, setRunning, setSelectedUpChannel, setSelectedDownChannel])

  const handleStop = useCallback(async () => {
    if (!uid) return
    try {
      await rttService.stop(uid)
    } catch {
      // 忽略
    }
    setRunning(false)
    reset()
  }, [uid, setRunning, reset])

  const handleClear = useCallback(() => {
    terminalRef.current?.clear()
  }, [terminalRef])

  const handleClearData = useCallback(() => {
    terminalRef.current?.clear()
    terminalRef.current?.clearData()
    useRttStore.setState({ bytesReceived: 0 })
  }, [terminalRef])

  const handleSave = useCallback(() => {
    const data = terminalRef.current?.getData()
    if (!data || data.length === 0) return
    const blob = new Blob([data], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rtt_${new Date().toISOString().replace(/[:.]/g, '-')}.bin`
    a.click()
    URL.revokeObjectURL(url)
  }, [terminalRef])

  const canStart = uid && connected && !running && !starting
  const canStop = running
  const hasDownChannels = downChannels.length > 0

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* 启动/停止 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">会话控制</Label>
        <div className="flex gap-2">
          <Button
            onClick={handleStart}
            disabled={!canStart}
            className="flex-1"
            size="sm"
          >
            <Play className="mr-1 h-4 w-4" />
            {starting ? '启动中...' : '启动'}
          </Button>
          <Button
            onClick={handleStop}
            disabled={!canStop}
            variant="destructive"
            size="sm"
          >
            <Square className="mr-1 h-4 w-4" />
            停止
          </Button>
        </div>
        {!connected && (
          <p className="text-[10px] text-amber-500">
            请先连接仿真器与目标设备，再启动 RTT 会话
          </p>
        )}
      </div>

      {/* 控制块搜索配置 */}
      {!running && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">控制块搜索（可选）</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Input
                placeholder="地址 (hex)"
                value={searchAddress}
                onChange={(e) => setSearchAddress(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div>
              <Input
                placeholder="范围 (hex)"
                value={searchSize}
                onChange={(e) => setSearchSize(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            留空则自动扫描 RAM 区域查找 SEGGER RTT 标识
          </p>
        </div>
      )}

      <Separator />

      {/* 通道选择 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Up Channel（接收）
        </Label>
        <Select
          value={String(selectedUpChannel)}
          onValueChange={(v) => setSelectedUpChannel(Number(v))}
          disabled={upChannels.length === 0}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="选择通道" />
          </SelectTrigger>
          <SelectContent>
            {upChannels.map((ch) => (
              <SelectItem key={ch.index} value={String(ch.index)} className="text-xs">
                Ch{ch.index}{ch.name ? ` - ${ch.name}` : ''} ({ch.size}B)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Down Channel（发送）
        </Label>
        <Select
          value={String(selectedDownChannel)}
          onValueChange={(v) => setSelectedDownChannel(Number(v))}
          disabled={downChannels.length === 0}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="选择通道" />
          </SelectTrigger>
          <SelectContent>
            {downChannels.map((ch) => (
              <SelectItem key={ch.index} value={String(ch.index)} className="text-xs">
                Ch{ch.index}{ch.name ? ` - ${ch.name}` : ''} ({ch.size}B)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!hasDownChannels && (
          <p className="text-[10px] text-muted-foreground">无可用下行通道</p>
        )}
      </div>

      <Separator />

      {/* 显示模式 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">显示模式</Label>
        <div className="flex gap-1">
          {(['text', 'hex'] as DisplayMode[]).map((mode) => (
            <Button
              key={mode}
              variant={displayMode === mode ? 'default' : 'outline'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setDisplayMode(mode)}
            >
              {mode === 'text' ? '文本' : '十六进制'}
            </Button>
          ))}
        </div>
      </div>

      {/* 工具按钮 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">终端操作</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={handleClear} className="text-xs">
            <Eraser className="mr-1 h-3.5 w-3.5" />
            清屏
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearData} className="text-xs">
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            清空
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={handleSave} className="w-full text-xs">
          <Download className="mr-1 h-3.5 w-3.5" />
          保存数据
        </Button>
      </div>

      <Separator />

      {/* 统计 */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">统计</Label>
        <div className="rounded-md bg-muted/30 p-2.5 text-xs">
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">已接收</span>
            <span className="font-mono text-green-500">{formatBytes(bytesReceived)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">已发送</span>
            <span className="font-mono text-blue-500">{formatBytes(bytesSent)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">状态</span>
            <span className={cn('font-medium', running ? 'text-green-500' : 'text-muted-foreground')}>
              {running ? '运行中' : '已停止'}
            </span>
          </div>
        </div>
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-500">
          {error}
        </div>
      )}
    </div>
  )
}

/** 格式化字节数 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
