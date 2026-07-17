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

export function ReadBackRangeDialog() {
  const { showReadBackRangeDialog, setShowReadBackRangeDialog, doReadBack } = useFlashStore()
  const { getDeviceInfo, getSelectedTarget, pendingTarget } = useProbeStore()

  const [startAddr, setStartAddr] = useState('')
  const [size, setSize] = useState('')
  const [error, setError] = useState('')

  const target = getSelectedTarget()
  const targetKey = target?.part_number ?? pendingTarget ?? ''
  const devInfo = getDeviceInfo(targetKey)
  const flashBase = target?.flash_start ?? parseInt(devInfo?.flash_base_address ?? '0x08000000', 16)
  const flashSize = target?.flash_size ?? (devInfo?.flash_size ?? 1024) * 1024

  useEffect(() => {
    if (showReadBackRangeDialog) {
      setStartAddr(`0x${flashBase.toString(16).toUpperCase()}`)
      setSize('4K')
      setError('')
    }
  }, [showReadBackRangeDialog, flashBase])

  const parseHex = (s: string): number | null => {
    const t = s.trim().toLowerCase()
    if (!t) return null
    const v = t.startsWith('0x') ? parseInt(t, 16) : parseInt(t, 16)
    return isNaN(v) ? null : v
  }

  const parseSize = (s: string): number | null => {
    const t = s.trim().toLowerCase()
    if (!t) return null
    if (t.endsWith('k')) return parseInt(t, 10) * 1024
    if (t.endsWith('m')) return parseInt(t, 10) * 1024 * 1024
    const v = t.startsWith('0x') ? parseInt(t, 16) : parseInt(t, 10)
    return isNaN(v) ? null : v
  }

  const handleConfirm = () => {
    const start = parseHex(startAddr)
    if (start == null) {
      setError('请输入有效的起始地址')
      return
    }
    const sz = parseSize(size)
    if (sz == null || sz <= 0) {
      setError('请输入有效的大小')
      return
    }
    if (start + sz > flashBase + flashSize) {
      setError('读取范围超出 Flash 边界')
      return
    }
    doReadBack('range', start, sz)
  }

  return (
    <Dialog open={showReadBackRangeDialog} onOpenChange={(open) => { if (!open) setShowReadBackRangeDialog(false) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>按地址范围读回</DialogTitle>
          <DialogDescription>输入起始地址和大小，读取 Flash 内容</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* 起始地址 */}
          <div className="flex items-center gap-2">
            <label className="text-sm w-16 shrink-0">起始地址</label>
            <div className="flex items-center flex-1 rounded-md border border-border overflow-hidden">
              <span className="px-1.5 py-1 text-xs font-mono text-muted-foreground bg-muted/50 border-r border-border">0x</span>
              <input
                value={startAddr.replace(/^0x/i, '')}
                onChange={(e) => { setStartAddr(e.target.value); setError('') }}
                spellCheck={false}
                autoComplete="off"
                className="flex-1 px-1.5 py-1 font-mono text-sm bg-transparent outline-none"
              />
            </div>
          </div>

          {/* 大小 */}
          <div className="flex items-center gap-2">
            <label className="text-sm w-16 shrink-0">大小</label>
            <input
              value={size}
              onChange={(e) => { setSize(e.target.value); setError('') }}
              spellCheck={false}
              autoComplete="off"
              placeholder="如 4096 或 4K 或 1M"
              className="flex-1 px-2 py-1 font-mono text-sm bg-transparent border border-border rounded-md outline-none"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            支持 K/M 后缀，如 4K = 4096 字节
          </p>

          {/* Flash 信息摘要 */}
          <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <div className="flex justify-between">
              <span>Flash 基址</span>
              <span className="font-mono">0x{flashBase.toString(16).toUpperCase().padStart(8, '0')}</span>
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
