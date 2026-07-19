import { useState, useCallback } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotificationStore } from '@/stores/notification.store'
import { rttService } from '@/services/rtt.service'
import { useRttStore } from '@/stores/rtt.store'
import { computeChecksumWithRange } from '@/utils/checksum'
import { cn } from '@/lib/utils'

interface SendFileButtonProps {
  uid: string | null
  running: boolean
  getSendChannel: () => number
}

/** 发送文件按钮：选择文件并分块发送到下位机 down channel
 *
 *  分块大小 1024B，避免超过 down channel 缓冲区。
 *  支持 hex/换行/校验等发送配置（与 InputBar 一致）。
 */
export function SendFileButton({ uid, running, getSendChannel }: SendFileButtonProps) {
  const [sending, setSending] = useState(false)

  const sendHex = useRttStore((s) => s.sendHex)
  const sendNewline = useRttStore((s) => s.sendNewline)
  const sendChecksum = useRttStore((s) => s.sendChecksum)
  const sendChecksumType = useRttStore((s) => s.sendChecksumType)
  const sendChecksumStart = useRttStore((s) => s.sendChecksumStart)
  const sendChecksumEnd = useRttStore((s) => s.sendChecksumEnd)
  const addBytesSent = useRttStore((s) => s.addBytesSent)
  const setError = useRttStore((s) => s.setError)

  const handleSendFile = useCallback(async () => {
    if (!uid || !running || sending) return
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setSending(true)
      setError(null)
      try {
        const buf = await file.arrayBuffer()
        const allBytes = new Uint8Array(buf)

        // 根据发送配置预处理：hex 模式发送文件不适用（文件已是字节），换行+校验处理
        let data = allBytes
        // 追加换行
        if (sendNewline && !sendHex) {
          const nl = new TextEncoder().encode('\n')
          data = new Uint8Array(data.length + nl.length)
          data.set(allBytes, 0)
          data.set(nl, allBytes.length)
        }
        // 加校验
        if (sendChecksum) {
          const cks = computeChecksumWithRange(
            data, sendChecksumType, sendChecksumStart, sendChecksumEnd,
          )
          const withCks = new Uint8Array(data.length + cks.length)
          withCks.set(data, 0)
          withCks.set(cks, data.length)
          data = withCks
        }

        // 分块发送
        const CHUNK = 1024
        const channel = getSendChannel()
        let totalWritten = 0
        for (let i = 0; i < data.length; i += CHUNK) {
          const chunk = data.slice(i, i + CHUNK)
          const result = await rttService.send(uid, chunk, channel)
          if (result.success) {
            totalWritten += result.bytes_written
          } else {
            setError(result.error || '发送失败')
            break
          }
        }
        addBytesSent(totalWritten)
        useNotificationStore.getState().push({
          type: 'success',
          title: '文件发送完成',
          message: `${file.name}：已发送 ${totalWritten} / ${data.length} 字节`,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSending(false)
      }
    }
    input.click()
  }, [uid, running, sending, sendNewline, sendHex, sendChecksum, sendChecksumType, sendChecksumStart, sendChecksumEnd, getSendChannel, addBytesSent, setError])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSendFile}
      disabled={!uid || !running || sending}
      className="w-full justify-start text-xs"
      title="选择文件并发送到下位机（分块 1024B）"
    >
      {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
      {sending ? '发送中...' : '发送文件'}
    </Button>
  )
}
