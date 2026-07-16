import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { DeviceInfo } from '@shared/types'

interface TargetDeviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deviceList: DeviceInfo[]
  currentPartNumber: string | null
  onConfirm: (partNumber: string) => void
}

/** 格式化 Flash/RAM 大小：KB → 可读字符串 */
function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`
  return `${kb} KB`
}

/** 列筛选输入框 */
function ColumnFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? '筛选...'}
      className="h-7 w-full text-xs text-center"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    />
  )
}

export function TargetDeviceDialog({
  open,
  onOpenChange,
  deviceList,
  currentPartNumber,
  onConfirm,
}: TargetDeviceDialogProps) {
  const [selected, setSelected] = useState<string | null>(currentPartNumber)

  // 各列独立的筛选值
  const [filters, setFilters] = useState({
    vendor: '',
    device: '',
    core: '',
    flash: '',
    ram: '',
    base: '',
  })

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const filtered = useMemo(() => {
    return deviceList.filter((d) => {
      if (filters.vendor && !d.vendor.toLowerCase().includes(filters.vendor.toLowerCase())) return false
      if (filters.device && !d.display_name.toLowerCase().includes(filters.device.toLowerCase())) return false
      if (filters.core && !d.core.toLowerCase().includes(filters.core.toLowerCase())) return false
      if (filters.flash && !formatSize(d.flash_size).toLowerCase().includes(filters.flash.toLowerCase())) return false
      if (filters.ram && !formatSize(d.ram_size).toLowerCase().includes(filters.ram.toLowerCase())) return false
      if (filters.base && !d.flash_base_address.toLowerCase().includes(filters.base.toLowerCase())) return false
      return true
    })
  }, [deviceList, filters])

  const handleDoubleClick = (partNumber: string) => {
    onConfirm(partNumber)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>选择目标设备</DialogTitle>
        </DialogHeader>

        {/* 设备表格（带列筛选） */}
        <div className="max-h-96 overflow-auto rounded-md border border-border">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              {/* 表头行 */}
              <tr className="border-b border-border bg-muted/50 backdrop-blur">
                <th className="border-r border-border px-2 py-2 text-center font-medium">制造商</th>
                <th className="border-r border-border px-2 py-2 text-center font-medium">设备</th>
                <th className="border-r border-border px-2 py-2 text-center font-medium">内核</th>
                <th className="border-r border-border px-2 py-2 text-center font-medium">Flash 大小</th>
                <th className="border-r border-border px-2 py-2 text-center font-medium">RAM 大小</th>
                <th className="px-2 py-2 text-center font-medium">Flash 基地址</th>
              </tr>
              {/* 筛选输入行 */}
              <tr className="border-b border-border bg-muted/30 pb-1">
                <th className="border-r border-border px-1.5 py-1">
                  <ColumnFilter value={filters.vendor} onChange={(v) => updateFilter('vendor', v)} />
                </th>
                <th className="border-r border-border px-1.5 py-1">
                  <ColumnFilter value={filters.device} onChange={(v) => updateFilter('device', v)} />
                </th>
                <th className="border-r border-border px-1.5 py-1">
                  <ColumnFilter value={filters.core} onChange={(v) => updateFilter('core', v)} />
                </th>
                <th className="border-r border-border px-1.5 py-1">
                  <ColumnFilter value={filters.flash} onChange={(v) => updateFilter('flash', v)} />
                </th>
                <th className="border-r border-border px-1.5 py-1">
                  <ColumnFilter value={filters.ram} onChange={(v) => updateFilter('ram', v)} />
                </th>
                <th className="px-1.5 py-1">
                  <ColumnFilter value={filters.base} onChange={(v) => updateFilter('base', v)} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    无匹配设备
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr
                    key={d.part_number}
                    onClick={() => setSelected(d.part_number)}
                    onDoubleClick={() => handleDoubleClick(d.part_number)}
                    className={cn(
                      'cursor-pointer border-b border-border/50 transition-colors',
                      selected === d.part_number
                        ? 'bg-primary/20'
                        : 'hover:bg-muted/30'
                    )}
                  >
                    <td className="border-r border-border/50 px-3 py-2 text-left">{d.vendor}</td>
                    <td className="border-r border-border/50 px-3 py-2 text-left font-medium">{d.display_name}</td>
                    <td className="border-r border-border/50 px-3 py-2 text-left text-muted-foreground">{d.core}</td>
                    <td className="border-r border-border/50 px-3 py-2 text-left tabular-nums">{formatSize(d.flash_size)}</td>
                    <td className="border-r border-border/50 px-3 py-2 text-left tabular-nums">{formatSize(d.ram_size)}</td>
                    <td className="px-3 py-2 text-left font-mono text-xs">{d.flash_base_address}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">双击设备行选中，点击窗口外取消</p>
      </DialogContent>
    </Dialog>
  )
}
