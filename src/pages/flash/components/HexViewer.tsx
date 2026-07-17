import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ByteWidth = 1 | 2 | 4

interface HexViewerProps {
  base64Data: string
  baseAddress: number
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

/** 读取小端序多字节值 */
function readLeU16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8)
}
function readLeU32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0
}

function wordToHex(val: number, width: ByteWidth): string {
  const hexStr = val.toString(16).toUpperCase().padStart(width * 2, '0')
  return hexStr
}

export function HexViewer({ base64Data, baseAddress }: HexViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [byteWidth, setByteWidth] = useState<ByteWidth>(1)
  const [jumpAddr, setJumpAddr] = useState('')
  const [highlightOffset, setHighlightOffset] = useState<number | null>(null)

  // 每行字节数 = 16 / byteWidth
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
            for (let j = 0; j < byteWidth; j++) asciiPart += byteToAscii(data[pos + j])
          } else if (byteWidth === 2) {
            hexPart += wordToHex(readLeU16(data, pos), 2)
            asciiPart += byteToAscii(data[pos]) + byteToAscii(data[pos + 1])
          } else {
            hexPart += wordToHex(readLeU32(data, pos), 4)
            asciiPart += byteToAscii(data[pos]) + byteToAscii(data[pos + 1]) + byteToAscii(data[pos + 2]) + byteToAscii(data[pos + 3])
          }
        } else {
          // 不足一行，填充
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
        // 每 4 字节加一个空格分隔（以 1B 模式为准）
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

  // 自动滚动到顶部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
    setHighlightOffset(null)
  }, [base64Data, byteWidth])

  // 地址跳转
  const handleJump = useCallback(() => {
    let addr: number
    const trimmed = jumpAddr.trim().toLowerCase()
    if (trimmed.startsWith('0x')) {
      addr = parseInt(trimmed, 16)
    } else if (/^[0-9a-f]+$/.test(trimmed)) {
      addr = parseInt(trimmed, 16)
    } else {
      addr = parseInt(trimmed, 10)
    }
    if (isNaN(addr)) return

    const offset = addr - baseAddress
    if (offset < 0 || offset >= data.length) return

    // 找到最近的行
    const rowIndex = Math.floor(offset / bytesPerRow) * bytesPerRow
    const el = rowRefs.current.get(rowIndex)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setHighlightOffset(rowIndex)
      // 3 秒后取消高亮
      setTimeout(() => setHighlightOffset(null), 3000)
    }
  }, [jumpAddr, baseAddress, data.length, bytesPerRow])

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        {/* 字节宽度切换 */}
        <div className="flex items-center rounded-md border border-border">
          {([1, 2, 4] as ByteWidth[]).map((w) => (
            <button
              key={w}
              onClick={() => setByteWidth(w)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium transition-colors',
                byteWidth === w
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {w}B
            </button>
          ))}
        </div>

        {/* 地址跳转 */}
        <div className="flex items-center gap-1 ml-auto">
          <Input
            value={jumpAddr}
            onChange={(e) => setJumpAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            placeholder="跳转地址 (hex)"
            className="h-7 w-36 font-mono text-xs"
          />
          <Button variant="ghost" size="sm" onClick={handleJump} className="h-7 px-2">
            <Search className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Hex 内容 */}
      <div ref={containerRef} className="flex-1 overflow-auto font-mono text-xs leading-relaxed">
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
    </div>
  )
}
