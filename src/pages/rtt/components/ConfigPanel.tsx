import { useCallback, useState } from 'react'
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

/** 保存格式 */
type SaveFormat = 'txt' | 'log' | 'csv' | 'bin'

/** 保存格式选项 */
const SAVE_FORMATS: { value: SaveFormat; label: string; desc: string }[] = [
  { value: 'txt', label: 'TXT', desc: 'UTF-8 文本' },
  { value: 'log', label: 'LOG', desc: '带时间戳的文本' },
  { value: 'csv', label: 'CSV', desc: '十六进制+ASCII 表格' },
  { value: 'bin', label: 'BIN', desc: '原始二进制' },
]

interface ConfigPanelProps {
  uid: string | null
  connected: boolean
  terminalRef: React.RefObject<{ clear: () => void; getData: () => Uint8Array; clearData: () => void } | null>
}

export function ConfigPanel({ uid, connected, terminalRef }: ConfigPanelProps) {
  const [saveFormat, setSaveFormat] = useState<SaveFormat>('txt')
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
  // 当前激活的 Tab（用于显示统计）
  const activeTabId = useRttStore((s) => s.activeTabId)
  const activeTab = useRttStore((s) => s.tabs.find((t) => t.id === s.activeTabId))

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
        // 重置 Tab（新会话从干净的 All Channel 开始）
        useRttStore.getState().resetTabs()
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
    // clearData 已重置当前 Tab 的 bytesReceived，全局统计保留
  }, [terminalRef])

  const handleSave = useCallback((format: SaveFormat = 'txt') => {
    const data = terminalRef.current?.getData()
    if (!data || data.length === 0) return

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    let blob: Blob
    let ext: string

    switch (format) {
      case 'bin': {
        // 原始二进制
        blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
        ext = 'bin'
        break
      }
      case 'csv': {
        // CSV：每行一条记录（偏移,十六进制,ASCII）
        const lines: string[] = ['Offset,Hex,ASCII']
        const chunkSize = 16
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize)
          const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, '0')).join(' ')
          const ascii = Array.from(chunk).map((b) => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('')
          lines.push(`${i.toString(16).padStart(8, '0')},"${hex}","${ascii}"`)
        }
        blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
        ext = 'csv'
        break
      }
      case 'log': {
        // log：带时间戳的文本（每行前缀时间戳）
        const text = new TextDecoder('utf-8', { fatal: false }).decode(data)
        const lines = text.split(/\r?\n/)
        const stamped = lines.map((line) => {
          const now = new Date().toISOString().replace('T', ' ').slice(0, 23)
          return `[${now}] ${line}`
        })
        blob = new Blob([stamped.join('\n')], { type: 'text/plain;charset=utf-8' })
        ext = 'log'
        break
      }
      case 'txt':
      default: {
        // txt：UTF-8 文本
        const text = new TextDecoder('utf-8', { fatal: false }).decode(data)
        blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
        ext = 'txt'
        break
      }
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rtt_${timestamp}.${ext}`
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
        <div className="flex items-center gap-1">
          <Label className="text-xs font-medium text-muted-foreground">
            Up Channel（接收）
          </Label>
          <span className="text-[10px] text-muted-foreground cursor-help" title="通道数量和大小由固件中的 SEGGER_RTT_ConfigUpBuffer 定义。Ch{N} - 通道名 (缓冲区字节数)">
            ⓘ
          </span>
        </div>
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
        <div className="flex items-center gap-1">
          <Label className="text-xs font-medium text-muted-foreground">
            Down Channel（发送）
          </Label>
          <span className="text-[10px] text-muted-foreground cursor-help" title="主机发送数据到目标使用的通道。通道数量和大小由固件定义。">
            ⓘ
          </span>
        </div>
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
          <Button variant="outline" size="sm" onClick={handleClear} className="text-xs" title="清屏：仅清除屏幕显示，保留滚动历史和数据缓冲（保存功能仍可导出全部数据）">
            <Eraser className="mr-1 h-3.5 w-3.5" />
            清屏
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearData} className="text-xs" title="清空：清除屏幕显示、滚动历史和接收缓冲，并重置字节计数（不可恢复）">
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            清空
          </Button>
        </div>
        {/* 保存格式选择 */}
        <div className="flex gap-1">
          {SAVE_FORMATS.map((f) => (
            <button
              key={f.value}
              onClick={() => setSaveFormat(f.value)}
              className={cn(
                'flex-1 rounded px-1 py-1 text-[10px] font-medium transition-colors',
                saveFormat === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              title={f.desc}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => handleSave(saveFormat)} className="w-full text-xs">
          <Download className="mr-1 h-3.5 w-3.5" />
          保存数据（.{saveFormat}）
        </Button>
      </div>

      <Separator />

      {/* 统计 */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">统计</Label>
        <div className="rounded-md bg-muted/30 p-2.5 text-xs">
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">当前 Tab 接收</span>
            <span className="font-mono text-green-500">
              {formatBytes(activeTab?.bytesReceived ?? 0)}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">总接收</span>
            <span className="font-mono text-green-500/70">{formatBytes(bytesReceived)}</span>
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
