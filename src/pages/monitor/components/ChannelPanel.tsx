import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Eye, EyeOff, FileUp, Search, Loader2,
  Radio, Zap, AlertTriangle, Trash2, Play, Square, Gauge,
  ChevronRight, ChevronDown, SlidersHorizontal,
} from 'lucide-react'
import { useMonitorStore } from '@/stores/monitor.store'
import { useNotificationStore } from '@/stores/notification.store'
import {
  monitorService, type MonitorSymbol, type MonitorVarType,
} from '@/services/monitor.service'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

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

/** 时基档位（秒，作为 Follow/触发模式的时间窗口宽度），覆盖 us~s 全范围 */
const TIMEBASE_OPTIONS = [
  { label: '1 us/div', value: 0.000001 },
  { label: '2 us/div', value: 0.000002 },
  { label: '5 us/div', value: 0.000005 },
  { label: '10 us/div', value: 0.00001 },
  { label: '20 us/div', value: 0.00002 },
  { label: '50 us/div', value: 0.00005 },
  { label: '100 us/div', value: 0.0001 },
  { label: '200 us/div', value: 0.0002 },
  { label: '500 us/div', value: 0.0005 },
  { label: '1 ms/div', value: 0.001 },
  { label: '2 ms/div', value: 0.002 },
  { label: '5 ms/div', value: 0.005 },
  { label: '10 ms/div', value: 0.01 },
  { label: '20 ms/div', value: 0.02 },
  { label: '50 ms/div', value: 0.05 },
  { label: '100 ms/div', value: 0.1 },
  { label: '200 ms/div', value: 0.2 },
  { label: '500 ms/div', value: 0.5 },
  { label: '1 s/div', value: 1 },
  { label: '2 s/div', value: 2 },
  { label: '5 s/div', value: 5 },
  { label: '10 s/div', value: 10 },
  { label: '20 s/div', value: 20 },
  { label: '50 s/div', value: 50 },
  { label: '100 s/div', value: 100 },
  { label: '200 s/div', value: 200 },
  { label: '500 s/div', value: 500 },
]

/** 渲染帧率档位（FPS） */
const FPS_OPTIONS = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50]

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
  const elfChanged = useMonitorStore((s) => s.elfChanged)
  const setElfChanged = useMonitorStore((s) => s.setElfChanged)
  const symbolCount = useMonitorStore((s) => s.symbolCount)
  const rateHz = useMonitorStore((s) => s.rateHz)
  const follow = useMonitorStore((s) => s.follow)
  const timebase = useMonitorStore((s) => s.timebase)
  const fps = useMonitorStore((s) => s.fps)
  const setTransport = useMonitorStore((s) => s.setTransport)
  const setRateHz = useMonitorStore((s) => s.setRateHz)
  const setFollow = useMonitorStore((s) => s.setFollow)
  const setTimebase = useMonitorStore((s) => s.setTimebase)
  const setFps = useMonitorStore((s) => s.setFps)
  const setElf = useMonitorStore((s) => s.setElf)
  const addVariable = useMonitorStore((s) => s.addVariable)
  const removeVariable = useMonitorStore((s) => s.removeVariable)
  const setChannel = useMonitorStore((s) => s.setChannel)
  const registerArrayGroup = useMonitorStore((s) => s.registerArrayGroup)
  const removeArrayGroup = useMonitorStore((s) => s.removeArrayGroup)
  const pushNotification = useNotificationStore((s) => s.push)

  // ELF 加载与符号浏览状态
  const [loading, setLoading] = useState(false)
  const [symbols, setSymbols] = useState<MonitorSymbol[]>([])
  const [filter, setFilter] = useState('')
  // 已添加到监视的符号名集合（与 store variables 同步：WatchPanel 删除变量时自动移除）
  const [added, setAdded] = useState<Set<string>>(new Set())
  // 用户勾选的待添加符号名集合（复选框勾选 = 待添加，点击[添加到监视]后批量加入 watch）
  const [checked, setChecked] = useState<Set<string>>(new Set())
  // 数组已添加的元素索引（symName -> Set<elemIndex>）
  const [addedElems, setAddedElems] = useState<Record<string, Set<number>>>({})
  // 展开的数组符号（二级元素列表）
  const [expandedArrays, setExpandedArrays] = useState<Set<string>>(new Set())
  // 折叠的源文件分组
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // 手动地址输入
  const [showManualDialog, setShowManualDialog] = useState(false)
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
    for (const arr of Array.from(groups.values())) arr.sort((a, b) => a.name.localeCompare(b.name))
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

  // ── added 集合与 store variables 同步 ──
  // WatchPanel 删除变量时 store variables 变化，此处自动移除不再存在的符号名
  useEffect(() => {
    const storeNames = new Set<string>()
    for (const v of variables) {
      // 数组元素名为 baseName[idx]，取 baseName
      const baseName = v.name.replace(/\[\d+\]$/, '')
      storeNames.add(baseName)
    }
    setAdded((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const name of prev) {
        if (storeNames.has(name)) next.add(name)
        else changed = true
      }
      return changed ? next : prev
    })
    // 同步清理 checked 中已添加的（已添加的不应再处于待添加状态）
    setChecked((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const name of prev) {
        if (storeNames.has(name)) { changed = true; continue }
        next.add(name)
      }
      return changed ? next : prev
    })
  }, [variables])

  // ── 批量添加：将所有勾选（checked）的变量一次性加入 watch 监视 ──
  const handleBatchAdd = useCallback(async () => {
    if (!uid || checked.size === 0) return
    setLoading(true)
    let okCount = 0
    const failures: { name: string; error: string }[] = []
    for (const sym of symbols) {
      if (!checked.has(sym.name)) continue
      if (sym.is_array) {
        // 数组：只添加首元素（elem_index=0），Watch 面板可展开
        try {
          const res = await monitorService.addVariable(uid, {
            name: sym.name, address: sym.address, type: sym.elem_type, elem_index: 0,
          })
          if (res.success) {
            addVariable(res.variable)
            registerArrayGroup({
              baseName: sym.name, elemCount: sym.elem_count, elemType: sym.elem_type,
              baseAddress: sym.address, elemSize: sym.elem_size, firstElemId: res.variable.id,
            })
            okCount++
            setAdded((s) => { const n = new Set(s); n.add(sym.name); return n })
          }
        } catch (e) {
          failures.push({ name: sym.name, error: (e as any)?.response?.data?.detail || (e as Error)?.message || '未知错误' })
        }
        setAddedElems((m) => { const c = { ...m }; c[sym.name] = new Set([0]); return c })
      } else {
        try {
          const res = await monitorService.addVariable(uid, {
            name: sym.name, address: sym.address, type: sym.type,
          })
          if (res.success) {
            addVariable(res.variable)
            okCount++
            setAdded((s) => { const n = new Set(s); n.add(sym.name); return n })
          }
        } catch (e) {
          failures.push({ name: sym.name, error: (e as any)?.response?.data?.detail || (e as Error)?.message || '未知错误' })
        }
      }
    }
    setChecked(new Set())
    setLoading(false)
    if (okCount > 0) {
      pushNotification({
        type: 'success', title: '已添加到监视',
        message: `${okCount} 个变量`,
        autoClose: true, autoCloseDelay: 2000,
      })
    }
    if (failures.length > 0) {
      pushNotification({
        type: 'error', title: `${failures.length} 个变量添加失败`,
        message: failures.map((f) => `${f.name}: ${f.error}`).join('\n'),
        autoClose: false,
      })
    }
  }, [uid, checked, symbols, addVariable, registerArrayGroup, pushNotification])

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
        setAdded(new Set())
        setChecked(new Set())
        setAddedElems({})
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

  // ── 重新加载已加载的 ELF（用已存路径，不弹文件框）──
  const reloadElf = useCallback(async () => {
    if (!uid || !elfPath) return
    setLoading(true)
    try {
      const res = await monitorService.loadElf(uid, elfPath)
      setElf(elfPath, res.symbol_count)
      setElfChanged(false)
      fetchSymbols()
      pushNotification({
        type: 'success', title: 'ELF 已重新加载',
        message: `${res.symbol_count} 个符号`,
        autoClose: true, autoCloseDelay: 2000,
      })
    } catch (e) {
      pushNotification({
        type: 'error', title: 'ELF 重载失败',
        message: e instanceof Error ? e.message : String(e),
        autoClose: true, autoCloseDelay: 5000,
      })
    } finally {
      setLoading(false)
    }
  }, [uid, elfPath, setElf, setElfChanged, fetchSymbols, pushNotification])

  // ── ELF 文件变化轮询：采样未运行时每 5 秒检测 mtime，变化则提示重载 ──
  useEffect(() => {
    if (!uid || !elfLoaded || !elfPath || running) return
    let active = true
    const check = async () => {
      try {
        const r = await monitorService.checkElfChanged(uid)
        if (active && r.changed) setElfChanged(true)
      } catch { /* ignore */ }
    }
    check()
    const id = setInterval(check, 5000)
    return () => { active = false; clearInterval(id) }
  }, [uid, elfLoaded, elfPath, running, setElfChanged])

  // ── 分组折叠 ──
  const toggleGroup = (file: string) => {
    setCollapsedGroups((s) => {
      const next = new Set(s)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  // ── 复选框勾选：切换 checked 状态（待添加），不立即加入 watch ──
  // 已添加到 watch 的变量：点击复选框 = 移除（乐观更新，404 静默）
  const toggleSelect = async (sym: MonitorSymbol) => {
    if (!uid) return
    const isAdded = added.has(sym.name)
    if (isAdded) {
      // 已添加 → 点击 = 移除
      const toRemove = variables.filter((v) => v.name === sym.name || v.name.startsWith(`${sym.name}[`))
      for (const v of toRemove) {
        removeVariable(v.id)
        try {
          await monitorService.removeVariable(uid, v.id)
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status
          if (status === 404) continue
        }
      }
      setAdded((s) => { const n = new Set(s); n.delete(sym.name); return n })
      setAddedElems((m) => { const c = { ...m }; delete c[sym.name]; return c })
      removeArrayGroup(sym.name)
    } else {
      // 未添加 → 点击 = 切换 checked（待添加）状态
      setChecked((s) => {
        const n = new Set(s)
        if (n.has(sym.name)) n.delete(sym.name)
        else n.add(sym.name)
        return n
      })
    }
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

  // ── 数组元素勾选 → 即时添加/移除监视（不连续多选）──
  // 注意：数组整体（toggleSelect）走批量添加流程；单个元素仍保持即时添加/移除
  const toggleElem = async (sym: MonitorSymbol, idx: number) => {
    if (!uid) return
    const elemSet = addedElems[sym.name]
    const isAdded = elemSet?.has(idx) ?? false
    if (isAdded) {
      // 移除单个元素（乐观更新，404 静默）
      const varToRemove = variables.find((v) => v.name === `${sym.name}[${idx}]`)
      if (varToRemove) {
        removeVariable(varToRemove.id)
        try {
          await monitorService.removeVariable(uid, varToRemove.id)
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status
          if (status !== 404) { /* 其他错误忽略，保持静默 */ }
        }
      }
      setAddedElems((m) => {
        const c = { ...m }
        const s = new Set(c[sym.name] ?? [])
        s.delete(idx)
        if (s.size === 0) delete c[sym.name]
        else c[sym.name] = s
        return c
      })
    } else {
      // 添加单个元素
      try {
        const res = await monitorService.addVariable(uid, {
          name: sym.name, address: sym.address, type: sym.elem_type, elem_index: idx,
        })
        if (res.success) addVariable(res.variable)
      } catch { /* ignore */ }
      setAddedElems((m) => {
        const c = { ...m }
        const s = new Set(c[sym.name] ?? [])
        s.add(idx)
        c[sym.name] = s
        return c
      })
    }
  }

  // ── 删除监视变量 ──
  const handleRemoveVar = useCallback(async (id: string) => {
    if (!uid) return
    // 乐观更新：先从 store 移除，避免连续点击/并发移除撞 404
    removeVariable(id)
    try {
      await monitorService.removeVariable(uid, id)
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      const msg = e instanceof Error ? e.message : String(e)
      if (status !== 404 && !/404|not found/i.test(msg)) {
        pushNotification({
          type: 'error', title: '移除失败',
          message: msg,
          autoClose: true, autoCloseDelay: 3000,
        })
      }
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
        setManualName(''); setManualAddr(''); setShowManualDialog(false)
      } else {
        setManualErr('地址不可读（探针已连接时后端会探测）')
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
        ?? (e instanceof Error ? e.message : String(e))
      setManualErr(msg)
    }
  }, [uid, manualName, manualAddr, manualType, variables, addVariable, pushNotification])

  return (
    <div className="flex h-full flex-col">
      {/* ── 工具栏 ── */}
      <div className="border-b border-border p-2 space-y-2">
        {/* 启动 + Follow（最上方，平均分布）*/}
        <div className="flex gap-1.5">
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
        </div>

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
        {elfChanged && (
          <div className="flex items-center gap-2 rounded border border-yellow-500/50 bg-yellow-500/10 px-2 py-1.5 text-[11px] text-yellow-700 dark:text-yellow-400">
            <span className="flex-1">ELF 文件已变化，建议重新加载</span>
            <button
              className="shrink-0 font-medium underline hover:no-underline"
              onClick={reloadElf}
              disabled={loading}
            >重新加载</button>
          </div>
        )}

        {/* 采样率 + FPS */}
        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="h-7 rounded border border-border bg-background px-1 text-[11px]"
            value={rateHz}
            onChange={(e) => setRateHz(Number(e.target.value))}
            disabled={running}
            title="采样率（后端每秒采样次数）"
          >
            {RATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            className="h-7 rounded border border-border bg-background px-1 text-[11px]"
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            title="渲染帧率（波形图每秒刷新次数）"
          >
            {FPS_OPTIONS.map((f) => <option key={f} value={f}>{f} FPS</option>)}
          </select>
        </div>

        {/* 时基（div 时间分辨率）*/}
        <select
          className="h-7 w-full rounded border border-border bg-background px-1 text-[11px]"
          value={timebase}
          onChange={(e) => setTimebase(Number(e.target.value))}
          title="时基（每格代表的时间，决定时间窗口宽度）"
        >
          {TIMEBASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

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
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="text-[10px] text-muted-foreground border-b border-border">
                          <th className="w-5 px-1 py-0.5 font-medium text-left"></th>
                          <th className="px-1 py-0.5 font-medium text-left">Name</th>
                          <th className="px-1 py-0.5 font-medium text-left w-20">Address</th>
                          <th className="px-1 py-0.5 font-medium text-left w-16">Type</th>
                          <th className="px-1 py-0.5 font-medium text-center w-10">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syms.map((sym) => {
                          const isSel = added.has(sym.name)
                          const isExp = expandedArrays.has(sym.name)
                          const partSet = addedElems[sym.name]
                          const isChecked = checked.has(sym.name)  // 待添加勾选状态
                          return (
                            <Fragment key={sym.name}>
                              <tr
                                className={cn('border-b border-border/30', isSel && 'bg-primary/5', !isSel && isChecked && 'bg-primary/3')}
                              >
                                <td className="w-5 px-1 py-0.5">
                                  <input
                                    type="checkbox"
                                    className="size-3 cursor-pointer"
                                    checked={isSel || isChecked}
                                    onChange={() => toggleSelect(sym)}
                                    title={isSel ? '已添加到监视（点击移除）' : isChecked ? '已勾选（点击取消）' : '点击勾选待添加'}
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
                                <td className="px-1 py-0.5 font-mono text-[10px] w-20">
                                  0x{sym.address.toString(16).toUpperCase().padStart(8, '0')}
                                </td>
                                <td className="px-1 py-0.5 font-mono text-[10px] w-16">
                                  {sym.is_array ? `${sym.elem_type}[${sym.elem_count}]` : sym.type}
                                </td>
                                <td className="px-1 py-0.5 font-mono text-[10px] text-center w-10">{sym.size}</td>
                              </tr>
                              {/* 数组元素二级列表（展开） */}
                              {sym.is_array && isExp && (
                                <>
                                  {partSet && partSet.size > 0 && !isSel && (
                                    <tr className="bg-primary/5">
                                      <td colSpan={5} className="px-2 py-0.5 text-[10px] text-primary">
                                        已监视 {partSet.size}/{sym.elem_count} 个元素
                                      </td>
                                    </tr>
                                  )}
                                  {Array.from({ length: sym.elem_count }, (_, i) => {
                                    const elemAddr = sym.address + i * sym.elem_size
                                    const checked = isSel || (partSet?.has(i) ?? false)
                                    return (
                                      <tr
                                        key={`${sym.name}[${i}]`}
                                        className={cn('bg-muted/10', checked && 'bg-primary/5')}
                                      >
                                        <td className="w-5 px-1 py-0.5">
                                          <input
                                            type="checkbox"
                                            className="size-3 cursor-pointer"
                                            checked={checked}
                                            onChange={() => toggleElem(sym, i)}
                                            disabled={isSel}
                                            title={checked ? '已添加到监视（点击移除）' : '点击勾选待添加'}
                                          />
                                        </td>
                                        <td className="px-1 py-0.5 pl-4 font-mono text-[10px]">
                                          {sym.name}[{i}]
                                        </td>
                                        <td className="px-1 py-0.5 font-mono text-[10px] w-20">
                                          0x{elemAddr.toString(16).toUpperCase().padStart(8, '0')}
                                        </td>
                                        <td className="px-1 py-0.5 font-mono text-[10px] w-16">{sym.elem_type}</td>
                                        <td className="px-1 py-0.5 font-mono text-[10px] text-center w-10">{sym.elem_size}</td>
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

          {/* 底部操作栏：两个按钮平均分布 */}
          <div className="flex gap-1.5 border-t border-border p-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5"
              onClick={() => setShowManualDialog(true)}
              disabled={!uid}
              title="手动输入地址和类型添加变量"
            >
              <SlidersHorizontal className="size-4" />
              自定义变量
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-8 flex-1 gap-1.5"
              onClick={handleBatchAdd}
              disabled={checked.size === 0 || loading || !uid}
              title={checked.size === 0 ? '请先勾选变量' : `将 ${checked.size} 个勾选变量添加到 Watch`}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              添加到 Watch{checked.size > 0 && ` (${checked.size})`}
            </Button>
          </div>
        </div>
      )}

      {/* 自定义变量弹窗 */}
      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>自定义变量</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">变量名</label>
              <input
                className="h-8 w-full rounded border border-border bg-background px-2 text-sm"
                placeholder="例如 myVar"
                value={manualName}
                onChange={(e) => { setManualName(e.target.value); setManualErr(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddManual() }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">地址</label>
              <div className="flex gap-1.5">
                <input
                  className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm font-mono"
                  placeholder="0x20000000"
                  value={manualAddr}
                  onChange={(e) => { setManualAddr(e.target.value); setManualErr(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddManual() }}
                />
                <select
                  className="h-8 rounded border border-border bg-background px-2 text-sm"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as MonitorVarType)}
                >
                  {VAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            {manualErr && (
              <div className="flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle className="size-3.5" /> {manualErr}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>取消</Button>
            <Button onClick={handleAddManual} disabled={!manualName.trim() || !manualAddr.trim()}>
              <Plus className="size-4" />
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 监视变量/通道配置已移至下方 Watch 面板：每行可展开配置偏移/缩放/触发 */}
    </div>
  )
}
