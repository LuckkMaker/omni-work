import { Fragment, useState, useEffect, useCallback } from 'react'
import {
  Plus, Eye, EyeOff, FileUp, Search, Loader2,
  Radio, Zap, AlertTriangle, Check,
} from 'lucide-react'
import { useMonitorStore } from '@/stores/monitor.store'
import { useNotificationStore } from '@/stores/notification.store'
import {
  monitorService, type MonitorSymbol, type MonitorVarType,
} from '@/services/monitor.service'
import { cn } from '@/lib/utils'

interface Props {
  uid: string | null
}

/** 手动地址输入支持的数据类型 */
const VAR_TYPES: MonitorVarType[] = [
  'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'float',
]

/** 数组元素选择：'all' 表示添加整个数组，数字表示单个索引 */
type ElemSel = 'all' | number

export function ChannelPanel({ uid }: Props) {
  const variables = useMonitorStore((s) => s.variables)
  const channels = useMonitorStore((s) => s.channels)
  const samples = useMonitorStore((s) => s.samples)
  const running = useMonitorStore((s) => s.running)
  const transport = useMonitorStore((s) => s.transport)
  const elfPath = useMonitorStore((s) => s.elfPath)
  const elfLoaded = useMonitorStore((s) => s.elfLoaded)
  const symbolCount = useMonitorStore((s) => s.symbolCount)
  const setTransport = useMonitorStore((s) => s.setTransport)
  const setElf = useMonitorStore((s) => s.setElf)
  const addVariable = useMonitorStore((s) => s.addVariable)
  const setChannel = useMonitorStore((s) => s.setChannel)
  const pushNotification = useNotificationStore((s) => s.push)

  // ELF 加载与符号浏览状态
  const [loading, setLoading] = useState(false)
  const [symbols, setSymbols] = useState<MonitorSymbol[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // 数组元素选择：symName -> 'all' | index
  const [elemSel, setElemSel] = useState<Record<string, ElemSel>>({})
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
    for (const v of lastSample.values) {
      lastValues.set(v.id, v.value)
    }
  }

  // ELF 已加载时拉取符号列表
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
    if (elfLoaded) fetchSymbols()
  }, [elfLoaded, fetchSymbols])

  // ── 加载 ELF 文件（点击直接弹系统文件选择框）──
  const handleLoadElf = useCallback(async () => {
    if (!uid) return
    // 打开系统文件选择框（preload 已暴露，过滤器含 elf/axf）
    const filePath = await window.electron?.openFileDialog?.()
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
        // 立即拉取符号
        const symRes = await monitorService.getSymbols(uid, {
          type: 'object', page: 1, page_size: 500,
        })
        setSymbols(symRes.symbols)
        setSelected(new Set())
        setElemSel({})
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

  // ── 勾选符号 ──
  const toggleSelect = (name: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(name)) {
        next.delete(name)
        // 清理元素选择
        setElemSel((m) => { const c = { ...m }; delete c[name]; return c })
      } else {
        next.add(name)
      }
      return next
    })
  }

  // ── 添加到监视（处理数组元素选择）──
  const handleAddToWatch = useCallback(async () => {
    if (!uid) return
    setAdding(true)
    let added = 0
    let failed = 0
    const sortedSyms = symbols.filter((s) => selected.has(s.name))
    for (const sym of sortedSyms) {
      try {
        if (sym.is_array) {
          const sel = elemSel[sym.name] ?? 'all'
          if (sel === 'all') {
            // 添加整个数组的每个元素
            for (let i = 0; i < sym.elem_count; i++) {
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
            // 添加单个元素
            const res = await monitorService.addVariable(uid, {
              name: sym.name, address: sym.address, type: sym.elem_type,
              elem_index: sel,
            })
            if (res.success) { addVariable(res.variable); added++ }
            else failed++
          }
        } else {
          // 非数组
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
        type: 'success',
        title: `已添加 ${added} 个变量`,
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

  // ── 手动地址：格式校验 ──
  const validateManual = (): { ok: boolean; addr?: number; msg?: string } => {
    if (!manualName.trim()) return { ok: false, msg: '请输入变量名' }
    // 名称去重（与现有变量 + 符号）
    const dupVar = variables.some((v) => v.name === manualName.trim())
    if (dupVar) return { ok: false, msg: '变量名已存在' }
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
        setManualErr(res.variable ? '' : '地址不可读（探针已连接时后端会探测）')
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
        ?? (e instanceof Error ? e.message : String(e))
      setManualErr(msg)
    }
  }, [uid, manualName, manualAddr, manualType, variables, addVariable, pushNotification])

  return (
    <div className="flex h-full flex-col">
      {/* ① 采样模式切换：RTT 同步 / HSS 异步 */}
      <div className="border-b border-border p-2 space-y-2">
        <div className="flex items-center rounded-md border border-border p-0.5">
          <button
            onClick={() => !running && setTransport('rtt')}
            disabled={running}
            className={cn(
              'flex h-6 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors',
              transport === 'rtt'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
              running && 'opacity-50 cursor-not-allowed',
            )}
            title="RTT 同步：固件集成 SEGGER_RTT 代码主动推送，速度快、与代码同步，但侵入固件"
          >
            <Radio className="size-3" />
            RTT 同步
          </button>
          <button
            onClick={() => !running && setTransport('swd')}
            disabled={running}
            className={cn(
              'flex h-6 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors',
              transport === 'swd'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
              running && 'opacity-50 cursor-not-allowed',
            )}
            title="HSS 异步：调试器通过 SWD 直接读内存，非侵入，速度受调试接口限制"
          >
            <Zap className="size-3" />
            HSS 异步
          </button>
        </div>

        {/* ② 加载 ELF 文件 */}
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
            <span className="truncate" title={elfPath}>
              {elfPath.split(/[\\/]/).pop()}
            </span>
            <span className="shrink-0">· {symbolCount} 符号</span>
          </div>
        )}
        {transport === 'rtt' && (
          <div className="flex items-start gap-1 rounded border border-amber-500/30 bg-amber-500/10 p-1.5 text-[10px] text-amber-600">
            <AlertTriangle className="size-3 shrink-0 mt-0.5" />
            <span>RTT 模式需固件集成 SEGGER_RTT 并按协议写采样数据，变量 id 按添加顺序对应。</span>
          </div>
        )}
      </div>

      {/* ③ 内联变量浏览（ELF 已加载时） */}
      {elfLoaded && (
        <div className="flex min-h-0 flex-1 flex-col border-b border-border">
          {/* 搜索过滤 */}
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

          {/* 符号列表 */}
          <div className="min-h-0 flex-1 overflow-auto px-1">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/50">
                <tr>
                  <th className="w-6 px-1 py-1" />
                  <th className="px-1 py-1 text-left font-medium">Name</th>
                  <th className="px-1 py-1 text-left font-medium w-16">Addr</th>
                  <th className="px-1 py-1 text-left font-medium w-14">Type</th>
                </tr>
              </thead>
              <tbody>
                {symbols.map((sym) => {
                  const isSel = selected.has(sym.name)
                  return (
                    <Fragment key={sym.name}>
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-border/30',
                          isSel && 'bg-primary/5',
                        )}
                        onClick={() => toggleSelect(sym.name)}
                      >
                        <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="size-3 cursor-pointer"
                            checked={isSel}
                            onChange={() => toggleSelect(sym.name)}
                          />
                        </td>
                        <td className="px-1 py-1 truncate" title={sym.name}>
                          {sym.name}
                          {sym.is_array && (
                            <span className="text-muted-foreground">[{sym.elem_count}]</span>
                          )}
                        </td>
                        <td className="px-1 py-1 font-mono text-[10px]">
                          0x{sym.address.toString(16).toUpperCase().padStart(8, '0').slice(-4)}
                        </td>
                        <td className="px-1 py-1 font-mono text-[10px]">
                          {sym.is_array ? `${sym.elem_type}[${sym.elem_count}]` : sym.type}
                        </td>
                      </tr>
                      {/* 数组元素选择器 */}
                      {isSel && sym.is_array && sym.elem_count > 1 && (
                        <tr className="bg-primary/5">
                          <td colSpan={4} className="px-2 py-1">
                            <div className="flex flex-wrap items-center gap-0.5">
                              <span className="text-[10px] text-muted-foreground mr-1">元素:</span>
                              <button
                                className={cn(
                                  'h-4 px-1 rounded text-[10px] border',
                                  (elemSel[sym.name] ?? 'all') === 'all'
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border text-muted-foreground hover:bg-muted/30',
                                )}
                                onClick={() => setElemSel((m) => ({ ...m, [sym.name]: 'all' }))}
                              >
                                全部
                              </button>
                              {Array.from({ length: Math.min(sym.elem_count, 64) }, (_, i) => (
                                <button
                                  key={i}
                                  className={cn(
                                    'h-4 w-4 rounded text-[10px] border',
                                    elemSel[sym.name] === i
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-border text-muted-foreground hover:bg-muted/30',
                                  )}
                                  onClick={() => setElemSel((m) => ({ ...m, [sym.name]: i }))}
                                >
                                  {i}
                                </button>
                              ))}
                              {sym.elem_count > 64 && (
                                <span className="text-[10px] text-muted-foreground">...</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {symbols.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground text-[11px]">
                      {filter ? '无匹配符号' : '无符号'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 手动地址输入（折叠） */}
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
                  <AlertTriangle className="size-3" />
                  {manualErr}
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
              <Plus className="size-3" />
              手动地址
            </button>
            <button
              className="ml-auto flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              onClick={handleAddToWatch}
              disabled={selected.size === 0 || adding}
            >
              {adding ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              添加到监视{selected.size > 0 && `(${selected.size})`}
            </button>
          </div>
        </div>
      )}

      {/* ④ 通道列表（已添加的变量） */}
      <div className={cn('min-h-0 flex-1 overflow-auto', !elfLoaded && 'flex-1')}>
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
                  {/* 颜色 + 名称 + 显隐 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      value={ch.color}
                      onChange={(e) => setChannel(v.id, { color: e.target.value })}
                      title="通道颜色"
                    />
                    <span className="flex-1 truncate text-xs font-medium" title={v.name}>
                      {v.name}
                    </span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setChannel(v.id, { visible: !ch.visible })}
                      title={ch.visible ? '隐藏' : '显示'}
                    >
                      {ch.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                  </div>

                  {/* 当前值 */}
                  {running && (
                    <div className="mt-1 text-xs font-mono tabular-nums text-muted-foreground">
                      {lastValues.has(v.id)
                        ? (lastValues.get(v.id) ?? 'N/A')
                        : '—'}
                    </div>
                  )}

                  {/* Y 轴偏移/缩放 */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <label className="text-[10px] text-muted-foreground">偏移</label>
                    <input
                      type="number"
                      className="h-5 w-12 rounded border border-border bg-background px-1 text-[10px]"
                      value={ch.yOffset}
                      onChange={(e) => setChannel(v.id, { yOffset: Number(e.target.value) })}
                      step="any"
                    />
                    <label className="text-[10px] text-muted-foreground">缩放</label>
                    <input
                      type="number"
                      className="h-5 w-12 rounded border border-border bg-background px-1 text-[10px]"
                      value={ch.yScale}
                      onChange={(e) => setChannel(v.id, { yScale: Number(e.target.value) })}
                      step="any"
                    />
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
