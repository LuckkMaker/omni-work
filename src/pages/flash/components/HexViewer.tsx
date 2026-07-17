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

export function HexViewer({ base64Data, baseAddress, byteWidth }: HexViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [highlightOffset, setHighlightOffset] = useState<number | null>(null)

  const bytesPerRow = 16 / byteWidth

  const data = useMemo(() => decodeBase64(base64Data), [base64Data])

  const rows = useMemo(() => {
    const result: { offset: number; addr: string; hex: string; ascii: string }[] = []
    for (let offset = 0; offset < data.length; offset += bytesPerRow) {
      let hexPart = ''
      let asciiPart = ''
      for (let i = 0; i < bytesPerRow; i++) {
        const pos = offset + i * byteWidth
        if (pos + byteWidth <= data.length) {
          if (byteWidth === 1) {
            hexPart += byteToHex(data[pos])
            asciiPart += byteToAscii(data[pos])
          } else if (byteWidth === 2) {
            hexPart += wordToHex(readLeU16(data, pos), 2)
            asciiPart += byteToAscii(data[pos]) + byteToAscii(data[pos + 1])
          } else {
            hexPart += wordToHex(readLeU32(data, pos), 4)
            asciiPart += byteToAscii(data[pos]) + byteToAscii(data[pos + 1]) + byteToAscii(data[pos + 2]) + byteToAscii(data[pos + 3])
          }
        } else {
          if (byteWidth === 1) {
            hexPart += '   '
            asciiPart += ' '
          } else if (byteWidth === 2) {
            hexPart += pos < data.length ? byteToHex(data[pos]) + '   ' : '     '
            asciiPart += pos < data.length ? byteToAscii(data[pos]) : ' '
          } else {
            hexPart += '         '
            asciiPart += '    '
          }
        }
        hexPart += ' '
        if (byteWidth === 1 && i === 7) hexPart += ' '
        if (byteWidth === 2 && i === 3) hexPart += ' '
        if (byteWidth === 4 && i === 1) hexPart += ' '
      }
      result.push({
        offset,
        addr: formatHexAddr(baseAddress + offset),
        hex: hexPart.trimEnd(),
        ascii: asciiPart,
      })
    }
    return result
  }, [data, baseAddress, byteWidth, bytesPerRow])

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

  return (
    <div ref={containerRef} className="h-full overflow-auto font-mono text-xs leading-relaxed">
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
            <span className="shrink-0 text-foreground/80">{row.hex}</span>
            <span className="text-muted-foreground">{row.ascii}</span>
          </div>
        ))
      )}
    </div>
  )
}
