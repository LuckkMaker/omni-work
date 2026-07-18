import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useFlashStore } from '@/stores/flash.store'
import { useProbeStore } from '@/stores/probe.store'
import { parseHex, formatHex } from '../utils/sectors'

export function ReadBackRangeDialog() {
  const { showReadBackRangeDialog, setShowReadBackRangeDialog, doReadBack } = useFlashStore()
  const { getDeviceInfo, getSelectedTarget, pendingTarget } = useProbeStore()

  const [startAddr, setStartAddr] = useState('')
  const [endAddr, setEndAddr] = useState('')
  const [error, setError] = useState('')

  const target = getSelectedTarget()
  const targetKey = target?.part_number ?? pendingTarget ?? ''
  const devInfo = getDeviceInfo(targetKey)
  const flashBase = target?.flash_start ?? parseInt(devInfo?.flash_base_address ?? '0x08000000', 16)
  const flashSize = target?.flash_size ?? (devInfo?.flash_size ?? 1024) * 1024
  const flashEnd = flashBase + flashSize - 1

  useEffect(() => {
    if (showReadBackRangeDialog) {
      // 默认起始地址为 Flash 基地址，结束地址为 Flash 末尾
      setStartAddr(formatHex(flashBase))
      setEndAddr(formatHex(flashEnd))
      setError('')
    }
  }, [showReadBackRangeDialog, flashBase, flashEnd])

  const handleConfirm = () => {
    const start = parseHex(startAddr)
    if (start == null) {
      setError('请输入有效的起始地址（十六进制）')
      return
    }
    const end = parseHex(endAddr)
    if (end == null) {
      setError('请输入有效的结束地址（十六进制）')
      return
    }
    if (end < start) {
      setError('结束地址不能小于起始地址')
      return
    }
    // 校验是否超出 Flash 范围
    if (start < flashBase) {
      setError(`起始地址超出 Flash 范围（最小 ${formatHex(flashBase)}）`)
      return
    }
    if (end > flashEnd) {
      setError(`结束地址超出 Flash 范围（最大 ${formatHex(flashEnd)}）`)
      return
    }
    // size = end - start + 1
    const size = end - start + 1
    doReadBack('range', start, size)
  }

  /** 输入框组件：带 0x 前缀 */
  const HexInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <div className="flex items-center flex-1 rounded-md border border-border overflow-hidden focus-within:ring-1 focus-within:ring-ring">
      <span className="px-1.5 py-1 text-xs font-mono text-muted-foreground bg-muted/50 border-r border-border">0x</span>
      <input
        value={value.replace(/^0x/i, '')}
        onChange={(e) => { onChange(e.target.value); setError('') }}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        className="flex-1 px-1.5 py-1 font-mono text-sm bg-transparent outline-none"
      />
    </div>
  )

  return (
    <Dialog open={showReadBackRangeDialog} onOpenChange={(open) => { if (!open) setShowReadBackRangeDialog(false) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>按地址范围读回</DialogTitle>
          <DialogDescription>输入起始地址和结束地址，读取 Flash 内容</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* 起始地址 */}
          <div className="flex items-center gap-2">
            <label className="text-sm w-16 shrink-0">起始地址</label>
            <HexInput value={startAddr} onChange={setStartAddr} />
          </div>

          {/* 结束地址 */}
          <div className="flex items-center gap-2">
            <label className="text-sm w-16 shrink-0">结束地址</label>
            <HexInput value={endAddr} onChange={setEndAddr} />
          </div>

          {/* 读取大小（自动计算） */}
          {(() => {
            const s = parseHex(startAddr)
            const e = parseHex(endAddr)
            if (s != null && e != null && e >= s) {
              const sz = e - s + 1
              return (
                <p className="text-xs text-muted-foreground">
                  读取大小：<span className="font-mono">{sz >= 1024 * 1024 ? `${(sz / (1024 * 1024)).toFixed(2)} MB` : sz >= 1024 ? `${(sz / 1024).toFixed(1)} KB` : `${sz} B`}</span>
                </p>
              )
            }
            return null
          })()}

          {/* Flash 信息摘要 */}
          <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <div className="flex justify-between">
              <span>Flash 范围</span>
              <span className="font-mono">{formatHex(flashBase)} - {formatHex(flashEnd)}</span>
            </div>
            <div className="flex justify-between">
              <span>Flash 总大小</span>
              <span className="font-mono">{flashSize >= 1024 * 1024 ? `${flashSize / (1024 * 1024)}MB` : `${flashSize / 1024}KB`}</span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowReadBackRangeDialog(false)}>取消</Button>
          <Button onClick={handleConfirm}>读取</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
