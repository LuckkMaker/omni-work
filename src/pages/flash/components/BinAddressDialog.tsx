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
import { Input } from '@/components/ui/input'
import { useFlashStore } from '@/stores/flash.store'

export function BinAddressDialog() {
  const { showBinAddrDialog, binBaseAddress, setShowBinAddrDialog, setBinBaseAddress, loadBinWithAddress, clearFile } = useFlashStore()
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState('')

  // 同步外部状态到输入框
  useEffect(() => {
    if (showBinAddrDialog && binBaseAddress != null) {
      setInputValue('0x' + binBaseAddress.toString(16).toUpperCase().padStart(8, '0'))
      setError('')
    }
  }, [showBinAddrDialog, binBaseAddress])

  const handleConfirm = () => {
    const trimmed = inputValue.trim()
    // 支持 0x 前缀的十六进制或纯十进制
    const addr = parseInt(trimmed, trimmed.toLowerCase().startsWith('0x') ? 16 : 10)
    if (isNaN(addr) || addr < 0) {
      setError('请输入有效的地址（如 0x08000000）')
      return
    }
    // 直接传参，避免 store 状态同步时序问题
    loadBinWithAddress(addr)
  }

  const handleCancel = () => {
    setShowBinAddrDialog(false)
    clearFile()
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
          <Input
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
            placeholder="0x08000000"
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
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
