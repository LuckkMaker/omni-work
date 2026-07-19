import { useState, useCallback, useRef, useEffect } from 'react'
import { Send, CornerDownLeft, Timer, ShieldCheck, FileText, ListChecks } from 'lucide-react'
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
import { computeChecksumWithRange, CHECKSUM_OPTIONS } from '@/utils/checksum'

interface InputBarProps {
  uid: string | null
  running: boolean
  /** 打开多字符串对话框 */
  onOpenMultiString: () => void
}

/**
 * 发送数据预处理：把文本/hex 字符串解析为字节数组，并按发送配置追加换行+校验
 */
function preprocessSend(
  text: string,
  opts: {
    hex: boolean
    newline: boolean
    checksum: boolean
    checksumType: Parameters<typeof computeChecksumWithRange>[1]
    checksumStart: number
    checksumEnd: number
  },
): Uint8Array | { error: string } {
  let data: Uint8Array
  if (opts.hex) {
    const hexStr = text.replace(/\s+/g, '').replace(/0x/gi, '')
    if (hexStr.length % 2 !== 0) return { error: '十六进制数据长度必须为偶数' }
    if (!/^[0-9a-fA-F]*$/.test(hexStr)) return { error: '十六进制数据包含非法字符' }
    data = new Uint8Array(hexStr.length / 2)
    for (let i = 0; i < hexStr.length; i += 2) {
      data[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
    }
  } else {
    data = new TextEncoder().encode(text)
    if (opts.newline) {
      const nl = new TextEncoder().encode('\n')
      const withNl = new Uint8Array(data.length + nl.length)
      withNl.set(data, 0)
      withNl.set(nl, data.length)
      data = withNl
    }
  }
  if (opts.checksum) {
    const cks = computeChecksumWithRange(
      data, opts.checksumType, opts.checksumStart, opts.checksumEnd,
    )
    const withCks = new Uint8Array(data.length + cks.length)
    withCks.set(data, 0)
    withCks.set(cks, data.length)
    data = withCks
  }
  return data
}

export function InputBar({ uid, running, onOpenMultiString }: InputBarProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timingTimerRef = useRef<number | null>(null)

  // 发送配置（订阅 store，store 负责持久化）
  const sendHex = useRttStore((s) => s.sendHex)
  const sendNewline = useRttStore((s) => s.sendNewline)
  const sendTiming = useRttStore((s) => s.sendTiming)
  const sendTimingInterval = useRttStore((s) => s.sendTimingInterval)
  const sendChecksum = useRttStore((s) => s.sendChecksum)
  const sendChecksumType = useRttStore((s) => s.sendChecksumType)
  const sendChecksumStart = useRttStore((s) => s.sendChecksumStart)
  const sendChecksumEnd = useRttStore((s) => s.sendChecksumEnd)
  const setSendHex = useRttStore((s) => s.setSendHex)
  const setSendNewline = useRttStore((s) => s.setSendNewline)
  const setSendTiming = useRttStore((s) => s.setSendTiming)
  const setSendTimingInterval = useRttStore((s) => s.setSendTimingInterval)
  const setSendChecksum = useRttStore((s) => s.setSendChecksum)
  const setSendChecksumType = useRttStore((s) => s.setSendChecksumType)
  const setSendChecksumStart = useRttStore((s) => s.setSendChecksumStart)
  const setSendChecksumEnd = useRttStore((s) => s.setSendChecksumEnd)

  const selectedDownChannel = useRttStore((s) => s.selectedDownChannel)
  const setSelectedDownChannel = useRttStore((s) => s.setSelectedDownChannel)
  const downChannels = useRttStore((s) => s.downChannels)
  const addBytesSent = useRttStore((s) => s.addBytesSent)
  const setError = useRttStore((s) => s.setError)

  // 当前激活的 Tab（决定发送目标通道）
  const activeTabId = useRttStore((s) => s.activeTabId)
  const activeTab = useRttStore((s) => s.tabs.find((t) => t.id === s.activeTabId))

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
      const result = preprocessSend(text, {
        hex: sendHex,
        newline: sendNewline,
        checksum: sendChecksum,
        checksumType: sendChecksumType,
        checksumStart: sendChecksumStart,
        checksumEnd: sendChecksumEnd,
      })
      if (result instanceof Uint8Array) {
        const r = await rttService.send(uid, result, sendChannel)
        if (r.success) {
          addBytesSent(r.bytes_written)
          // hex/定时模式不清空文本，方便重复发送；普通文本模式清空
          if (!sendHex && !sendTiming) setText('')
        } else {
          setError(r.error || '发送失败')
        }
      } else {
        setError(result.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }, [uid, canSend, text, sendHex, sendNewline, sendChecksum, sendChecksumType, sendChecksumStart, sendChecksumEnd, sendChannel, sendTiming, addBytesSent, setError])

  // 定时发送：开启时按间隔自动触发
  useEffect(() => {
    if (timingTimerRef.current) {
      clearInterval(timingTimerRef.current)
      timingTimerRef.current = null
    }
    if (sendTiming && running && text.length > 0) {
      timingTimerRef.current = window.setInterval(() => {
        void handleSend()
      }, sendTimingInterval)
    }
    return () => {
      if (timingTimerRef.current) {
        clearInterval(timingTimerRef.current)
        timingTimerRef.current = null
      }
    }
  }, [sendTiming, sendTimingInterval, running, text, handleSend])

  // Enter 发送（定时模式禁用，避免冲突）
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (sendTiming) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend, sendTiming])

  // 运行时自动聚焦输入框
  useEffect(() => {
    if (running) {
      inputRef.current?.focus()
    }
  }, [running])

  const showChannelSelector = activeTab?.mode === 'all'

  return (
    <div className="flex flex-col gap-1 border-t border-border bg-background px-3 py-2">
      {/* 第一行：模式/通道/输入/发送 */}
      <div className="flex items-center gap-2">
        {/* hex 发送 */}
        <button
          onClick={() => setSendHex(!sendHex)}
          disabled={!running}
          className={cn(
            'flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors',
            sendHex
              ? 'border-blue-500 bg-blue-500/10 text-blue-500'
              : 'border-border text-muted-foreground hover:text-foreground',
            !running && 'cursor-not-allowed opacity-50'
          )}
          title={sendHex ? '十六进制发送模式' : '文本发送模式'}
        >
          {sendHex ? 'HEX' : 'TXT'}
        </button>

        {/* Down Channel 选择器（仅 All Channel Tab 显示） */}
        {showChannelSelector && hasDownChannel && (
          <Select
            value={String(selectedDownChannel)}
            onValueChange={(v) => setSelectedDownChannel(Number(v))}
            disabled={!running}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs" title="选择发送目标 Down Channel">
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
              : sendHex
              ? '输入十六进制数据，如 41 42 43 或 0x41 0x42'
              : '输入要发送的文本...'
          }
          className={cn(
            'h-9 flex-1 font-mono text-sm',
            sendHex && 'tracking-wider'
          )}
        />

        {/* 发送按钮 */}
        <Button
          onClick={handleSend}
          disabled={!canSend || sendTiming}
          size="sm"
          className="h-9 px-4"
          title={sendTiming ? '定时发送中（手动发送已禁用）' : '发送（Enter）'}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          发送
        </Button>
      </div>

      {/* 第二行：发送选项（换行/定时/校验/多字符串） */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* 加回车换行（仅文本模式有意义） */}
        <button
          onClick={() => setSendNewline(!sendNewline)}
          disabled={!running || sendHex}
          className={cn(
            'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors',
            sendNewline
              ? 'border-green-500 bg-green-500/10 text-green-600'
              : 'border-border text-muted-foreground hover:text-foreground',
            (!running || sendHex) && 'cursor-not-allowed opacity-50'
          )}
          title="发送时追加换行符 (\\n)"
        >
          <CornerDownLeft className="h-3 w-3" />
          换行
        </button>

        {/* 定时发送 */}
        <button
          onClick={() => setSendTiming(!sendTiming)}
          disabled={!running}
          className={cn(
            'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors',
            sendTiming
              ? 'border-amber-500 bg-amber-500/10 text-amber-600'
              : 'border-border text-muted-foreground hover:text-foreground',
            !running && 'cursor-not-allowed opacity-50'
          )}
          title="定时发送：按间隔自动发送当前输入框内容"
        >
          <Timer className="h-3 w-3" />
          定时
        </button>
        {sendTiming && (
          <input
            type="number"
            min={10}
            max={60000}
            value={sendTimingInterval}
            onChange={(e) => setSendTimingInterval(Number(e.target.value))}
            className="h-6 w-14 rounded-md border border-border px-1 text-[11px] font-mono"
            title="定时发送间隔（ms）"
          />
        )}
        <span className="text-[10px] text-muted-foreground">ms</span>

        {/* 加校验 */}
        <button
          onClick={() => setSendChecksum(!sendChecksum)}
          disabled={!running}
          className={cn(
            'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors',
            sendChecksum
              ? 'border-purple-500 bg-purple-500/10 text-purple-600'
              : 'border-border text-muted-foreground hover:text-foreground',
            !running && 'cursor-not-allowed opacity-50'
          )}
          title="附加校验值到数据末尾"
        >
          <ShieldCheck className="h-3 w-3" />
          校验
        </button>
        {sendChecksum && (
          <>
            <Select
              value={sendChecksumType}
              onValueChange={(v) => setSendChecksumType(v as typeof sendChecksumType)}
            >
              <SelectTrigger className="h-6 w-[120px] text-[11px] px-1.5" title="校验类型">
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
            <span className="text-[10px] text-muted-foreground">字节</span>
            <input
              type="number"
              min={0}
              value={sendChecksumStart}
              onChange={(e) => setSendChecksumStart(Number(e.target.value))}
              className="h-6 w-12 rounded-md border border-border px-1 text-[11px] font-mono"
              title="校验起始字节索引（0-based，含）"
              placeholder="起"
            />
            <span className="text-[10px] text-muted-foreground">至</span>
            <input
              type="number"
              min={-1}
              value={sendChecksumEnd}
              onChange={(e) => setSendChecksumEnd(Number(e.target.value))}
              className="h-6 w-12 rounded-md border border-border px-1 text-[11px] font-mono"
              title="校验结束字节索引（-1=末尾，0-based 含）"
              placeholder="末"
            />
          </>
        )}

        {/* 多字符串 */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenMultiString}
          disabled={!running}
          className="ml-auto h-6 px-2 text-[11px]"
          title="多字符串管理：批量发送预设字符串"
        >
          <ListChecks className="mr-1 h-3 w-3" />
          多字符串
        </Button>
      </div>
    </div>
  )
}
