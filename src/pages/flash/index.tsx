import { useState } from 'react'
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
import { InfoPanel } from './components/InfoPanel'
import { FilePanel } from './components/FilePanel'
import { BinAddressDialog } from './components/BinAddressDialog'
import { EraseSectorsDialog } from './components/EraseSectorsDialog'
import { ReadBackDialog } from './components/ReadBackDialog'
import { CompareDialog } from './components/CompareDialog'
import { LogConsole, ResizeHandle } from './components/LogConsole'
import { useFlashStore } from '@/stores/flash.store'
import { useProbeStore } from '@/stores/probe.store'

export default function FlashPage() {
  const [logHeight, setLogHeight] = useState(180)

  const {
    busy,
    doCheckBlank,
    doEraseChip,
    doProgram,
    doVerify,
    doStartApp,
    doReset,
    setShowEraseSectorsDialog,
    setShowReadBackDialog,
  } = useFlashStore()

  const selectedProbe = useProbeStore((s) => {
    const uid = s.selectedUid
    return uid ? s.probes.find((p) => p.uid === uid) ?? null : null
  })
  const isConnected = selectedProbe?.state === 'connected'

  // 获取当前活跃 tab 判断 Program/Verify 是否可用
  const activeTab = useFlashStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null)
  const canProgram = activeTab?.type === 'file' && !!activeTab.filePath
  const canReadBack = !!activeTab // 任何 tab 都可以 read back

  const handleResize = (delta: number) => {
    setLogHeight((h) => Math.max(100, Math.min(window.innerHeight / 2, h - delta)))
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-2 shrink-0">
        {/* Check Blank */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!isConnected || busy}
          onClick={doCheckBlank}
          className="h-8 gap-1.5"
        >
          <ScanSearch className="size-3.5" />
          Check Blank
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Erase 下拉 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={!isConnected || busy}
              className="h-8 gap-1"
            >
              <Eraser className="size-3.5" />
              Erase
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={doEraseChip}>
              Erase Chip
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowEraseSectorsDialog(true)}>
              Erase Sectors...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Program 下拉 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={!isConnected || busy || !canProgram}
              className="h-8 gap-1"
            >
              <Upload className="size-3.5" />
              Program
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => doProgram(false)}>
              Program
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => doProgram(true)}>
              <ShieldCheck className="size-3.5 mr-1.5" />
              Program &amp; Verify
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Verify */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!isConnected || busy || !canProgram}
          onClick={doVerify}
          className="h-8 gap-1.5"
        >
          <CheckCircle className="size-3.5" />
          Verify
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Read Back 下拉 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={!isConnected || busy || !canReadBack}
              className="h-8 gap-1"
            >
              <Download className="size-3.5" />
              Read Back
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setShowReadBackDialog(true)}>
              Entire Chip...
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowReadBackDialog(true)}>
              Range...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Start Application */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!isConnected || busy}
          onClick={doStartApp}
          className="h-8 gap-1.5"
        >
          <Play className="size-3.5" />
          Start App
        </Button>

        {/* Reset */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!isConnected || busy}
          onClick={doReset}
          className="h-8 gap-1.5"
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      {/* 中间：左右两列 */}
      <div className="flex flex-1 min-h-0 gap-2 p-2">
        {/* 左列：信息面板 */}
        <div className="w-[280px] shrink-0">
          <InfoPanel />
        </div>
        {/* 右列：文件面板（多 Tab） */}
        <div className="flex-1 min-w-0">
          <FilePanel />
        </div>
      </div>

      {/* 可拖拽分隔 */}
      <ResizeHandle onResize={handleResize} />

      {/* 底部：日志区 */}
      <div className="shrink-0">
        <LogConsole height={logHeight} />
      </div>

      {/* 弹窗 */}
      <BinAddressDialog />
      <EraseSectorsDialog />
      <ReadBackDialog />
      <CompareDialog />
    </div>
  )
}
