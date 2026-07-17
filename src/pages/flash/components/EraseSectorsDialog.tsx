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

export function EraseSectorsDialog() {
  const { showEraseSectorsDialog, setShowEraseSectorsDialog, doEraseSectors } = useFlashStore()
  const { getDeviceInfo, pendingTarget, connectedTarget } = useProbeStore()

  const [startAddr, setStartAddr] = useState('')
  const [endAddr, setEndAddr] = useState('')
  const [error, setError] = useState('')

  const targetKey = connectedTarget || pendingTarget || ''
  const devInfo = getDeviceInfo(targetKey)
  const flashBase = devInfo?.flash_base_address ?? '0x08000000'
  const flashSize = (devInfo?.flash_size ?? 1024) * 1024
  const flashEnd = parseInt(flashBase, 16) + flashSize - 1

  useEffect(() => {
    if (showEraseSectorsDialog) {
      setStartAddr(flashBase)
      setEndAddr(`0x${flashEnd.toString(16).toUpperCase()}`)
      setError('')
    }
  }, [showEraseSectorsDialog, flashBase, flashEnd])

  const parseHex = (s: string): number | null => {
    const t = s.trim().toLowerCase()
    if (!t) return null
    const v = t.startsWith('0x') ? parseInt(t, 16) : parseInt(t, 16)
    return isNaN(v) ? null : v
  }

  const handleConfirm = () => {
    const start = parseHex(startAddr)
    const end = parseHex(endAddr)
    if (start == null || end == null) {
      setError('请输入有效的十六进制地址')
      return
    }
    if (end <= start) {
      setError('结束地址必须大于起始地址')
      return
    }
    doEraseSectors(start, end - start + 1)
  }

  return (
    <Dialog open={showEraseSectorsDialog} onOpenChange={(open) => { if (!open) setShowEraseSectorsDialog(false) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>扇区擦除</DialogTitle>
          <DialogDescription>输入要擦除的地址范围</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
            <label className="text-sm w-16 shrink-0">结束地址</label>
            <div className="flex items-center flex-1 rounded-md border border-border overflow-hidden">
              <span className="px-1.5 py-1 text-xs font-mono text-muted-foreground bg-muted/50 border-r border-border">0x</span>
              <input
                value={endAddr.replace(/^0x/i, '')}
                onChange={(e) => { setEndAddr(e.target.value); setError('') }}
                spellCheck={false}
                autoComplete="off"
                className="flex-1 px-1.5 py-1 font-mono text-sm bg-transparent outline-none"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowEraseSectorsDialog(false)}>取消</Button>
          <Button onClick={handleConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
