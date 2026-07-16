import { useEffect, useRef, useMemo } from 'react'
import { Loader2 } from 'lucide-react'

interface HexViewerProps {
  /** base64 编码的二进制数据 */
  base64Data: string
  /** 数据基地址 */
  baseAddress: number
  /** 每行字节数 */
  bytesPerRow?: number
}

/** 将 base64 解码为 Uint8Array */
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

export function HexViewer({ base64Data, baseAddress, bytesPerRow = 16 }: HexViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const data = decodeBase64(base64Data)
    const result: { addr: string; hex: string; ascii: string }[] = []
    for (let offset = 0; offset < data.length; offset += bytesPerRow) {
      const rowBytes = data.slice(offset, offset + bytesPerRow)
      let hexPart = ''
      let asciiPart = ''
      for (let i = 0; i < bytesPerRow; i++) {
        if (i < rowBytes.length) {
          hexPart += byteToHex(rowBytes[i]) + ' '
          asciiPart += byteToAscii(rowBytes[i])
        } else {
          hexPart += '   '
          asciiPart += ' '
        }
        // 每 4 字节加一个空格分隔
        if (i === 7) hexPart += ' '
      }
      result.push({
        addr: formatHexAddr(baseAddress + offset),
        hex: hexPart.trimEnd(),
        ascii: asciiPart,
      })
    }
    return result
  }, [base64Data, baseAddress, bytesPerRow])

  // 自动滚动到顶部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [base64Data])

  return (
    <div ref={containerRef} className="h-full overflow-auto font-mono text-xs leading-relaxed">
      {rows.length === 0 ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-3 animate-spin" />
          加载中...
        </div>
      ) : (
        rows.map((row, i) => (
          <div key={i} className="flex gap-3 px-2 py-0.5 hover:bg-muted/30">
            <span className="shrink-0 text-muted-foreground">{row.addr}</span>
            <span className="shrink-0 text-foreground/80">{row.hex}</span>
            <span className="text-muted-foreground">{row.ascii}</span>
          </div>
        ))
      )}
    </div>
  )
}
