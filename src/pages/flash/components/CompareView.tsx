import { useMemo, useState, useRef, useCallback } from 'react'
import { HexViewer, HexToolbar, type ByteWidth } from './HexViewer'

interface CompareViewProps {
  leftBase64: string
  leftBaseAddress: number
  leftTitle: string
  rightBase64: string
  rightBaseAddress: number
  rightTitle: string
}

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatHex(addr: number): string {
  return `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`
}

export function CompareView({
  leftBase64,
  leftBaseAddress,
  leftTitle,
  rightBase64,
  rightBaseAddress,
  rightTitle,
}: CompareViewProps) {
  const [byteWidth, setByteWidth] = useState<ByteWidth>(1)

  // 滚动同步状态
  const [leftSyncScroll, setLeftSyncScroll] = useState<number | null>(null)
  const [rightSyncScroll, setRightSyncScroll] = useState<number | null>(null)
  const isSyncing = useRef(false)

  const leftBytes = useMemo(() => {
    const bin = atob(leftBase64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr
  }, [leftBase64])

  const rightBytes = useMemo(() => {
    const bin = atob(rightBase64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr
  }, [rightBase64])

  const diffCount = useMemo(() => {
    const minLen = Math.min(leftBytes.length, rightBytes.length)
    let count = 0
    for (let i = 0; i < minLen; i++) {
      if (leftBytes[i] !== rightBytes[i]) count++
    }
    count += Math.abs(leftBytes.length - rightBytes.length)
    return count
  }, [leftBytes, rightBytes])

  const matchCount = Math.min(leftBytes.length, rightBytes.length) - (diffCount - Math.abs(leftBytes.length - rightBytes.length))

  // 左侧滚动 → 同步右侧
  const handleLeftScroll = useCallback((scrollTop: number) => {
    if (isSyncing.current) return
    isSyncing.current = true
    setRightSyncScroll(scrollTop)
    requestAnimationFrame(() => { isSyncing.current = false })
  }, [])

  // 右侧滚动 → 同步左侧
  const handleRightScroll = useCallback((scrollTop: number) => {
    if (isSyncing.current) return
    isSyncing.current = true
    setLeftSyncScroll(scrollTop)
    requestAnimationFrame(() => { isSyncing.current = false })
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-2 border-b border-border px-2 py-1.5">
        <HexToolbar
          byteWidth={byteWidth}
          onByteWidthChange={setByteWidth}
          baseAddress={leftBaseAddress}
          dataLength={leftBytes.length}
        />
        <div className="ml-auto text-[11px] text-muted-foreground flex items-center gap-2">
          <span className="text-green-600 dark:text-green-400">匹配 {formatSize(Math.max(0, matchCount))}</span>
          <span>·</span>
          <span className="text-red-600 dark:text-red-400">差异 {diffCount} bytes</span>
        </div>
      </div>

      {/* 左右双栏 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧 */}
        <div className="flex-1 min-w-0 border-r border-border flex flex-col">
          <div className="shrink-0 px-2 py-1 bg-muted/30 text-xs font-medium border-b border-border truncate">
            <span className="text-muted-foreground">Left: </span>
            {leftTitle}
            <span className="ml-2 text-muted-foreground/70">{formatHex(leftBaseAddress)} · {formatSize(leftBytes.length)}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <HexViewer
              base64Data={leftBase64}
              baseAddress={leftBaseAddress}
              byteWidth={byteWidth}
              diffBase64={rightBase64}
              diffBaseAddress={rightBaseAddress}
              onScrollSync={handleLeftScroll}
              syncScrollTop={leftSyncScroll}
            />
          </div>
        </div>

        {/* 右侧 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 px-2 py-1 bg-muted/30 text-xs font-medium border-b border-border truncate">
            <span className="text-muted-foreground">Right: </span>
            {rightTitle}
            <span className="ml-2 text-muted-foreground/70">{formatHex(rightBaseAddress)} · {formatSize(rightBytes.length)}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <HexViewer
              base64Data={rightBase64}
              baseAddress={rightBaseAddress}
              byteWidth={byteWidth}
              diffBase64={leftBase64}
              diffBaseAddress={leftBaseAddress}
              onScrollSync={handleRightScroll}
              syncScrollTop={rightSyncScroll}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
