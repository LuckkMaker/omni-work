/**
 * 接口配置弹窗
 *
 * 配置调试接口（SWD/JTAG）和时钟频率。
 * 参考 J-Link Target Interface 配置界面。
 */
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useProbeStore, SPEED_OPTIONS, DebugInterface } from '@/stores/probe.store'

interface InterfaceConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InterfaceConfigDialog({ open, onOpenChange }: InterfaceConfigDialogProps) {
  const { pendingInterface, pendingSpeed, setPendingInterface, setPendingSpeed } = useProbeStore()

  // 本地编辑状态（确定后才提交到 store）
  const [localInterface, setLocalInterface] = useState<DebugInterface>(pendingInterface)
  const [localSpeed, setLocalSpeed] = useState<number>(pendingSpeed)

  // 打开时同步当前值
  useEffect(() => {
    if (open) {
      setLocalInterface(pendingInterface)
      setLocalSpeed(pendingSpeed)
    }
  }, [open, pendingInterface, pendingSpeed])

  const handleConfirm = () => {
    setPendingInterface(localInterface)
    setPendingSpeed(localSpeed)
    onOpenChange(false)
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>接口配置</DialogTitle>
          <DialogDescription>接口信息和配置</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 接口协议 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">接口协议</label>
            <div className="grid grid-cols-2 gap-2">
              {(['swd', 'jtag'] as DebugInterface[]).map((iface) => (
                <button
                  key={iface}
                  onClick={() => setLocalInterface(iface)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    localInterface === iface
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-accent'
                  }`}
                >
                  {iface.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 时钟频率 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">时钟频率</label>
            <select
              value={localSpeed}
              onChange={(e) => setLocalSpeed(Number(e.target.value))}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {SPEED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>取消</Button>
          <Button onClick={handleConfirm}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
