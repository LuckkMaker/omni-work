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

export function BinAddressDialog() {
  const { showBinAddrDialog, confirmBinAddress, setShowBinAddrDialog } = useFlashStore()
  const { getDeviceInfo, pendingTarget, connectedTarget } = useProbeStore()

  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState('')

  const targetKey = connectedTarget || pendingTarget || ''
  const devInfo = getDeviceInfo(targetKey)
  const defaultAddr = devInfo?.flash_base_address
    ? parseInt(devInfo.flash_base_address, 16)
    : 0x08000000

  useEffect(() => {
    if (showBinAddrDialog) {
      setInputValue('0x' + defaultAddr.toString(16).toUpperCase().padStart(8, '0'))
      setError('')
    }
  }, [showBinAddrDialog, defaultAddr])

  const handleConfirm = () => {
    const trimmed = inputValue.trim()
    const addr = parseInt(trimmed, trimmed.toLowerCase().startsWith('0x') ? 16 : 10)
    if (isNaN(addr) || addr < 0) {
      setError('请输入有效的地址（如 0x08000000）')
      return
    }
    confirmBinAddress(addr)
  }

  const handleCancel = () => {
    setShowBinAddrDialog(false)
  }

  return (
    <Dialog open={showBinAddrDialog} onOpenChange={(open) => { if (!open) handleCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Flash 基地址</DialogTitle>
          <DialogDescription>
            BIN 文件不包含地址信息，请输入烧录起始地址。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <input
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
            placeholder="0x08000000"
            spellCheck={false}
            autoComplete="off"
            className="w-full px-3 py-2 font-mono text-sm border border-border rounded-md bg-transparent outline-none focus:border-primary"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>取消</Button>
          <Button onClick={handleConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
