import { useCallback, useState } from 'react'
import { Play, Square, Eraser, Trash2, Download, Keyboard, MessageSquare, Eye, Hexagon, FileDown, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useRttStore } from '@/stores/rtt.store'
import { rttService } from '@/services/rtt.service'
import { cn } from '@/lib/utils'
import { SaveFormatDialog } from './SaveFormatDialog'
import { SendFileButton } from './SendFileButton'

interface ConfigPanelProps {
  uid: string | null
  connected: boolean
  terminalRef: React.RefObject<{ clear: () => void; getData: () => Uint8Array; clearData: () => void } | null>
}

export function ConfigPanel({ uid, connected, terminalRef }: ConfigPanelProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  const {
    running,
    starting,
    selectedUpChannel,
    selectedDownChannel,
    error,
    displayMode,
    inputMode,
    localEcho,
    recordToFile,
    recordFileName,
    searchAddress,
    searchSize,
    setRunning,
    setStarting,
    setChannels,
    setSelectedUpChannel,
    setSelectedDownChannel,
    setError,
    setDisplayMode,
    setInputMode,
    setLocalEcho,
    setRecordToFile,
    setSearchAddress,
    setSearchSize,
    reset,
  } = useRttStore()

  // 当前 Tab 的数据大小（用于保存提示）
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
    } catch { /* 忽略 */ }
    setRunning(false)
    reset()
  }, [uid, setRunning, reset])

  const handleClear = useCallback(() => {
    terminalRef.current?.clear()
  }, [terminalRef])

  const handleClearData = useCallback(() => {
    terminalRef.current?.clear()
    terminalRef.current?.clearData()
  }, [terminalRef])

  const handleSave = useCallback((format: 'txt' | 'log' | 'csv' | 'bin') => {
    const data = terminalRef.current?.getData()
    if (!data || data.length === 0) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    let blob: Blob
    let ext: string
    switch (format) {
      case 'bin':
        blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
        ext = 'bin'
        break
      case 'csv': {
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

  /** 开启/关闭接收数据到文件 */
  const handleToggleRecord = useCallback(() => {
    if (recordToFile) {
      setRecordToFile(false, null)
    } else {
      // 开启：由 useRecordToFile hook 处理文件选择
      setRecordToFile(true, null)
    }
  }, [recordToFile, setRecordToFile])

  const getSendChannel = useCallback(() => {
    const tab = useRttStore.getState().tabs.find((t) => t.id === activeTabId)
    if (tab?.mode === 'single' && tab.channel !== undefined) return tab.channel
    return useRttStore.getState().selectedDownChannel
  }, [activeTabId])

  const canStart = uid && connected && !running && !starting
  const canStop = running
  const dataSize = activeTab?.bufferSize ?? 0

  return (
    <div className="flex h-full flex-col gap-3 p-3 overflow-y-auto">
      {/* ① 会话控制 */}
      <section className="space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          会话控制
        </Label>
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
            className="flex-1"
            size="sm"
          >
            <Square className="mr-1 h-4 w-4" />
            停止
          </Button>
        </div>
        {!running && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                placeholder="地址 (hex)"
                value={searchAddress}
                onChange={(e) => setSearchAddress(e.target.value)}
                className="h-7 text-[11px] font-mono"
              />
              <Input
                placeholder="范围 (hex)"
                value={searchSize}
                onChange={(e) => setSearchSize(e.target.value)}
                className="h-7 text-[11px] font-mono"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              留空则自动扫描 RAM 查找 RTT 控制块
            </p>
          </div>
        )}
        {recordToFile && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600">
            <Circle className="size-2 fill-current animate-pulse" />
            <span className="truncate" title={recordFileName ?? ''}>
              录制中：{recordFileName ?? '选择文件中...'}
            </span>
          </div>
        )}
      </section>

      <Separator />

      {/* ② 接收配置 */}
      <section className="space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          接收配置
        </Label>

        {/* 输入模式切换 */}
        <div className="flex items-center rounded-md border border-border p-0.5">
          <button
            onClick={() => setInputMode('bar')}
            className={cn(
              'flex h-6 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors',
              inputMode === 'bar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="输入栏模式：文本/HEX 发送"
          >
            <MessageSquare className="size-3" />
            输入栏
          </button>
          <button
            onClick={() => setInputMode('terminal')}
            className={cn(
              'flex h-6 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors',
              inputMode === 'terminal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="终端模式：直接输入，支持 Tab/方向键/Ctrl 组合键"
          >
            <Keyboard className="size-3" />
            终端
          </button>
        </div>

        {/* 本地回显（仅终端模式） */}
        {inputMode === 'terminal' && (
          <button
            onClick={() => setLocalEcho(!localEcho)}
            className={cn(
              'flex h-7 w-full items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors',
              localEcho
                ? 'border-green-500 bg-green-500/10 text-green-600'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
            title={localEcho ? '本地回显已开启' : '本地回显已关闭'}
          >
            <Eye className="size-3" />
            本地回显：{localEcho ? '开' : '关'}
          </button>
        )}

        {/* hex 显示 */}
        <button
          onClick={() => setDisplayMode(displayMode === 'text' ? 'hex' : 'text')}
          className={cn(
            'flex h-7 w-full items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors',
            displayMode === 'hex'
              ? 'border-blue-500 bg-blue-500/10 text-blue-500'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
          title="切换 hex/文本显示"
        >
          <Hexagon className="size-3" />
          HEX 显示：{displayMode === 'hex' ? '开' : '关'}
        </button>

        {/* 清屏 / 清空 */}
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" onClick={handleClear} className="h-7 text-[11px]" title="清屏：保留数据缓冲，可保存">
            <Eraser className="mr-1 h-3 w-3" />
            清屏
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearData} className="h-7 text-[11px]" title="清空：清除数据缓冲与字节计数">
            <Trash2 className="mr-1 h-3 w-3" />
            清空
          </Button>
        </div>

        {/* 保存数据（弹窗选格式） */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSaveDialog(true)}
          disabled={dataSize === 0}
          className="h-7 w-full text-[11px]"
          title="保存接收数据到文件"
        >
          <Download className="mr-1 h-3 w-3" />
          保存数据{dataSize > 0 ? ` (${dataSize < 1024 ? `${dataSize}B` : `${(dataSize / 1024).toFixed(1)}K`})` : ''}
        </Button>

        {/* 接收数据到文件（持续录制 .dat） */}
        <Button
          variant={recordToFile ? 'default' : 'outline'}
          size="sm"
          onClick={handleToggleRecord}
          disabled={!running}
          className="h-7 w-full text-[11px]"
          title="开启后持续把接收到的数据存入 .dat 文件"
        >
          <FileDown className="mr-1 h-3 w-3" />
          {recordToFile ? '停止录制' : '接收数据到文件'}
        </Button>
      </section>

      <Separator />

      {/* ③ 发送配置 */}
      <section className="space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          发送配置
        </Label>
        <p className="text-[10px] text-muted-foreground">
          hex 发送 / 换行 / 定时 / 校验 等选项在输入栏上方
        </p>

        {/* 发送文件 */}
        <SendFileButton uid={uid} running={running} getSendChannel={getSendChannel} />
      </section>

      {/* 错误信息 */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-500">
          {error}
        </div>
      )}

      {/* 保存格式对话框 */}
      <SaveFormatDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onConfirm={handleSave}
        dataSize={dataSize}
      />
    </div>
  )
}
