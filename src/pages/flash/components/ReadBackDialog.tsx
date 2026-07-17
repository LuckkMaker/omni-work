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

type ReadMode = 'chip' | 'range'

export function ReadBackDialog() {
  const { showReadBackDialog, setShowReadBackDialog, doReadBack } = useFlashStore()
  const { getDeviceInfo, pendingTarget, connectedTarget } = useProbeStore()

  const [mode, setMode] = useState<ReadMode>('chip')
  const [startAddr, setStartAddr] = useState('')
  const [size, setSize] = useState('')
  const [error, setError] = useState('')

  const targetKey = connectedTarget || pendingTarget || ''
  const devInfo = getDeviceInfo(targetKey)
  const flashBase = devInfo?.flash_base_address ?? '0x08000000'
  const flashSize = (devInfo?.flash_size ?? 1024) * 1024

  useEffect(() => {
    if (showReadBackDialog) {
      setMode('chip')
      setStartAddr(flashBase)
      setSize(`${flashSize}`)
      setError('')
    }
  }, [showReadBackDialog, flashBase, flashSize])

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
    if (mode === 'range') {
      const start = parseHex(startAddr)
      const sz = parseSize(size)
      if (start == null || sz == null || sz <= 0) {
        setError('请输入有效的地址和大小')
        return
      }
      doReadBack('range', start, sz)
    } else {
      doReadBack('chip')
    }
  }

  return (
    <Dialog open={showReadBackDialog} onOpenChange={(open) => { if (!open) setShowReadBackDialog(false) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>读回 Flash</DialogTitle>
          <DialogDescription>读取设备 Flash 内容到当前 tab</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* 模式选择 */}
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'chip'} onChange={() => setMode('chip')} className="accent-primary" />
              <span className="text-sm">Entire Chip</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} className="accent-primary" />
              <span className="text-sm">Range</span>
            </label>
          </div>

          {/* Range 参数 */}
          {mode === 'range' && (
            <div className="space-y-2">
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
              <div className="flex items-center gap-2">
                <label className="text-sm w-16 shrink-0">大小</label>
                <input
                  value={size}
                  onChange={(e) => { setSize(e.target.value); setError('') }}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="如 4096 或 4K"
                  className="flex-1 px-2 py-1 font-mono text-sm bg-transparent border border-border rounded-md outline-none"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowReadBackDialog(false)}>取消</Button>
          <Button onClick={handleConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
