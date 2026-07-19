import { useState, useCallback, useRef, useEffect } from 'react'
import { Send, CornerDownLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useRttStore } from '@/stores/rtt.store'
import { rttService } from '@/services/rtt.service'

interface InputBarProps {
  uid: string | null
  running: boolean
}

export function InputBar({ uid, running }: InputBarProps) {
  const [text, setText] = useState('')
  const [hexMode, setHexMode] = useState(false)
  const [appendNewline, setAppendNewline] = useState(true)
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedDownChannel = useRttStore((s) => s.selectedDownChannel)
  const setSelectedDownChannel = useRttStore((s) => s.setSelectedDownChannel)
  const downChannels = useRttStore((s) => s.downChannels)
  const addBytesSent = useRttStore((s) => s.addBytesSent)
  const setError = useRttStore((s) => s.setError)

  // 当前激活的 Tab（决定发送目标通道）
  const activeTabId = useRttStore((s) => s.activeTabId)
  const activeTab = useRttStore((s) => s.tabs.find((t) => t.id === s.activeTabId))

  // 发送通道：单通道 Tab 用 tab.channel，All Channel Tab 用 selectedDownChannel
  const sendChannel = activeTab?.mode === 'single' && activeTab.channel !== undefined
    ? activeTab.channel
    : selectedDownChannel

  const hasDownChannel = downChannels.length > 0
  const canSend = uid && running && hasDownChannel && !sending && text.length > 0

  const handleSend = useCallback(async () => {
    if (!uid || !canSend) return
    setSending(true)
    setError(null)
    try {
      if (hexMode) {
        // 十六进制模式：解析 hex 字符串为字节数组
        const hexStr = text.replace(/\s+/g, '').replace(/0x/gi, '')
        if (hexStr.length % 2 !== 0) {
          setError('十六进制数据长度必须为偶数')
          return
        }
        if (!/^[0-9a-fA-F]*$/.test(hexStr)) {
          setError('十六进制数据包含非法字符')
          return
        }
        const bytes = new Uint8Array(hexStr.length / 2)
        for (let i = 0; i < hexStr.length; i += 2) {
          bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
        }
        const result = await rttService.send(uid, bytes, sendChannel)
        if (result.success) {
          addBytesSent(result.bytes_written)
          setText('')
        } else {
          setError(result.error || '发送失败')
        }
      } else {
        // 文本模式
        const result = await rttService.sendText(
          uid,
          text,
          sendChannel,
          appendNewline
        )
        if (result.success) {
          addBytesSent(result.bytes_written)
          setText('')
        } else {
          setError(result.error || '发送失败')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }, [uid, canSend, hexMode, text, sendChannel, appendNewline, addBytesSent, setError])

  // Enter 发送
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  // 运行时自动聚焦输入框
  useEffect(() => {
    if (running) {
      inputRef.current?.focus()
    }
  }, [running])

  // 是否显示 down channel 选择器（All Channel Tab 时显示）
  const showChannelSelector = activeTab?.mode === 'all'

  return (
    <div className="flex items-center gap-2 border-t border-border bg-background px-3 py-2">
      {/* 模式切换 */}
      <button
        onClick={() => setHexMode(!hexMode)}
        disabled={!running}
        className={cn(
          'flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors',
          hexMode
            ? 'border-blue-500 bg-blue-500/10 text-blue-500'
            : 'border-border text-muted-foreground hover:text-foreground',
          !running && 'cursor-not-allowed opacity-50'
        )}
        title={hexMode ? '十六进制输入模式' : '文本输入模式'}
      >
        {hexMode ? 'HEX' : 'TXT'}
      </button>

      {/* Down Channel 选择器（仅 All Channel Tab 显示） */}
      {showChannelSelector && hasDownChannel && (
        <Select
          value={String(selectedDownChannel)}
          onValueChange={(v) => setSelectedDownChannel(Number(v))}
          disabled={!running}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs" title="选择发送目标 Down Channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {downChannels.map((ch) => (
              <SelectItem key={ch.index} value={String(ch.index)} className="text-xs">
                Ch{ch.index}{ch.name ? ` - ${ch.name}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 单通道 Tab 显示发送目标（只读） */}
      {!showChannelSelector && activeTab?.mode === 'single' && (
        <div className="flex h-8 items-center rounded-md border border-border px-2 text-xs text-muted-foreground" title="发送目标通道（由当前 Tab 决定）">
          → Ch{sendChannel}
        </div>
      )}

      {/* 输入框 */}
      <Input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!running || !hasDownChannel}
        placeholder={
          !running
            ? 'RTT 未启动'
            : !hasDownChannel
            ? '无下行通道'
            : hexMode
            ? '输入十六进制数据，如 41 42 43 或 0x41 0x42'
            : '输入要发送的文本...'
        }
        className={cn(
          'h-9 flex-1 font-mono text-sm',
          hexMode && 'tracking-wider'
        )}
      />

      {/* 追加换行 */}
      {!hexMode && (
        <button
          onClick={() => setAppendNewline(!appendNewline)}
          disabled={!running}
          className={cn(
            'flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors',
            appendNewline
              ? 'border-green-500 bg-green-500/10 text-green-500'
              : 'border-border text-muted-foreground hover:text-foreground',
            !running && 'cursor-not-allowed opacity-50'
          )}
          title="发送时追加换行符 (\\n)"
        >
          <CornerDownLeft className="h-3.5 w-3.5" />
          \n
        </button>
      )}

      {/* 发送按钮 */}
      <Button
        onClick={handleSend}
        disabled={!canSend}
        size="sm"
        className="h-9 px-4"
      >
        <Send className="mr-1.5 h-3.5 w-3.5" />
        发送
      </Button>
    </div>
  )
}
