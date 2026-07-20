import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/stores/notification.store'

export type ByteWidth = 1 | 2 | 4

interface HexViewerProps {
  base64Data: string
  baseAddress: number
  byteWidth: ByteWidth
  /** 可选：比较参考数据（base64），存在时高亮差异字节 */
  diffBase64?: string | null
  diffBaseAddress?: number
  /** 可选：滚动同步回调，当本组件滚动时通知另一个组件 */
  onScrollSync?: (scrollTop: number) => void
  /** 可选：外部控制的 scrollTop，用于同步滚动 */
  syncScrollTop?: number | null
}

// 虚拟滚动常量
const ROW_HEIGHT = 20 // 固定行高 px
const BUFFER_ROWS = 5 // 上下缓冲行数

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function formatHexAddr(addr: number): string {
  const hex = addr.toString(16).toUpperCase().padStart(8, '0')
  return `0x${hex.slice(0, 4)}_${hex.slice(4)}`
}

const HEX_CHARS = '0123456789ABCDEF'

function byteToHex(b: number): string {
  return HEX_CHARS[(b >> 4) & 0xF] + HEX_CHARS[b & 0xF]
}

function byteToAscii(b: number): string {
  return b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
}

function readLeU16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8)
}
function readLeU32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0
}

function wordToHex(val: number, width: ByteWidth): string {
  return val.toString(16).toUpperCase().padStart(width * 2, '0')
}

/** HexViewer 工具栏（字节宽度切换 + 地址跳转），紧凑布局 */
export function HexToolbar({
  byteWidth,
  onByteWidthChange,
  baseAddress,
  dataLength,
}: {
  byteWidth: ByteWidth
  onByteWidthChange: (w: ByteWidth) => void
  baseAddress: number
  dataLength: number
}) {
  const [jumpAddr, setJumpAddr] = useState('')

  const endAddress = baseAddress + dataLength - 1

  const handleJump = useCallback(() => {
    const trimmed = jumpAddr.trim().toLowerCase()
    if (!trimmed) return
    const addr = parseInt(trimmed, 16)
    if (isNaN(addr) || addr < 0) {
      useNotificationStore.getState().push({
        type: 'warning',
        title: '地址无效',
        message: '请输入有效的十六进制地址',
      })
      return
    }
    if (addr < baseAddress || addr > endAddress) {
      useNotificationStore.getState().push({
        type: 'warning',
        title: '地址超出范围',
        message: `有效范围 ${formatHexAddr(baseAddress)} ~ ${formatHexAddr(endAddress)}`,
      })
      return
    }

    const offset = addr - baseAddress
    window.dispatchEvent(new CustomEvent('hexviewer:jump', { detail: { offset } }))
  }, [jumpAddr, baseAddress, endAddress])

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* 字节宽度切换 */}
      <div className="flex items-center rounded border border-border">
        {([1, 2, 4] as ByteWidth[]).map((w) => (
          <button
            key={w}
            onClick={() => onByteWidthChange(w)}
            className={cn(
              'px-1.5 py-0.5 text-[11px] font-medium transition-colors',
              byteWidth === w
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {w}B
          </button>
        ))}
      </div>

      {/* 地址跳转 — 固定 0x 前缀 */}
      <div className="flex items-center gap-0.5 ml-auto">
        <div className="flex items-center h-6 rounded-md border border-border overflow-hidden">
          <span className="flex items-center px-1.5 h-full text-xs font-mono text-muted-foreground bg-muted/50 border-r border-border">0x</span>
          <input
            value={jumpAddr}
            onChange={(e) => {
              // 只允许十六进制字符
              const filtered = e.target.value.replace(/[^0-9a-fA-F]/g, '')
              setJumpAddr(filtered)
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            placeholder="08000000"
            spellCheck={false}
            autoComplete="off"
            className="h-6 w-20 bg-transparent px-1.5 font-mono text-xs outline-none"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={handleJump} className="h-6 w-6 p-0">
          <Search className="size-3" />
        </Button>
      </div>
    </div>
  )
}

interface HexCell {
  hex: string
  diff: boolean
}

interface HexGroup {
  /** 该组的字节宽度（1/2/4），用于确定显示哪些组 */
  width: ByteWidth
  cells: HexCell[]
}

interface VirtualRow {
  offset: number
  addr: string
  groups: HexGroup[]
  ascii: { ch: string; diff: boolean }[]
}

export function HexViewer({ base64Data, baseAddress, byteWidth, diffBase64, diffBaseAddress, onScrollSync, syncScrollTop }: HexViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [highlightOffset, setHighlightOffset] = useState<number | null>(null)
  const onScrollSyncRef = useRef(onScrollSync)
  onScrollSyncRef.current = onScrollSync

  // 每行固定 8 字节，byteWidth 控制显示哪些分组视图（1B/2B/4B）
  const bytesPerRow = 8

  const data = useMemo(() => decodeBase64(base64Data), [base64Data])
  const diffData = useMemo(() => diffBase64 ? decodeBase64(diffBase64) : null, [diffBase64])

  // 总行数（廉价计算，不需要遍历数据）
  const totalRows = Math.ceil(data.length / bytesPerRow)
  const totalHeight = totalRows * ROW_HEIGHT

  // 监听容器尺寸
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 计算可见行范围
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS)
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 2 * BUFFER_ROWS
  const visibleEnd = Math.min(totalRows, visibleStart + visibleCount)

  // 只为可见行生成渲染数据（按需计算，不再预计算全部）
  const visibleRows = useMemo<VirtualRow[]>(() => {
    if (data.length === 0) return []
    const result: VirtualRow[] = []

    // 辅助函数：检查指定字节范围内是否有 diff
    const checkDiff = (pos: number, width: number): boolean => {
      if (!diffData) return false
      for (let j = 0; j < width; j++) {
        const refOffset = (baseAddress + pos + j) - (diffBaseAddress ?? baseAddress)
        if (refOffset < 0 || refOffset >= diffData.length) return true
        if (data[pos + j] !== diffData[refOffset]) return true
      }
      return false
    }

    // 辅助函数：生成一个组的 cells（offset 作为参数传入，避免闭包作用域问题）
    const buildGroup = (width: ByteWidth, offset: number): HexGroup => {
      const cellCount = bytesPerRow / width // 1B:8, 2B:4, 4B:2
      const cells: HexCell[] = []
      for (let i = 0; i < cellCount; i++) {
        const pos = offset + i * width
        if (pos + width <= data.length) {
          let hex: string
          if (width === 1) {
            hex = byteToHex(data[pos])
          } else if (width === 2) {
            hex = wordToHex(readLeU16(data, pos), 2)
          } else {
            hex = wordToHex(readLeU32(data, pos), 4)
          }
          cells.push({ hex, diff: checkDiff(pos, width) })
        } else {
          cells.push({ hex: ' '.repeat(width * 2), diff: false })
        }
      }
      return { width, cells }
    }

    for (let rowIdx = visibleStart; rowIdx < visibleEnd; rowIdx++) {
      const offset = rowIdx * bytesPerRow

      // 构建 ASCII 列（8 个字符，每个字节一个）
      const ascii: { ch: string; diff: boolean }[] = []
      for (let i = 0; i < bytesPerRow; i++) {
        const pos = offset + i
        if (pos < data.length) {
          ascii.push({ ch: byteToAscii(data[pos]), diff: checkDiff(pos, 1) })
        } else {
          ascii.push({ ch: ' ', diff: false })
        }
      }

      // 根据 byteWidth 决定显示哪些分组视图
      // 1B: 显示 1B + 2B + 4B 三组（逗号分隔）
      // 2B: 显示 2B + 4B 两组（逗号分隔）
      // 4B: 只显示 4B 一组
      const groups: HexGroup[] = []
      if (byteWidth === 1) {
        groups.push(buildGroup(1, offset))
        groups.push(buildGroup(2, offset))
        groups.push(buildGroup(4, offset))
      } else if (byteWidth === 2) {
        groups.push(buildGroup(2, offset))
        groups.push(buildGroup(4, offset))
      } else {
        groups.push(buildGroup(4, offset))
      }

      result.push({
        offset,
        addr: formatHexAddr(baseAddress + offset),
        groups,
        ascii,
      })
    }
    return result
  }, [data, diffData, baseAddress, diffBaseAddress, byteWidth, bytesPerRow, visibleStart, visibleEnd])

  // 数据或字节宽度变化时重置滚动
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
    setScrollTop(0)
    setHighlightOffset(null)
  }, [base64Data, byteWidth])

  // 地址跳转：直接设置 scrollTop
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const offset = detail.offset as number
      const rowIndex = Math.floor(offset / bytesPerRow)
      const targetTop = rowIndex * ROW_HEIGHT
      const el = containerRef.current
      if (el) {
        // 居中显示
        const centerOffset = Math.max(0, targetTop - el.clientHeight / 2 + ROW_HEIGHT / 2)
        el.scrollTop = centerOffset
        setHighlightOffset(rowIndex * bytesPerRow)
        setTimeout(() => setHighlightOffset(null), 3000)
      }
    }
    window.addEventListener('hexviewer:jump', handler)
    return () => window.removeEventListener('hexviewer:jump', handler)
  }, [bytesPerRow])

  // 滚动同步
  const isSyncingRef = useRef(false)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop
    setScrollTop(st)
    if (isSyncingRef.current) return
    onScrollSyncRef.current?.(st)
  }, [])

  // 外部同步滚动
  useEffect(() => {
    if (syncScrollTop !== null && syncScrollTop !== undefined && containerRef.current) {
      isSyncingRef.current = true
      containerRef.current.scrollTop = syncScrollTop
      setScrollTop(syncScrollTop)
      requestAnimationFrame(() => { isSyncingRef.current = false })
    }
  }, [syncScrollTop])

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        无数据
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-auto font-mono text-xs"
    >
      {/* 撑开总高度，维持滚动条 */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* 只渲染可见行，用 absolute 定位偏移 */}
        <div style={{ position: 'absolute', top: visibleStart * ROW_HEIGHT, left: 0, right: 0 }}>
          {visibleRows.map((row) => (
            <div
              key={row.offset}
              style={{ height: ROW_HEIGHT }}
              className={cn(
                'flex gap-3 px-2 hover:bg-muted/30',
                highlightOffset === row.offset && 'bg-yellow-500/20 ring-1 ring-yellow-500/50'
              )}
            >
              <span className="shrink-0 text-muted-foreground leading-5">{row.addr}</span>
              {/* Hex groups（逗号分隔的多组视图：1B/2B/4B） */}
              <span className="shrink-0 flex items-center leading-5">
                {row.groups.map((group, gi) => (
                  <span key={gi} className="flex items-center">
                    {gi > 0 && <span className="text-muted-foreground px-0.5">,</span>}
                    {group.cells.map((cell, ci) => (
                      <span key={ci} className="flex">
                        {ci > 0 && <span>{' '}</span>}
                        <span className={cn(cell.diff && 'bg-red-500/30 text-red-600 dark:text-red-400 rounded px-0.5')}>
                          {cell.hex}
                        </span>
                      </span>
                    ))}
                  </span>
                ))}
              </span>
              {/* ASCII */}
              <span className="text-muted-foreground flex leading-5">
                {row.ascii.map((a, i) => (
                  <span key={i} className={cn(a.diff && 'bg-red-500/30 text-red-600 dark:text-red-400 rounded px-0.5')}>
                    {a.ch}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
