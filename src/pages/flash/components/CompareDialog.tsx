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
import { parseHex } from '../utils/sectors'

export function CompareDialog() {
  const { showCompareDialog, setShowCompareDialog, doCompare } = useFlashStore()

  const [startAddr, setStartAddr] = useState('0x08000000')
  const [compareSize, setCompareSize] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (showCompareDialog) {
      // 默认起始地址为 Flash 常用基地址
      setStartAddr('0x08000000')
      setCompareSize('')
      setError('')
    }
  }, [showCompareDialog])

  const handleSelectFile = async () => {
    // 校验起始地址
    const start = parseHex(startAddr)
    if (start == null) {
      setError('请输入有效的起始地址（十六进制）')
      return
    }
    // 比较大小可选，留空则比较到较短数据末尾
    if (compareSize.trim()) {
      const size = parseHex(compareSize)
      if (size == null || size <= 0) {
        setError('请输入有效的比较大小（十六进制）')
        return
      }
    }

    const path = await window.electron?.openFileDialog?.()
    if (!path) return

    // 先关闭对话框再执行比较
    // 注意：doCompare 当前只接受 filePath，地址/大小参数仅用于前端显示配置（后续可扩展）
    setShowCompareDialog(false)
    void doCompare(path)
  }

  /** 输入框组件：带 0x 前缀（参照 ReadBackRangeDialog 设计） */
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
    <Dialog open={showCompareDialog} onOpenChange={(open) => { if (!open) setShowCompareDialog(false) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>比较</DialogTitle>
          <DialogDescription>选择一个文件与当前 tab 数据进行逐字节对比</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* 比较起始地址 */}
          <div className="flex items-center gap-2">
            <label className="text-sm w-20 shrink-0">起始地址</label>
            <HexInput value={startAddr} onChange={setStartAddr} placeholder="08000000" />
          </div>

          {/* 比较大小（可选） */}
          <div className="flex items-center gap-2">
            <label className="text-sm w-20 shrink-0">比较大小</label>
            <HexInput value={compareSize} onChange={setCompareSize} placeholder="可选，留空比较到末尾" />
          </div>

          {/* 说明 */}
          <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <div>起始地址：比较的基准地址（当前仅用于配置显示，后续可扩展）</div>
            <div>比较大小：留空则比较到两份数据中较短者的末尾</div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCompareDialog(false)}>取消</Button>
          <Button onClick={handleSelectFile}>选择文件...</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
