import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** 保存格式 */
export type SaveFormat = 'txt' | 'log' | 'csv' | 'bin'

interface SaveFormatOption {
  value: SaveFormat
  label: string
  desc: string
}

const SAVE_FORMATS: SaveFormatOption[] = [
  { value: 'txt', label: 'TXT', desc: 'UTF-8 文本' },
  { value: 'log', label: 'LOG', desc: '带时间戳的文本' },
  { value: 'csv', label: 'CSV', desc: '十六进制+ASCII 表格' },
  { value: 'bin', label: 'BIN', desc: '原始二进制' },
]

interface SaveFormatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (format: SaveFormat) => void
  dataSize: number
}

/** 保存数据格式选择对话框 */
export function SaveFormatDialog({ open, onOpenChange, onConfirm, dataSize }: SaveFormatDialogProps) {
  const [selected, setSelected] = useState<SaveFormat>('txt')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>选择保存格式</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-xs text-muted-foreground">
            数据大小：{dataSize < 1024 ? `${dataSize} B` : `${(dataSize / 1024).toFixed(1)} KB`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SAVE_FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setSelected(f.value)}
                className={cn(
                  'flex flex-col items-start rounded-md border p-2.5 text-left transition-colors',
                  selected === f.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/50'
                )}
              >
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-[10px] text-muted-foreground">{f.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={() => { onConfirm(selected); onOpenChange(false) }}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
