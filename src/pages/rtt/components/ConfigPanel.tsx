import { useCallback, useState } from 'react'
import { Play, Square, Eraser, Trash2, Download, Keyboard, MessageSquare, Eye, Hexagon, FileDown, ListChecks, CornerDownLeft, Timer, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { useRttStore } from '@/stores/rtt.store'
import { rttService } from '@/services/rtt.service'
import { CHECKSUM_OPTIONS, type ChecksumType } from '@/utils/checksum'
import { cn } from '@/lib/utils'
import { SaveFormatDialog } from './SaveFormatDialog'
import { SendFileButton } from './SendFileButton'

interface ConfigPanelProps {
  uid: string | null
  connected: boolean
  terminalRef: React.RefObject<{ clear: () => void; getData: () => Uint8Array; clearData: () => void } | null>
  /** 打开多字符串对话框 */
  onOpenMultiString: () => void
}

/** 紧凑配置行：左侧标签，右侧 Switch */
function SwitchRow({
  label,
  icon: Icon,
  checked,
  onCheckedChange,
  disabled,
  title,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <div className="flex h-7 items-center justify-between">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={title}>
        <Icon className="size-3" />
        {label}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        title={title}
      />
    </div>
  )
}

export function ConfigPanel({ uid, connected, terminalRef, onOpenMultiString }: ConfigPanelProps) {
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
    // 发送配置
    sendHex,
    sendNewline,
    sendTiming,
    sendTimingInterval,
    sendChecksum,
    sendChecksumType,
    sendChecksumStart,
    sendChecksumEnd,
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
    setSendHex,
    setSendNewline,
    setSendTiming,
    setSendTimingInterval,
    setSendChecksum,
    setSendChecksumType,
    setSendChecksumStart,
    setSendChecksumEnd,
  } = useRttStore()

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

  const handleToggleRecord = useCallback(() => {
    if (recordToFile) {
      setRecordToFile(false, null)
    } else {
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
    <div className="flex flex-col gap-2.5 p-2.5 overflow-y-auto text-xs">
      {/* ① 会话控制 */}
      <section className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          会话控制
        </Label>
        <div className="flex gap-2">
          <Button
            onClick={handleStart}
            disabled={!canStart}
            className="flex-1"
            size="sm"
          >
            <Play className="mr-1 h-3.5 w-3.5" />
            {starting ? '启动中...' : '启动'}
          </Button>
          <Button
            onClick={handleStop}
            disabled={!canStop}
            variant="destructive"
            className="flex-1"
            size="sm"
          >
            <Square className="mr-1 h-3.5 w-3.5" />
            停止
          </Button>
        </div>
        {!running && (
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
        )}
        {recordToFile && (
          <div className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-600">
            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="truncate" title={recordFileName ?? ''}>
              {recordFileName ?? '选择文件中...'}
            </span>
          </div>
        )}
      </section>

      <Separator />

      {/* ② 接收配置 */}
      <section className="space-y-1">
        <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          接收配置
        </Label>

        {/* 输入模式切换（segmented） */}
        <div className="flex items-center rounded-md border border-border p-0.5">
          <button
            onClick={() => setInputMode('bar')}
            className={cn(
              'flex h-6 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors',
              inputMode === 'bar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="输入栏模式"
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
            title="终端模式"
          >
            <Keyboard className="size-3" />
            终端
          </button>
        </div>

        {inputMode === 'terminal' && (
          <SwitchRow
            label="本地回显"
            icon={Eye}
            checked={localEcho}
            onCheckedChange={setLocalEcho}
            title="本地回显：输入会显示在终端"
          />
        )}

        <SwitchRow
          label="HEX 显示"
          icon={Hexagon}
          checked={displayMode === 'hex'}
          onCheckedChange={(v) => setDisplayMode(v ? 'hex' : 'text')}
          title="切换 hex/文本显示"
        />

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <Button variant="outline" size="sm" onClick={handleClear} className="h-7 text-[11px]" title="清屏：保留数据缓冲">
            <Eraser className="mr-1 h-3 w-3" />
            清屏
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearData} className="h-7 text-[11px]" title="清空：清除数据缓冲">
            <Trash2 className="mr-1 h-3 w-3" />
            清空
          </Button>
        </div>

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
      <section className="space-y-1">
        <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          发送配置
        </Label>

        <SwitchRow
          label="HEX 发送"
          icon={Hexagon}
          checked={sendHex}
          onCheckedChange={setSendHex}
          disabled={!running}
          title="以十六进制格式发送"
        />

        <SwitchRow
          label="加回车换行"
          icon={CornerDownLeft}
          checked={sendNewline}
          onCheckedChange={setSendNewline}
          disabled={!running || sendHex}
          title="发送时追加换行符"
        />

        <SwitchRow
          label="定时发送"
          icon={Timer}
          checked={sendTiming}
          onCheckedChange={setSendTiming}
          disabled={!running}
          title="按间隔自动发送输入栏内容"
        />
        {sendTiming && (
          <div className="flex items-center gap-1.5 pl-1">
            <Input
              type="number"
              min={10}
              max={60000}
              value={sendTimingInterval}
              onChange={(e) => setSendTimingInterval(Number(e.target.value))}
              className="h-6 w-16 text-[11px] font-mono"
              title="定时发送间隔（ms）"
            />
            <span className="text-[10px] text-muted-foreground">ms</span>
          </div>
        )}

        <SwitchRow
          label="加校验"
          icon={ShieldCheck}
          checked={sendChecksum}
          onCheckedChange={setSendChecksum}
          disabled={!running}
          title="附加校验值到数据末尾"
        />
        {sendChecksum && (
          <div className="space-y-1 pl-1">
            <Select
              value={sendChecksumType}
              onValueChange={(v) => setSendChecksumType(v as ChecksumType)}
            >
              <SelectTrigger className="h-6 w-full text-[11px] px-1.5" title="校验类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHECKSUM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">字节</span>
              <Input
                type="number"
                min={0}
                value={sendChecksumStart}
                onChange={(e) => setSendChecksumStart(Number(e.target.value))}
                className="h-6 w-12 text-[11px] font-mono"
                title="校验起始字节索引（0-based，含）"
              />
              <span className="text-[10px] text-muted-foreground">至</span>
              <Input
                type="number"
                min={-1}
                value={sendChecksumEnd}
                onChange={(e) => setSendChecksumEnd(Number(e.target.value))}
                className="h-6 w-12 text-[11px] font-mono"
                title="校验结束字节索引（-1=末尾）"
              />
            </div>
          </div>
        )}

        {/* 发送文件 */}
        <SendFileButton uid={uid} running={running} getSendChannel={getSendChannel} />

        {/* 多字符串 */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenMultiString}
          disabled={!running}
          className="w-full justify-start text-[11px] h-7"
          title="多字符串管理"
        >
          <ListChecks className="mr-1.5 h-3 w-3" />
          多字符串
        </Button>
      </section>

      {/* 错误信息 */}
      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-1.5 text-[10px] text-red-500">
          {error}
        </div>
      )}

      <SaveFormatDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onConfirm={handleSave}
        dataSize={dataSize}
      />
    </div>
  )
}
