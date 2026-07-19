import { useState, useCallback } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useRttStore, type MultiStringItem } from '@/stores/rtt.store'
import { rttService } from '@/services/rtt.service'
import { useNotificationStore } from '@/stores/notification.store'
import { cn } from '@/lib/utils'

interface MultiStringDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  uid: string | null
  running: boolean
  /** 获取发送目标 down channel */
  getSendChannel: () => number
}

/** 解析多字符串条目为字节数组 */
function parseItemBytes(item: MultiStringItem): Uint8Array | null {
  if (item.isHex) {
    const hexStr = item.content.replace(/\s+/g, '').replace(/0x/gi, '')
    if (hexStr.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hexStr)) return null
    const bytes = new Uint8Array(hexStr.length / 2)
    for (let i = 0; i < hexStr.length; i += 2) {
      bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16)
    }
    return bytes
  } else {
    return new TextEncoder().encode(item.content)
  }
}

export function MultiStringDialog({ open, onOpenChange, uid, running, getSendChannel }: MultiStringDialogProps) {
  const multiStrings = useRttStore((s) => s.multiStrings)
  const addMultiString = useRttStore((s) => s.addMultiString)
  const updateMultiString = useRttStore((s) => s.updateMultiString)
  const removeMultiString = useRttStore((s) => s.removeMultiString)
  const reorderMultiStrings = useRttStore((s) => s.reorderMultiStrings)
  const addBytesSent = useRttStore((s) => s.addBytesSent)
  const setError = useRttStore((s) => s.setError)

  const [newContent, setNewContent] = useState('')
  const [newIsHex, setNewIsHex] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [sending, setSending] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const sorted = [...multiStrings].sort((a, b) => a.order - b.order)

  const handleAdd = useCallback(() => {
    if (!newContent.trim()) return
    if (multiStrings.length >= 100) return
    addMultiString({
      content: newContent.trim(),
      isHex: newIsHex,
      comment: newComment.trim(),
      enabled: true,
      delayMs: 1000,
    })
    setNewContent('')
    setNewComment('')
  }, [newContent, newIsHex, newComment, multiStrings.length, addMultiString])

  /** 单条发送：立即发送指定条目 */
  const handleSendOne = useCallback(async (item: MultiStringItem) => {
    if (!uid || !running || sendingId) return
    setSendingId(item.id)
    setError(null)
    const channel = getSendChannel()
    const bytes = parseItemBytes(item)
    if (!bytes || bytes.length === 0) {
      setSendingId(null)
      return
    }
    try {
      const result = await rttService.send(uid, bytes, channel)
      if (result.success) {
        addBytesSent(result.bytes_written)
      } else {
        setError(result.error || '发送失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSendingId(null)
    }
  }, [uid, running, sendingId, getSendChannel, addBytesSent, setError])

  /** 顺序发送：按 order 遍历启用项，按各自 delayMs 延时发送 */
  const handleSendAll = useCallback(async () => {
    if (!uid || !running || sending) return
    const items = sorted.filter((it) => it.enabled)
    if (items.length === 0) {
      useNotificationStore.getState().push({
        type: 'warning',
        title: '无启用的条目',
        message: '请先勾选要发送的条目',
      })
      return
    }
    setSending(true)
    setError(null)
    const channel = getSendChannel()
    let sentCount = 0
    try {
      for (let i = 0; i < items.length; i++) {
        const bytes = parseItemBytes(items[i])
        if (!bytes || bytes.length === 0) continue
        const result = await rttService.send(uid, bytes, channel)
        if (result.success) {
          addBytesSent(result.bytes_written)
          sentCount++
        } else {
          setError(result.error || '发送失败')
          break
        }
        // 按该条独立的 delayMs 等待后再发下一条（最后一条不等待）
        if (i < items.length - 1 && items[i].delayMs > 0) {
          await new Promise((r) => setTimeout(r, items[i].delayMs))
        }
      }
      useNotificationStore.getState().push({
        type: 'success',
        title: '顺序发送完成',
        message: `已发送 ${sentCount} / ${items.length} 条`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }, [uid, running, sending, sorted, getSendChannel, addBytesSent, setError])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>多字符串管理</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          {/* 添加新条目 */}
          <div className="flex items-center gap-2 rounded-md border border-border p-2">
            <Checkbox
              checked={newIsHex}
              onCheckedChange={(v) => setNewIsHex(v === true)}
              title="以 hex 格式发送"
            />
            <Input
              placeholder={newIsHex ? 'hex 数据，如 41 42 43' : '文本内容'}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Input
              placeholder="注释（可选）"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="h-8 w-32 text-xs"
            />
            <Button size="sm" variant="outline" onClick={handleAdd} disabled={!newContent.trim() || multiStrings.length >= 100}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              添加
            </Button>
          </div>

          {/* 列表 */}
          <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
            {sorted.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                暂无字符串，请在上方添加
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="w-16 px-2 py-1.5 font-medium text-center" title="启用发送">发送</th>
                    <th className="w-16 px-2 py-1.5 font-medium text-center" title="以 hex 格式发送">HEX</th>
                    <th className="px-2 py-1.5 font-medium text-center">内容</th>
                    <th className="w-16 px-2 py-1.5 font-medium text-center">注释</th>
                    <th className="w-16 px-2 py-1.5 font-medium text-center" title="发送顺序">顺序</th>
                    <th className="w-16 px-2 py-1.5 font-medium text-center" title="发送后延时（ms）">延时</th>
                    <th className="w-16 px-2 py-1.5 font-medium text-center" title="字节数">字节</th>
                    <th className="w-16 px-2 py-1.5 font-medium text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item, idx) => {
                    const bytes = parseItemBytes(item)
                    const isSendingThis = sendingId === item.id
                    return (
                      <tr key={item.id} className="border-t border-border/50 hover:bg-muted/30">
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={item.enabled}
                            onCheckedChange={(v) => updateMultiString(item.id, { enabled: v === true })}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <Checkbox
                            checked={item.isHex}
                            onCheckedChange={(v) => updateMultiString(item.id, { isHex: v === true })}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input
                            type="text"
                            value={item.content}
                            onChange={(e) => updateMultiString(item.id, { content: e.target.value })}
                            className="w-full bg-transparent font-mono text-xs outline-none focus:bg-background focus:px-1"
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input
                            type="text"
                            value={item.comment}
                            onChange={(e) => updateMultiString(item.id, { comment: e.target.value })}
                            placeholder="-"
                            className="w-full bg-transparent text-xs text-muted-foreground outline-none focus:bg-background focus:px-1"
                          />
                        </td>
                        <td className="px-2 py-1 text-center font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="px-2 py-1 text-center">
                          <input
                            type="number"
                            min={0}
                            max={60000}
                            value={item.delayMs}
                            onChange={(e) => updateMultiString(item.id, { delayMs: Number(e.target.value) })}
                            className="w-14 rounded border border-border px-1 py-0.5 text-center font-mono text-[11px] outline-none focus:border-primary"
                            title="发送后延时（ms）"
                          />
                        </td>
                        <td className="px-2 py-1 text-center font-mono text-muted-foreground">
                          {bytes?.length ?? '?'}
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => handleSendOne(item)}
                              disabled={!uid || !running || isSendingThis}
                              className="rounded p-0.5 text-muted-foreground hover:text-primary disabled:opacity-30"
                              title="发送此条"
                            >
                              {isSendingThis
                                ? <Loader2 className="size-3 animate-spin" />
                                : <Send className="size-3" />}
                            </button>
                            <button
                              onClick={() => reorderMultiStrings(item.id, 'up')}
                              disabled={idx === 0}
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              title="上移"
                            >
                              <ChevronUp className="size-3" />
                            </button>
                            <button
                              onClick={() => reorderMultiStrings(item.id, 'down')}
                              disabled={idx === sorted.length - 1}
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              title="下移"
                            >
                              <ChevronDown className="size-3" />
                            </button>
                            <button
                              onClick={() => removeMultiString(item.id)}
                              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                              title="删除"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            上限 100 条。勾选"发"控制是否启用；勾选"HEX"以 hex 格式发送；"延时"为发送该条后等待多少毫秒再发下一条（每条独立）。
          </p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              已启用 {sorted.filter((it) => it.enabled).length} / {sorted.length} 条
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            size="sm"
            onClick={handleSendAll}
            disabled={!uid || !running || sending || sorted.filter((it) => it.enabled).length === 0}
            title={!running ? 'RTT 未启动' : !uid ? '未选择探针' : '按顺序发送启用的字符串'}
          >
            {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            {sending ? '发送中...' : '顺序发送'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
