import { useState, useRef } from 'react'
import {
  Eraser,
  Upload,
  CheckCircle,
  Download,
  Play,
  RotateCcw,
  ScanSearch,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { FilePanel } from './components/FilePanel'
import { BinAddressDialog } from './components/BinAddressDialog'
import { ReadBackRangeDialog } from './components/ReadBackRangeDialog'
import { CompareDialog } from './components/CompareDialog'
import { LogConsole, ResizeHandle } from '@/components/LogConsole'
import { useFlashStore } from '@/stores/flash.store'
import { useProbeStore } from '@/stores/probe.store'

const LOG_MIN_HEIGHT = 120
const LOG_DEFAULT_EXPANDED = 280

export default function FlashPage() {
  // 默认收缩到最小值；lastExpandedHeight 保存上次展开值用于双击恢复
  const [bottomHeight, setBottomHeight] = useState(LOG_MIN_HEIGHT)
  const lastExpandedHeight = useRef(LOG_DEFAULT_EXPANDED)

  const {
    busy,
    doCheckBlank,
    doEraseChip,
    doEraseSelectedSectors,
    doProgram,
    doVerify,
    doReadBack,
    doReadBackSelectedSectors,
    doStartApp,
    doReset,
    setShowReadBackRangeDialog,
  } = useFlashStore()

  const selectedProbe = useProbeStore((s) => {
    const uid = s.selectedUid
    return uid ? s.probes.find((p) => p.uid === uid) ?? null : null
  })
  const isConnected = selectedProbe?.state === 'connected'

  const activeTab = useFlashStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  // 可编程条件：file tab 有文件路径，或 device tab 有数据
  const canProgram = activeTab?.type === 'file' && !!activeTab.filePath
    || activeTab?.type === 'device' && !!activeTab.data
  const canReadBack = !!activeTab

  const handleResize = (delta: number) => {
    setBottomHeight((h) => {
      const next = Math.max(LOG_MIN_HEIGHT, Math.min(window.innerHeight / 2, h - delta))
      // 记录非最小值作为"上次展开值"
      if (next > LOG_MIN_HEIGHT) lastExpandedHeight.current = next
      return next
    })
  }

  const handleToggleLog = () => {
    setBottomHeight((h) => {
      if (h > LOG_MIN_HEIGHT) {
        // 当前展开 → 折叠到最小
        return LOG_MIN_HEIGHT
      }
      // 当前折叠 → 恢复上次展开值
      return lastExpandedHeight.current
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={!isConnected || busy || !canProgram} className="h-8 gap-1">
              <Upload className="size-3.5" />
              Program
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => doProgram(false)}>Program</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doProgram(true)}>
              <ShieldCheck className="size-3.5 mr-1.5" />
              Program &amp; Verify
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={!isConnected || busy} className="h-8 gap-1">
              <Eraser className="size-3.5" />
              Erase
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={doEraseChip}>Erase Chip</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doEraseSelectedSectors()}>Erase Sectors...</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="sm" disabled={!isConnected || busy || !canProgram} onClick={doVerify} className="h-8 gap-1.5">
          <CheckCircle className="size-3.5" />
          Verify
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={!isConnected || busy || !canReadBack} className="h-8 gap-1">
              <Download className="size-3.5" />
              Read Back
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => doReadBack('chip')}>Entire Chip</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doReadBackSelectedSectors()}>Sectors...</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowReadBackRangeDialog(true)}>Range...</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="sm" disabled={!isConnected || busy} onClick={doStartApp} className="h-8 gap-1.5">
          <Play className="size-3.5" />
          Start App
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="sm" disabled={!isConnected || busy} onClick={doReset} className="h-8 gap-1.5">
          <RotateCcw className="size-3.5" />
          Reset
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="sm" disabled={!isConnected || busy} onClick={doCheckBlank} className="h-8 gap-1.5">
          <ScanSearch className="size-3.5" />
          Check Blank
        </Button>
      </div>

      {/* 中间：文件区域（全宽） */}
      <div className="flex-1 min-h-0 p-2">
        <FilePanel />
      </div>

      {/* 可拖拽分隔 */}
      <ResizeHandle
        onResize={handleResize}
        onToggle={handleToggleLog}
        expanded={bottomHeight > LOG_MIN_HEIGHT}
      />

      {/* 底部：日志（全宽） */}
      <div className="shrink-0 border-t border-border" style={{ height: bottomHeight }}>
        <FlashLogConsole />
      </div>

      {/* 弹窗 */}
      <BinAddressDialog />
      <ReadBackRangeDialog />
      <CompareDialog />
    </div>
  )
}

/** Flash 日志控制台（响应式订阅 flash store） */
function FlashLogConsole() {
  const logs = useFlashStore((s) => s.logs)
  const clearLogs = useFlashStore((s) => s.clearLogs)
  return <LogConsole logs={logs} onClear={clearLogs} title="日志" />
}
