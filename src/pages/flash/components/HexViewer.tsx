import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Loader2, Search } from 'lucide-react'
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

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function formatHexAddr(addr: number): string {
  return `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`
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

export function HexViewer({ base64Data, baseAddress, byteWidth, diffBase64, diffBaseAddress, onScrollSync, syncScrollTop }: HexViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [highlightOffset, setHighlightOffset] = useState<number | null>(null)
  const isSyncingRef = useRef(false)

  const bytesPerRow = 16 / byteWidth

  const data = useMemo(() => decodeBase64(base64Data), [base64Data])
  const diffData = useMemo(() => diffBase64 ? decodeBase64(diffBase64) : null, [diffBase64])

  // 计算每个字节是否与参考数据不同
  const isByteDiff = useCallback((offset: number): boolean => {
    if (!diffData) return false
    // 计算参考数据中对应的偏移
    const refOffset = (baseAddress + offset) - (diffBaseAddress ?? baseAddress)
    if (refOffset < 0 || refOffset >= diffData.length) return offset < data.length
    if (offset >= data.length) return true
    return data[offset] !== diffData[refOffset]
  }, [diffData, baseAddress, diffBaseAddress, data])

  const rows = useMemo(() => {
    const result: { offset: number; addr: string; bytes: { hex: string; ascii: string; diff: boolean }[] }[] = []
    for (let offset = 0; offset < data.length; offset += bytesPerRow) {
      const byteCells: { hex: string; ascii: string; diff: boolean }[] = []
      for (let i = 0; i < bytesPerRow; i++) {
        const pos = offset + i * byteWidth
        if (pos + byteWidth <= data.length) {
          let hex: string
          let ascii: string
          if (byteWidth === 1) {
            hex = byteToHex(data[pos])
            ascii = byteToAscii(data[pos])
          } else if (byteWidth === 2) {
            hex = wordToHex(readLeU16(data, pos), 2)
            ascii = byteToAscii(data[pos]) + byteToAscii(data[pos + 1])
          } else {
            hex = wordToHex(readLeU32(data, pos), 4)
            ascii = byteToAscii(data[pos]) + byteToAscii(data[pos + 1]) + byteToAscii(data[pos + 2]) + byteToAscii(data[pos + 3])
          }
          // 检查这个 word 内是否有任何字节不同
          let diff = false
          for (let j = 0; j < byteWidth; j++) {
            if (isByteDiff(pos + j)) { diff = true; break }
          }
          byteCells.push({ hex, ascii, diff })
        } else {
          const hexLen = byteWidth === 1 ? 2 : byteWidth === 2 ? 4 : 8
          byteCells.push({ hex: ' '.repeat(hexLen), ascii: ' '.repeat(byteWidth), diff: false })
        }
      }
      result.push({
        offset,
        addr: formatHexAddr(baseAddress + offset),
        bytes: byteCells,
      })
    }
    return result
  }, [data, baseAddress, byteWidth, bytesPerRow, isByteDiff])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
    setHighlightOffset(null)
  }, [base64Data, byteWidth])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const offset = detail.offset as number
      const rowIndex = Math.floor(offset / bytesPerRow) * bytesPerRow
      const el = rowRefs.current.get(rowIndex)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setHighlightOffset(rowIndex)
        setTimeout(() => setHighlightOffset(null), 3000)
      }
    }
    window.addEventListener('hexviewer:jump', handler)
    return () => window.removeEventListener('hexviewer:jump', handler)
  }, [bytesPerRow])

  // 滚动同步：当外部 syncScrollTop 变化时，更新本组件的 scrollTop
  useEffect(() => {
    if (syncScrollTop == null || containerRef.current == null) return
    isSyncingRef.current = true
    containerRef.current.scrollTop = syncScrollTop
    requestAnimationFrame(() => { isSyncingRef.current = false })
  }, [syncScrollTop])

  return (
    <div
      ref={containerRef}
      onScroll={(e) => {
        if (isSyncingRef.current) return
        onScrollSync?.(e.currentTarget.scrollTop)
      }}
      className="h-full overflow-auto font-mono text-xs leading-relaxed"
    >
      {rows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-3 animate-spin" />
          加载中...
        </div>
      ) : (
        rows.map((row) => (
          <div
            key={row.offset}
            ref={(el) => {
              if (el) rowRefs.current.set(row.offset, el)
            }}
            className={cn(
              'flex gap-3 px-2 py-0.5 hover:bg-muted/30',
              highlightOffset === row.offset && 'bg-yellow-500/20 ring-1 ring-yellow-500/50'
            )}
          >
            <span className="shrink-0 text-muted-foreground">{row.addr}</span>
            {/* Hex bytes */}
            <span className="shrink-0 flex">
              {row.bytes.map((cell, i) => (
                <span key={i} className="flex">
                  <span className={cn(cell.diff && 'bg-red-500/30 text-red-600 dark:text-red-400 rounded px-0.5')}>
                    {cell.hex}
                  </span>
                  {/* 每个字节间加空格，中间加额外空格 */}
                  <span>{' '}</span>
                  {byteWidth === 1 && i === 7 && <span>{' '}</span>}
                  {byteWidth === 2 && i === 3 && <span>{' '}</span>}
                  {byteWidth === 4 && i === 1 && <span>{' '}</span>}
                </span>
              ))}
            </span>
            {/* ASCII */}
            <span className="text-muted-foreground flex">
              {row.bytes.map((cell, i) => (
                <span key={i} className={cn(cell.diff && 'bg-red-500/30 text-red-600 dark:text-red-400 rounded px-0.5')}>
                  {cell.ascii}
                </span>
              ))}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
