import { useEffect } from 'react'
import { Eraser, Download, ShieldCheck, RotateCcw, Loader2 } from 'lucide-react'
import { InfoPanel } from './components/InfoPanel'
import { FilePanel } from './components/FilePanel'
import { FlashProgress } from './components/FlashProgress'
import { LogConsole } from './components/LogConsole'
import { Button } from '@/components/ui/button'
import { useProbeStore } from '@/stores/probe.store'
import { useFlashStore } from '@/stores/flash.store'
import { wsClient } from '@/services/ws'
import type { FlashProgressEvent, LogEvent, FlashResult } from '@shared/types'

export default function FlashPage() {
  const { getSelectedProbe } = useProbeStore()
  const {
    filePath,
    busy,
    doErase,
    doProgram,
    doVerify,
    doReset,
    onProgress,
    onLog,
    onComplete,
  } = useFlashStore()

  const probe = getSelectedProbe()
  const isConnected = probe?.state === 'connected'
  const canOperate = isConnected && !busy

  // 订阅 WebSocket 烧录事件
  useEffect(() => {
    const unsubProgress = wsClient.on('flash.progress', (data) => {
      onProgress(data as FlashProgressEvent)
    })
    const unsubLog = wsClient.on('log', (data) => {
      onLog(data as LogEvent)
    })
    const unsubComplete = wsClient.on('flash.complete', (data) => {
      onComplete(data as FlashResult)
    })
    return () => {
      unsubProgress()
      unsubLog()
      unsubComplete()
    }
  }, [onProgress, onLog, onComplete])

  return (
    <div className="flex h-full flex-col p-4">
      {/* 顶部标题 + 操作按钮 */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Flash 烧录</h1>
          <p className="text-xs text-muted-foreground">固件烧录、擦除、校验</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={doErase} disabled={!canOperate || busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Eraser className="size-3.5" />}
            擦除
          </Button>
          <Button size="sm" onClick={doProgram} disabled={!canOperate || !filePath || busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            烧录
          </Button>
          <Button variant="outline" size="sm" onClick={doVerify} disabled={!canOperate || !filePath || busy} className="gap-1.5">
            <ShieldCheck className="size-3.5" />
            校验
          </Button>
          <Button variant="outline" size="sm" onClick={doReset} disabled={!canOperate || busy} className="gap-1.5">
            <RotateCcw className="size-3.5" />
            复位
          </Button>
        </div>
      </div>

      {/* 进度条（仅操作中/有结果时显示） */}
      <FlashProgress />

      {/* 主体：左右两列 */}
      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-3">
        {/* 左侧：信息区 */}
        <div className="overflow-y-auto">
          <InfoPanel />
        </div>

        {/* 右侧：文件区 */}
        <div className="min-h-0 overflow-hidden">
          <FilePanel />
        </div>
      </div>

      {/* 底部：日志区 */}
      <div className="mt-3 h-40 shrink-0">
        <LogConsole />
      </div>
    </div>
  )
}
