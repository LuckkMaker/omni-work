import { useState, useEffect, useCallback } from 'react'
import { Search, FileUp, Plus, Check, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useMonitorStore } from '@/stores/monitor.store'
import { useNotificationStore } from '@/stores/notification.store'
import {
  monitorService, type MonitorSymbol, type MonitorVarType,
} from '@/services/monitor.service'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  uid: string | null
}

/** 排序字段 */
type SortKey = 'name' | 'address' | 'type' | 'size'
type SortDir = 'asc' | 'desc'

const VAR_TYPES: MonitorVarType[] = [
  'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'float',
]

export function VariableBrowserDialog({ open, onClose, uid }: Props) {
  const elfPath = useMonitorStore((s) => s.elfPath)
  const elfLoaded = useMonitorStore((s) => s.elfLoaded)
  const symbolCount = useMonitorStore((s) => s.symbolCount)
  const setElf = useMonitorStore((s) => s.setElf)
  const addVariable = useMonitorStore((s) => s.addVariable)
  const pushNotification = useNotificationStore((s) => s.push)

  const [pathInput, setPathInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [symbols, setSymbols] = useState<MonitorSymbol[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('address')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showManual, setShowManual] = useState(false)
  const [manualAddr, setManualAddr] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualType, setManualType] = useState<MonitorVarType>('uint32')

  // 同步 ELF 路径到输入框
  useEffect(() => {
    if (elfPath) setPathInput(elfPath)
  }, [elfPath])

  // 加载符号列表（ELF 已加载时）
  const fetchSymbols = useCallback(async () => {
    if (!uid || !elfLoaded) return
    try {
      const res = await monitorService.getSymbols(uid, {
        filter, type: 'object', page: 1, page_size: 500,
      })
      setSymbols(res.symbols)
    } catch { /* ignore */ }
  }, [uid, elfLoaded, filter])

  useEffect(() => {
    if (open && elfLoaded) fetchSymbols()
  }, [open, elfLoaded, fetchSymbols])

  // ── 加载 ELF ──
  const handleLoadElf = useCallback(async () => {
    if (!uid || !pathInput.trim()) return
    setLoading(true)
    try {
      const res = await monitorService.loadElf(uid, pathInput.trim())
      if (res.success) {
        setElf(pathInput.trim(), res.symbol_count)
        pushNotification({
          type: 'success',
          title: 'ELF 已加载',
          message: `${res.symbol_count} 个变量符号`,
          autoClose: true,
          autoCloseDelay: 3000,
        })
        // 立即拉取符号
        const symRes = await monitorService.getSymbols(uid, {
          type: 'object', page: 1, page_size: 500,
        })
        setSymbols(symRes.symbols)
      }
    } catch (e) {
      pushNotification({
        type: 'error',
        title: 'ELF 加载失败',
        message: e instanceof Error ? e.message : String(e),
        autoClose: true,
        autoCloseDelay: 5000,
      })
    } finally {
      setLoading(false)
    }
  }, [uid, pathInput, setElf, pushNotification])

  // ── 排序 ──
  const sortedSymbols = [...symbols].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'address') cmp = a.address - b.address
    else if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortKey === 'type') cmp = a.type.localeCompare(b.type)
    else if (sortKey === 'size') cmp = a.size - b.size
    return sortDir === 'asc' ? cmp : -cmp
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ── 勾选 ──
  const toggleSelect = (name: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }
  const selectAll = () => setSelected(new Set(sortedSymbols.map((s) => s.name)))
  const clearAll = () => setSelected(new Set())

  // ── 添加到监视 ──
  const handleAddToWatch = useCallback(async () => {
    if (!uid) return
    let added = 0
    for (const sym of sortedSymbols) {
      if (!selected.has(sym.name)) continue
      try {
        const res = await monitorService.addVariable(uid, {
          name: sym.name, address: sym.address, type: sym.type,
        })
        if (res.success) {
          addVariable(res.variable)
          added++
        }
      } catch { /* skip */ }
    }
    // 手动变量
    if (showManual && manualName.trim() && manualAddr.trim()) {
      try {
        const addr = parseInt(manualAddr.trim().replace(/^0x/i, ''), 16)
        if (!isNaN(addr)) {
          const res = await monitorService.addVariable(uid, {
            name: manualName.trim(), address: addr, type: manualType,
          })
          if (res.success) {
            addVariable(res.variable)
            added++
          }
        }
      } catch { /* skip */ }
    }
    if (added > 0) {
      pushNotification({
        type: 'success',
        title: `已添加 ${added} 个变量`,
        message: '',
        autoClose: true,
        autoCloseDelay: 2000,
      })
      setSelected(new Set())
      setShowManual(false)
      setManualAddr('')
      setManualName('')
      onClose()
    }
  }, [uid, sortedSymbols, selected, showManual, manualName, manualAddr, manualType, addVariable, pushNotification, onClose])

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-muted-foreground/40">↕</span>
    return <span className="text-foreground">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>添加变量</DialogTitle>
        </DialogHeader>

        {/* ELF 路径输入 */}
        <div className="flex items-center gap-2">
          <input
            className="flex-1 h-8 rounded border border-border bg-background px-2 text-xs font-mono"
            placeholder="ELF/AXF 文件路径，如 D:\firmware\omni.elf"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadElf()}
          />
          <button
            className="flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={handleLoadElf}
            disabled={loading || !pathInput.trim()}
          >
            <FileUp className="size-3.5" />
            {loading ? '加载中...' : elfLoaded ? '重新加载' : '加载'}
          </button>
        </div>

        {elfLoaded && (
          <>
            {/* 搜索过滤 */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  className="w-full h-7 rounded border border-border bg-background pl-7 pr-2 text-xs"
                  placeholder="Filter on variable name"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {symbolCount} 个符号
              </span>
            </div>

            {/* 符号表格 */}
            <div className="min-h-0 flex-1 overflow-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="w-8 px-2 py-1.5">
                      <Checkbox
                        checked={selected.size > 0 && selected.size === sortedSymbols.length}
                        onCheckedChange={() =>
                          selected.size === sortedSymbols.length ? clearAll() : selectAll()
                        }
                      />
                    </th>
                    <th className="cursor-pointer px-2 py-1.5 text-left font-medium" onClick={() => toggleSort('name')}>
                      Name <SortIcon k="name" />
                    </th>
                    <th className="cursor-pointer px-2 py-1.5 text-left font-medium w-28" onClick={() => toggleSort('address')}>
                      Address <SortIcon k="address" />
                    </th>
                    <th className="cursor-pointer px-2 py-1.5 text-left font-medium w-20" onClick={() => toggleSort('type')}>
                      Type <SortIcon k="type" />
                    </th>
                    <th className="cursor-pointer px-2 py-1.5 text-right font-medium w-12" onClick={() => toggleSort('size')}>
                      Size <SortIcon k="size" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSymbols.map((sym, i) => (
                    <tr
                      key={sym.name}
                      className={cn(
                        'cursor-pointer border-b border-border/50',
                        i % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                        selected.has(sym.name) && 'bg-primary/5'
                      )}
                      onClick={() => toggleSelect(sym.name)}
                    >
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(sym.name)}
                          onCheckedChange={() => toggleSelect(sym.name)}
                        />
                      </td>
                      <td className="px-2 py-1 truncate" title={sym.name}>{sym.name}</td>
                      <td className="px-2 py-1 font-mono">0x{sym.address.toString(16).toUpperCase().padStart(8, '0')}</td>
                      <td className="px-2 py-1 font-mono">{sym.type}</td>
                      <td className="px-2 py-1 text-right font-mono">{sym.size}</td>
                    </tr>
                  ))}
                  {sortedSymbols.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                        {filter ? '无匹配符号' : '无符号'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 手动地址添加 */}
            {showManual && (
              <div className="flex items-center gap-2 rounded border border-border bg-muted/20 p-2">
                <input
                  className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs"
                  placeholder="变量名"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <input
                  className="h-7 w-32 rounded border border-border bg-background px-2 text-xs font-mono"
                  placeholder="0x20000000"
                  value={manualAddr}
                  onChange={(e) => setManualAddr(e.target.value)}
                />
                <select
                  className="h-7 rounded border border-border bg-background px-1 text-xs"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as MonitorVarType)}
                >
                  {VAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setShowManual(false)}
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
          </>
        )}

        <DialogFooter className="flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            {elfLoaded && (
              <>
                <button className="text-xs text-primary hover:underline" onClick={selectAll}>
                  全选
                </button>
                <button className="text-xs text-muted-foreground hover:underline" onClick={clearAll}>
                  取消全选
                </button>
                <span className="text-xs text-muted-foreground">
                  {selected.size} 已选
                </span>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowManual(!showManual)}
                >
                  <Plus className="size-3" />
                  手动地址
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-8 rounded border border-border px-3 text-xs hover:bg-muted/30"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="flex h-8 items-center gap-1 rounded bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={handleAddToWatch}
              disabled={selected.size === 0 && !(showManual && manualName && manualAddr)}
            >
              <Check className="size-3.5" />
              添加到监视
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
