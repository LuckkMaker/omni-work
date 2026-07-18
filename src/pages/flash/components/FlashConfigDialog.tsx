/**
 * Flash 配置弹窗（参考 J-Link Flash 配置界面）
 *
 * 布局：
 * 1. Flash Bank 选择 + 基地址显示
 * 2. Flash 设备信息（厂商、设备、大小、扇区数）
 * 3. 扇区表格（带复选框，支持 All/None/Invert）
 * 4. 底部摘要
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TargetInfo, DeviceInfo } from '@shared/types'
import { getFlashRegions, getSectors, formatSize, formatHex } from '../utils/sectors'

interface FlashConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: TargetInfo | null
  deviceInfo?: DeviceInfo
  /** 选中的扇区索引集合（受控） */
  selectedSectors?: Set<number>
  /** 选中扇区变更回调（实时） */
  onSelectedSectorsChange?: (sectors: Set<number>) => void
  /** 确定回调，传递最终选中的扇区 */
  onConfirm?: (sectors: Set<number>) => void
}

export function FlashConfigDialog({
  open,
  onOpenChange,
  target,
  deviceInfo,
  selectedSectors,
  onSelectedSectorsChange,
  onConfirm,
}: FlashConfigDialogProps) {
  const regions = useMemo(() => getFlashRegions(target, deviceInfo), [target, deviceInfo])
  const sectors = useMemo(() => getSectors(target, deviceInfo), [target, deviceInfo])

  // 内部编辑缓冲区：打开时从外部初始值复制，编辑期间所有操作针对缓冲区，
  // 确定时一次性提交，取消则丢弃。
  const [draft, setDraft] = useState<Set<number>>(new Set())

  // 打开弹窗时初始化缓冲区：用外部值，若为空则默认全选
  useEffect(() => {
    if (open) {
      if (selectedSectors && selectedSectors.size > 0) {
        setDraft(new Set(selectedSectors))
      } else if (sectors.length > 0) {
        setDraft(new Set(sectors.map((s) => s.index)))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // selected 始终读 draft，setSelected 始终写 draft
  const selected = draft
  const setSelected = setDraft

  const handleConfirm = () => {
    onConfirm?.(new Set(draft))
    onOpenChange(false)
  }

  const totalFlash = useMemo(
    () => regions.reduce((sum, r) => sum + r.length, 0),
    [regions]
  )

  // 计算选中扇区的连续 range 列表（不连续的 range 独立列出）
  const summary = useMemo(() => {
    if (selected.size === 0) return null
    // 按地址排序选中的扇区
    const selectedSectorsList = sectors
      .filter((s) => selected.has(s.index))
      .sort((a, b) => a.address - b.address)
    if (selectedSectorsList.length === 0) return null

    // 合并连续的扇区为 range
    const ranges: { start: number; end: number }[] = []
    let currentRange: { start: number; end: number } | null = null
    for (const s of selectedSectorsList) {
      const sectorEnd = s.address + s.size - 1
      if (currentRange && s.address === currentRange.end + 1) {
        // 连续，扩展当前 range
        currentRange.end = sectorEnd
      } else {
        // 不连续，开始新 range
        if (currentRange) ranges.push(currentRange)
        currentRange = { start: s.address, end: sectorEnd }
      }
    }
    if (currentRange) ranges.push(currentRange)

    return { count: selectedSectorsList.length, ranges }
  }, [selected, sectors])

  const toggleSector = useCallback((index: number) => {
    setSelected((prev: Set<number>) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [setSelected])

  const selectAll = useCallback(() => {
    setSelected(new Set(sectors.map((s) => s.index)))
  }, [sectors, setSelected])

  const selectNone = useCallback(() => {
    setSelected(new Set())
  }, [setSelected])

  const invertSelection = useCallback(() => {
    setSelected(new Set(sectors.filter((s) => !selected.has(s.index)).map((s) => s.index)))
  }, [sectors, selected, setSelected])

  // 获取扇区所属的 region 序号
  const getRegionIndex = useCallback((addr: number): number => {
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i]
      if (addr >= r.start && addr < r.start + r.length) return i
    }
    return 0
  }, [regions])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Flash 配置</DialogTitle>
          <DialogDescription>
            Flash 信息和配置
          </DialogDescription>
        </DialogHeader>

        {/* Section 1: Flash Bank */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground w-20 shrink-0">Flash Bank</label>
            <select
              className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs"
              defaultValue="bank0"
            >
              <option value="bank0">Bank 0 (Internal flash)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground w-20 shrink-0">Base Address</label>
            <div className="flex-1 h-7 rounded-md border border-input bg-muted/30 px-2 text-xs font-mono flex items-center">
              {regions.length > 0 ? formatHex(regions[0].start) : '-'}
            </div>
          </div>
        </div>

        {/* Section 2: Flash Device Info */}
        <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <InfoRow label="Size" value={formatSize(totalFlash)} />
            <InfoRow label="Sectors" value={`${sectors.length}`} />
          </div>
        </div>

        {/* Section 3: Sector Table */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground">
              Sectors ({sectors.length})
            </h4>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={selectAll}>
                All
              </Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={selectNone}>
                None
              </Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={invertSelection}>
                Invert
              </Button>
            </div>
          </div>
          <div className="flex-1 border rounded-md overflow-y-auto" style={{ maxHeight: '300px' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
                <tr>
                  <th className="w-8 px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="size-3 accent-primary cursor-pointer"
                      checked={selected.size === sectors.length && sectors.length > 0}
                      ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < sectors.length }}
                      onChange={(e) => e.target.checked ? selectAll() : selectNone()}
                    />
                  </th>
                  <th className="text-left px-2 py-1.5 font-medium">Sector</th>
                  <th className="text-left px-2 py-1.5 font-medium">Range</th>
                  <th className="text-left px-2 py-1.5 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {sectors.map((s) => {
                  const regionIdx = getRegionIndex(s.address)
                  const isChecked = selected.has(s.index)
                  return (
                    <tr
                      key={s.index}
                      onClick={() => toggleSector(s.index)}
                      className={cn(
                        'border-t cursor-pointer transition-colors',
                        isChecked ? 'bg-primary/10' : 'hover:bg-muted/40'
                      )}
                    >
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          className="size-3 accent-primary cursor-pointer"
                          checked={isChecked}
                          onChange={() => toggleSector(s.index)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {s.index}
                        {regions.length > 1 && (
                          <span className="ml-1 text-[10px] text-muted-foreground/60">R{regionIdx}</span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {formatHex(s.address)} - {formatHex(s.address + s.size - 1)}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">{formatSize(s.size)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Summary */}
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs font-mono">
          {summary ? (
            <div className="space-y-0.5">
              <div>
                {summary.count} Sectors, {summary.ranges.length} Range{summary.ranges.length > 1 ? 's' : ''}:
              </div>
              {summary.ranges.map((r, i) => (
                <div key={i} className="text-foreground">
                  {formatHex(r.start)} - {formatHex(r.end)}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">No sectors selected</span>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleConfirm}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
