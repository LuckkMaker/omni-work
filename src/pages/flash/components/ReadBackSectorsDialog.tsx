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

export function ReadBackSectorsDialog() {
  const { showReadBackSectorsDialog, setShowReadBackSectorsDialog, doReadBack } = useFlashStore()
  const { getDeviceInfo, getSelectedTarget, pendingTarget } = useProbeStore()

  const [startAddr, setStartAddr] = useState('')
  const [endAddr, setEndAddr] = useState('')
  const [error, setError] = useState('')

  const target = getSelectedTarget()
  const targetKey = target?.part_number ?? pendingTarget ?? ''
  const devInfo = getDeviceInfo(targetKey)
  const flashBase = target?.flash_start ?? parseInt(devInfo?.flash_base_address ?? '0x08000000', 16)
  const flashSize = target?.flash_size ?? (devInfo?.flash_size ?? 1024) * 1024
  const sectorSize = target?.sector_size ?? 0x4000
  const flashEnd = flashBase + flashSize - 1

  useEffect(() => {
    if (showReadBackSectorsDialog) {
      setStartAddr(`0x${flashBase.toString(16).toUpperCase()}`)
      setEndAddr(`0x${flashEnd.toString(16).toUpperCase()}`)
      setError('')
    }
  }, [showReadBackSectorsDialog, flashBase, flashEnd])

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
    // 按扇区对齐
    const alignedStart = Math.floor(start / sectorSize) * sectorSize
    const alignedEnd = Math.ceil((end + 1) / sectorSize) * sectorSize - 1
    const size = alignedEnd - alignedStart + 1
    doReadBack('range', alignedStart, size)
  }

  return (
    <Dialog open={showReadBackSectorsDialog} onOpenChange={(open) => { if (!open) setShowReadBackSectorsDialog(false) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>按扇区读回</DialogTitle>
          <DialogDescription>输入要读取的扇区地址范围（自动按扇区对齐）</DialogDescription>
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

          {/* 结束地址 */}
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

          <p className="text-xs text-muted-foreground">
            每个扇区 {sectorSize >= 1024 ? `${sectorSize / 1024}KB` : `${sectorSize}B`} (0x{sectorSize.toString(16).toUpperCase()})
          </p>

          {/* Flash 信息摘要 */}
          <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <div className="flex justify-between">
              <span>Flash 范围</span>
              <span className="font-mono">0x{flashBase.toString(16).toUpperCase().padStart(8, '0')} ~ 0x{flashEnd.toString(16).toUpperCase().padStart(8, '0')}</span>
            </div>
            <div className="flex justify-between">
              <span>总扇区数</span>
              <span className="font-mono">{Math.ceil(flashSize / sectorSize)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowReadBackSectorsDialog(false)}>取消</Button>
          <Button onClick={handleConfirm}>读取</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
