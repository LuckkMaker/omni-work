import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Eye, EyeOff, FileUp, Search, Loader2,
  Radio, Zap, AlertTriangle, Check, Trash2, Play, Square, Gauge,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import { useMonitorStore } from '@/stores/monitor.store'
import { useNotificationStore } from '@/stores/notification.store'
import {
  monitorService, type MonitorSymbol, type MonitorVarType,
} from '@/services/monitor.service'
import { cn } from '@/lib/utils'

interface Props {
  uid: string | null
  isConnected: boolean
  onToggleSampling: () => void
}

/** 手动地址输入支持的数据类型 */
const VAR_TYPES: MonitorVarType[] = [
  'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'float',
]

/** 采样率档位（Hz） */
const RATE_OPTIONS = [
  { label: '1 Hz', value: 1 },
  { label: '10 Hz', value: 10 },
  { label: '100 Hz', value: 100 },
  { label: '500 Hz', value: 500 },
  { label: '1 kHz', value: 1000 },
  { label: '5 kHz', value: 5000 },
  { label: '10 kHz', value: 10000 },
  { label: '50 kHz', value: 50000 },
  { label: '100 kHz', value: 100000 },
]

/** 时基档位（秒，作为 Follow/触发模式的时间窗口宽度） */
const TIMEBASE_OPTIONS = [
  { label: '1 ms/div', value: 0.001 },
  { label: '10 ms/div', value: 0.01 },
  { label: '100 ms/div', value: 0.1 },
  { label: '1 s/div', value: 1 },
  { label: '10 s/div', value: 10 },
  { label: '60 s/div', value: 60 },
]

/** 触发方式 */
type ChannelTriggerMode = 'none' | 'rising' | 'falling' | 'level'
const TRIGGER_MODES: { value: ChannelTriggerMode; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'rising', label: '上升沿' },
  { value: 'falling', label: '下降沿' },
  { value: 'level', label: '电平' },
]

export function ChannelPanel({ uid, isConnected, onToggleSampling }: Props) {
  const variables = useMonitorStore((s) => s.variables)
  const channels = useMonitorStore((s) => s.channels)
  const samples = useMonitorStore((s) => s.samples)
  const running = useMonitorStore((s) => s.running)
  const paused = useMonitorStore((s) => s.paused)
  const starting = useMonitorStore((s) => s.starting)
  const transport = useMonitorStore((s) => s.transport)
  const elfPath = useMonitorStore((s) => s.elfPath)
  const elfLoaded = useMonitorStore((s) => s.elfLoaded)
  const symbolCount = useMonitorStore((s) => s.symbolCount)
  const rateHz = useMonitorStore((s) => s.rateHz)
  const follow = useMonitorStore((s) => s.follow)
  const timebase = useMonitorStore((s) => s.timebase)
  const setTransport = useMonitorStore((s) => s.setTransport)
  const setRateHz = useMonitorStore((s) => s.setRateHz)
  const setFollow = useMonitorStore((s) => s.setFollow)
  const setTimebase = useMonitorStore((s) => s.setTimebase)
  const setElf = useMonitorStore((s) => s.setElf)
  const addVariable = useMonitorStore((s) => s.addVariable)
  const removeVariable = useMonitorStore((s) => s.removeVariable)
  const setChannel = useMonitorStore((s) => s.setChannel)
  const pushNotification = useNotificationStore((s) => s.push)

  // ELF 加载与符号浏览状态
  const [loading, setLoading] = useState(false)
  const [symbols, setSymbols] = useState<MonitorSymbol[]>([])
  const [filter, setFilter] = useState('')
  // 选中的标量/数组整体（全选元素）
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // 数组部分元素选择（不连续多选）：symName -> Set<elemIndex>
  const [elemSel, setElemSel] = useState<Record<string, Set<number>>>({})
  // 展开的数组符号（二级元素列表）
  const [expandedArrays, setExpandedArrays] = useState<Set<string>>(new Set())
  // 折叠的源文件分组
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)

  // 手动地址输入
  const [showManual, setShowManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualAddr, setManualAddr] = useState('')
  const [manualType, setManualType] = useState<MonitorVarType>('uint32')
  const [manualErr, setManualErr] = useState<string | null>(null)

  // 取最新采样值
  const lastSample = samples[samples.length - 1]
  const lastValues = new Map<string, number | null>()
  if (lastSample) {
    for (const v of lastSample.values) lastValues.set(v.id, v.value)
  }

  // ── 按源文件分组 ──
  const groupedSymbols = useMemo(() => {
    const filtered = filter
      ? symbols.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
      : symbols
    const groups = new Map<string, MonitorSymbol[]>()
    for (const sym of filtered) {
      const file = sym.source_file || 'unknown'
      if (!groups.has(file)) groups.set(file, [])
      groups.get(file)!.push(sym)
    }
    // 每组内按名称排序
    for (const arr of groups.values()) arr.sort((a, b) => a.name.localeCompare(b.name))
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [symbols, filter])

  // ELF 已加载时拉取符号列表
  const fetchSymbols = useCallback(async () => {
    if (!uid || !elfLoaded) return
    try {
      const res = await monitorService.getSymbols(uid, {
        filter, type: 'object', page: 1, page_size: 2000,
      })
      setSymbols(res.symbols)
    } catch { /* ignore */ }
  }, [uid, elfLoaded, filter])

  useEffect(() => {
    if (elfLoaded) fetchSymbols()
  }, [elfLoaded, fetchSymbols])

  // ── 加载 ELF 文件（只支持 elf/axf）──
  const handleLoadElf = useCallback(async () => {
    if (!uid) return
    const filePath = await window.electron?.openFileDialog?.({
      extensions: ['elf', 'axf'],
      title: '选择 ELF/AXF 文件',
    })
    if (!filePath) return
    setLoading(true)
    try {
      const res = await monitorService.loadElf(uid, filePath)
      if (res.success) {
        setElf(filePath, res.symbol_count)
        pushNotification({
          type: 'success',
          title: 'ELF 已加载',
          message: `${res.symbol_count} 个变量符号`,
          autoClose: true, autoCloseDelay: 3000,
        })
        const symRes = await monitorService.getSymbols(uid, {
          type: 'object', page: 1, page_size: 2000,
        })
        setSymbols(symRes.symbols)
        setSelected(new Set())
        setElemSel({})
        setExpandedArrays(new Set())
      }
    } catch (e) {
      pushNotification({
        type: 'error', title: 'ELF 加载失败',
        message: e instanceof Error ? e.message : String(e),
        autoClose: true, autoCloseDelay: 5000,
      })
    } finally {
      setLoading(false)
    }
  }, [uid, setElf, pushNotification])

  // ── 分组折叠 ──
  const toggleGroup = (file: string) => {
    setCollapsedGroups((s) => {
      const next = new Set(s)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  // ── 标量/数组整体勾选 ──
  const toggleSelect = (name: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(name)) {
        next.delete(name)
        // 清理元素部分选择
        setElemSel((m) => { const c = { ...m }; delete c[name]; return c })
      } else {
        next.add(name)
      }
      return next
    })
  }

  // ── 数组展开/收起 ──
  const toggleArrayExpand = (name: string) => {
    setExpandedArrays((s) => {
      const next = new Set(s)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // ── 数组元素勾选（不连续多选）──
  const toggleElem = (name: string, idx: number) => {
    setElemSel((m) => {
      const next = { ...m }
      const set = new Set(next[name] ?? [])
      if (set.has(idx)) set.delete(idx)
      else set.add(idx)
      if (set.size === 0) delete next[name]
      else next[name] = set
      return next
    })
  }

  // ── 添加到监视 ──
  const handleAddToWatch = useCallback(async () => {
    if (!uid) return
    setAdding(true)
    let added = 0
    let failed = 0
    for (const sym of symbols) {
      const isWhole = selected.has(sym.name)
      const partSet = elemSel[sym.name]
      if (!isWhole && !partSet) continue
      try {
        if (sym.is_array) {
          // 确定要添加的元素索引集合
          const indices: number[] = []
          if (partSet && partSet.size > 0) {
            // 部分选择优先（支持不连续）
            indices.push(...Array.from(partSet).sort((a, b) => a - b))
          } else if (isWhole) {
            // 整体勾选 = 全部元素
            for (let i = 0; i < sym.elem_count; i++) indices.push(i)
          }
          for (const i of indices) {
            try {
              const res = await monitorService.addVariable(uid, {
                name: sym.name, address: sym.address, type: sym.elem_type,
                elem_index: i,
              })
              if (res.success) { addVariable(res.variable); added++ }
              else failed++
            } catch { failed++ }
          }
        } else {
          const res = await monitorService.addVariable(uid, {
            name: sym.name, address: sym.address, type: sym.type,
          })
          if (res.success) { addVariable(res.variable); added++ }
          else failed++
        }
      } catch { failed++ }
    }
    setAdding(false)
    if (added > 0) {
      pushNotification({
        type: 'success', title: `已添加 ${added} 个变量`,
        message: failed > 0 ? `${failed} 个失败（地址不可读或非法）` : '',
        autoClose: true, autoCloseDelay: 3000,
      })
      setSelected(new Set())
      setElemSel({})
    } else if (failed > 0) {
      pushNotification({
        type: 'error', title: '添加失败',
        message: `${failed} 个变量地址不可读或非法`,
        autoClose: true, autoCloseDelay: 5000,
      })
    }
  }, [uid, symbols, selected, elemSel, addVariable, pushNotification])

  // ── 删除监视变量 ──
  const handleRemoveVar = useCallback(async (id: string) => {
    if (!uid) return
    try {
      await monitorService.removeVariable(uid, id)
      removeVariable(id)
    } catch (e) {
      pushNotification({
        type: 'error', title: '移除失败',
        message: e instanceof Error ? e.message : String(e),
        autoClose: true, autoCloseDelay: 3000,
      })
    }
  }, [uid, removeVariable, pushNotification])

  // ── 手动地址格式校验 ──
  const validateManual = (): { ok: boolean; addr?: number; msg?: string } => {
    if (!manualName.trim()) return { ok: false, msg: '请输入变量名' }
    if (variables.some((v) => v.name === manualName.trim())) {
      return { ok: false, msg: '变量名已存在' }
    }
    const addrStr = manualAddr.trim().replace(/^0x/i, '')
    if (!/^[0-9a-fA-F]+$/.test(addrStr)) {
      return { ok: false, msg: '地址格式错误（需 0x 前缀十六进制或十进制）' }
    }
    const isHex = manualAddr.trim().toLowerCase().startsWith('0x')
    const addr = parseInt(manualAddr.trim(), isHex ? 16 : 10)
    if (isNaN(addr) || addr < 0 || addr > 0xffffffff) {
      return { ok: false, msg: '地址超出 32 位范围' }
    }
    if (addr === 0) return { ok: false, msg: '地址 0x00000000 通常非法' }
    return { ok: true, addr }
  }

  const handleAddManual = useCallback(async () => {
    if (!uid) return
    setManualErr(null)
    const v = validateManual()
    if (!v.ok) { setManualErr(v.msg!); return }
    try {
      const res = await monitorService.addVariable(uid, {
        name: manualName.trim(), address: v.addr!, type: manualType,
      })
      if (res.success) {
        addVariable(res.variable)
        pushNotification({
          type: 'success', title: '已添加手动变量',
          message: `${manualName.trim()} @ 0x${(v.addr! >>> 0).toString(16).toUpperCase().padStart(8, '0')}`,
          autoClose: true, autoCloseDelay: 3000,
        })
        setManualName(''); setManualAddr(''); setShowManual(false)
      } else {
        setManualErr('地址不可读（探针已连接时后端会探测）')
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
        ?? (e instanceof Error ? e.message : String(e))
      setManualErr(msg)
    }
  }, [uid, manualName, manualAddr, manualType, variables, addVariable, pushNotification])

  // 选中总数（用于"添加到监视"按钮）
  const selCount = useMemo(() => {
    let n = 0
    for (const sym of symbols) {
      if (selected.has(sym.name)) {
        n += sym.is_array ? sym.elem_count : 1
      } else if (elemSel[sym.name]?.size) {
        n += elemSel[sym.name]!.size
      }
    }
    return n
  }, [symbols, selected, elemSel])

  return (
    <div className="flex h-full flex-col">
      {/* ── 工具栏 ── */}
      <div className="border-b border-border p-2 space-y-2">
        {/* 采样模式切换：RTT 同步 / HSS 异步 */}
        <div className="flex items-center rounded-md border border-border p-0.5">
          <button
            onClick={() => !running && setTransport('rtt')}
            disabled={running}
            className={cn(
              'flex h-6 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors',
              transport === 'rtt' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              running && 'opacity-50 cursor-not-allowed',
            )}
            title="RTT 同步：固件集成 SEGGER_RTT 主动推送，速度快、与代码同步，但侵入固件"
          >
            <Radio className="size-3" /> RTT
          </button>
          <button
            onClick={() => !running && setTransport('swd')}
            disabled={running}
            className={cn(
              'flex h-6 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors',
              transport === 'swd' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              running && 'opacity-50 cursor-not-allowed',
            )}
            title="HSS 异步：调试器通过 SWD 直接读内存，非侵入，速度受调试接口限制"
          >
            <Zap className="size-3" /> HSS
          </button>
        </div>

        {/* 加载 ELF */}
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded border border-primary bg-primary/10 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
          onClick={handleLoadElf}
          disabled={!uid || loading || running}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />}
          {loading ? '加载中...' : elfLoaded ? '重新加载 ELF' : '加载 ELF 文件'}
        </button>
        {elfLoaded && elfPath && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="truncate" title={elfPath}>{elfPath.split(/[\\/]/).pop()}</span>
            <span className="shrink-0">· {symbolCount} 符号</span>
          </div>
        )}

        {/* 采样率 + 时基 */}
        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="h-7 rounded border border-border bg-background px-1 text-[11px]"
            value={rateHz}
            onChange={(e) => setRateHz(Number(e.target.value))}
            disabled={running}
            title="采样率"
          >
            {RATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            className="h-7 rounded border border-border bg-background px-1 text-[11px]"
            value={timebase}
            onChange={(e) => setTimebase(Number(e.target.value))}
            title="时基（时间窗口宽度）"
          >
            {TIMEBASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Follow + 启停 */}
        <div className="flex gap-1.5">
          <button
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1 rounded border text-[11px] transition-colors',
              follow ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/30',
            )}
            onClick={() => setFollow(!follow)}
            title="Follow 模式：跟随最新数据滚动；启用触发时以触发点对齐"
          >
            <Gauge className="size-3" /> Follow
          </button>
          <button
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors',
              running
                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
              starting && 'opacity-60 cursor-wait',
            )}
            onClick={onToggleSampling}
            disabled={!isConnected || starting || (running && paused)}
          >
            {running ? <Square className="size-3" /> : <Play className="size-3" />}
            {running ? '停止' : starting ? '启动中...' : '启动'}
          </button>
        </div>

        {transport === 'rtt' && (
          <div className="flex items-start gap-1 rounded border border-amber-500/30 bg-amber-500/10 p-1.5 text-[10px] text-amber-600">
            <AlertTriangle className="size-3 shrink-0 mt-0.5" />
            <span>RTT 模式需固件集成 SEGGER_RTT 并按协议写采样数据，变量 id 按添加顺序对应。</span>
          </div>
        )}
      </div>

      {/* ── 变量浏览（ELF 已加载）── */}
      {elfLoaded && (
        <div className="flex min-h-0 flex-1 flex-col border-b border-border">
          {/* 搜索 */}
          <div className="flex items-center gap-1.5 p-2 pb-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <input
                className="w-full h-6 rounded border border-border bg-background pl-6 pr-2 text-[11px]"
                placeholder="过滤变量名"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">{symbols.length}</span>
          </div>

          {/* 分组符号列表 */}
          <div className="min-h-0 flex-1 overflow-auto px-1">
            {groupedSymbols.map(([file, syms]) => {
              const collapsed = collapsedGroups.has(file)
              return (
                <div key={file} className="mb-1">
                  {/* 组头 */}
                  <button
                    className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-medium hover:bg-muted/30"
                    onClick={() => toggleGroup(file)}
                  >
                    {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                    <span className="truncate" title={file}>{file.split(/[\\/]/).pop()}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{syms.length}</span>
                  </button>
                  {/* 组内符号 */}
                  {!collapsed && (
                    <table className="w-full text-[11px]">
                      <tbody>
                        {syms.map((sym) => {
                          const isSel = selected.has(sym.name)
                          const isExp = expandedArrays.has(sym.name)
                          const partSet = elemSel[sym.name]
                          return (
                            <Fragment key={sym.name}>
                              <tr
                                className={cn('cursor-pointer border-b border-border/30', isSel && 'bg-primary/5')}
                                onClick={() => toggleSelect(sym.name)}
                              >
                                <td className="w-5 px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="size-3 cursor-pointer"
                                    checked={isSel}
                                    onChange={() => toggleSelect(sym.name)}
                                  />
                                </td>
                                <td className="px-1 py-0.5">
                                  <div className="flex items-center gap-0.5">
                                    {sym.is_array && sym.elem_count > 0 && (
                                      <button
                                        className="text-muted-foreground hover:text-foreground"
                                        onClick={(e) => { e.stopPropagation(); toggleArrayExpand(sym.name) }}
                                        title={isExp ? '收起元素' : '展开元素'}
                                      >
                                        {isExp ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                                      </button>
                                    )}
                                    <span className="truncate" title={sym.name}>
                                      {sym.name}
                                      {sym.is_array && <span className="text-muted-foreground">[{sym.elem_count}]</span>}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-1 py-0.5 font-mono text-[10px] w-16">
                                  {sym.is_array ? `${sym.elem_type}[${sym.elem_count}]` : sym.type}
                                </td>
                                <td className="px-1 py-0.5 font-mono text-[10px] text-center w-10">{sym.size}</td>
                                <td className="px-1 py-0.5 font-mono text-[10px] w-16">
                                  0x{sym.address.toString(16).toUpperCase().padStart(8, '0').slice(-4)}
                                </td>
                              </tr>
                              {/* 数组元素二级列表（展开） */}
                              {sym.is_array && isExp && (
                                <>
                                  {partSet && partSet.size > 0 && !isSel && (
                                    <tr className="bg-primary/5">
                                      <td colSpan={5} className="px-2 py-0.5 text-[10px] text-primary">
                                        已选 {partSet.size}/{sym.elem_count} 个元素
                                      </td>
                                    </tr>
                                  )}
                                  {Array.from({ length: sym.elem_count }, (_, i) => {
                                    const elemAddr = sym.address + i * sym.elem_size
                                    const checked = isSel || (partSet?.has(i) ?? false)
                                    return (
                                      <tr
                                        key={`${sym.name}[${i}]`}
                                        className={cn('cursor-pointer bg-muted/10', checked && 'bg-primary/5')}
                                        onClick={() => toggleElem(sym.name, i)}
                                      >
                                        <td className="w-5 px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                          <input
                                            type="checkbox"
                                            className="size-3 cursor-pointer"
                                            checked={checked}
                                            disabled={isSel}
                                            onChange={() => toggleElem(sym.name, i)}
                                          />
                                        </td>
                                        <td className="px-1 py-0.5 pl-4 font-mono text-[10px]">
                                          {sym.name}[{i}]
                                        </td>
                                        <td className="px-1 py-0.5 font-mono text-[10px] w-16">{sym.elem_type}</td>
                                        <td className="px-1 py-0.5 font-mono text-[10px] text-center w-10">{sym.elem_size}</td>
                                        <td className="px-1 py-0.5 font-mono text-[10px] w-16">
                                          0x{elemAddr.toString(16).toUpperCase().padStart(8, '0').slice(-4)}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
            {groupedSymbols.length === 0 && (
              <div className="px-2 py-4 text-center text-muted-foreground text-[11px]">
                {filter ? '无匹配符号' : '无符号'}
              </div>
            )}
          </div>

          {/* 手动地址输入 */}
          {showManual && (
            <div className="space-y-1 border-t border-border bg-muted/20 p-2">
              <input
                className="h-6 w-full rounded border border-border bg-background px-2 text-[11px]"
                placeholder="变量名"
                value={manualName}
                onChange={(e) => { setManualName(e.target.value); setManualErr(null) }}
              />
              <div className="flex gap-1">
                <input
                  className="h-6 flex-1 rounded border border-border bg-background px-2 text-[11px] font-mono"
                  placeholder="0x20000000"
                  value={manualAddr}
                  onChange={(e) => { setManualAddr(e.target.value); setManualErr(null) }}
                />
                <select
                  className="h-6 rounded border border-border bg-background px-1 text-[11px]"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as MonitorVarType)}
                >
                  {VAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {manualErr && (
                <div className="flex items-center gap-1 text-[10px] text-red-500">
                  <AlertTriangle className="size-3" /> {manualErr}
                </div>
              )}
              <button
                className="h-6 w-full rounded bg-primary text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={handleAddManual}
                disabled={!manualName.trim() || !manualAddr.trim()}
              >
                添加手动变量
              </button>
            </div>
          )}

          {/* 底部操作栏 */}
          <div className="flex items-center gap-1 border-t border-border p-1.5">
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowManual((s) => !s)}
            >
              <Plus className="size-3" /> 手动地址
            </button>
            <button
              className="ml-auto flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={handleAddToWatch}
              disabled={selCount === 0 || adding}
            >
              {adding ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              添加到监视{selCount > 0 && `(${selCount})`}
            </button>
          </div>
        </div>
      )}

      {/* ── 监视变量/通道列表 ── */}
      <div className={cn('min-h-0 overflow-auto', !elfLoaded && 'flex-1')}>
        {variables.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-center text-xs text-muted-foreground">
              {elfLoaded ? '从上方选择变量添加' : '加载 ELF 文件后选择变量'}
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {variables.map((v) => {
              const ch = channels.find((c) => c.varId === v.id)
              if (!ch) return null
              return (
                <div
                  key={v.id}
                  className={cn(
                    'rounded border border-border bg-background p-2',
                    !ch.visible && 'opacity-50',
                  )}
                >
                  {/* 颜色 + 名称 + 显隐 + 删除 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      value={ch.color}
                      onChange={(e) => setChannel(v.id, { color: e.target.value })}
                      title="通道颜色"
                    />
                    <span className="flex-1 truncate text-xs font-medium" title={v.name}>{v.name}</span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setChannel(v.id, { visible: !ch.visible })}
                      title={ch.visible ? '隐藏' : '显示'}
                    >
                      {ch.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveVar(v.id)}
                      title="删除变量"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  {/* 当前值 */}
                  {running && (
                    <div className="mt-1 text-xs font-mono tabular-nums text-muted-foreground">
                      {lastValues.has(v.id) ? (lastValues.get(v.id) ?? 'N/A') : '—'}
                    </div>
                  )}

                  {/* Y 偏移/缩放（显示配置） */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <label className="text-[10px] text-muted-foreground" title="Y 轴偏移：波形垂直方向的平移量（数值加减）">
                      偏移
                    </label>
                    <input
                      type="number"
                      className="h-5 w-12 rounded border border-border bg-background px-1 text-[10px]"
                      value={ch.yOffset}
                      onChange={(e) => setChannel(v.id, { yOffset: Number(e.target.value) })}
                      step="any"
                      title="Y 轴偏移：波形垂直平移（数值加减）"
                    />
                    <label className="text-[10px] text-muted-foreground" title="Y 轴缩放：波形垂直方向的放大倍数（1=原始）">
                      缩放
                    </label>
                    <input
                      type="number"
                      className="h-5 w-12 rounded border border-border bg-background px-1 text-[10px]"
                      value={ch.yScale}
                      onChange={(e) => setChannel(v.id, { yScale: Number(e.target.value) })}
                      step="any"
                      title="Y 轴缩放：垂直放大倍数（1=原始大小）"
                    />
                  </div>

                  {/* 触发配置 */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <label className="text-[10px] text-muted-foreground" title="触发方式：信号达到阈值时定格波形">触发</label>
                    <select
                      className="h-5 flex-1 rounded border border-border bg-background px-1 text-[10px]"
                      value={ch.triggerMode}
                      onChange={(e) => setChannel(v.id, { triggerMode: e.target.value as ChannelTriggerMode })}
                      title="触发方式"
                    >
                      {TRIGGER_MODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {ch.triggerMode !== 'none' && (
                      <>
                        <label className="text-[10px] text-muted-foreground">阈值</label>
                        <input
                          type="number"
                          className="h-5 w-14 rounded border border-border bg-background px-1 text-[10px]"
                          value={ch.triggerLevel}
                          onChange={(e) => setChannel(v.id, { triggerLevel: Number(e.target.value) })}
                          step="any"
                          title="触发阈值"
                        />
                      </>
                    )}
                  </div>

                  {/* 地址 + 类型 */}
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                    <span className="font-mono">0x{v.address.toString(16).toUpperCase().padStart(8, '0')}</span>
                    <span className="font-mono">{v.type}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
