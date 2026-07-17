import { useCallback, useState } from 'react'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { HexViewer, HexToolbar, type ByteWidth } from './HexViewer'
import { useFlashStore } from '@/stores/flash.store'
import { cn } from '@/lib/utils'

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatHex(addr: number): string {
  return `0x${addr.toString(16).toUpperCase().padStart(8, '0')}`
}

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

export function FilePanel() {
  const {
    filePath,
    fileInfo,
    fileData,
    loadingFile,
    loadFile,
    clearFile,
    eraseBefore,
    verifyAfter,
    resetAfter,
    setOption,
  } = useFlashStore()

  const [dragOver, setDragOver] = useState(false)
  const [byteWidth, setByteWidth] = useState<ByteWidth>(1)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      const filePath = window.electron?.getPathForFile?.(file)
      if (!filePath) {
        console.error('[FilePanel] Failed to get file path from drop event')
        return
      }

      const isBin = filePath.toLowerCase().endsWith('.bin')
      if (isBin) {
        const { useProbeStore } = await import('@/stores/probe.store')
        const { getDeviceInfo, pendingTarget } = useProbeStore.getState()
        const devInfo = getDeviceInfo(pendingTarget || '')
        const defaultAddr = devInfo?.flash_base_address
          ? parseInt(devInfo.flash_base_address, 16)
          : 0x08000000
        useFlashStore.setState({
          filePath,
          binBaseAddress: defaultAddr,
          showBinAddrDialog: true,
          fileInfo: null,
          fileData: null,
        })
        return
      }
      const { parseFile, readFile } = await import('@/services/file.service')
      useFlashStore.setState({ loadingFile: true, filePath, fileInfo: null, fileData: null })
      try {
        const [info, data] = await Promise.all([parseFile(filePath), readFile(filePath)])
        useFlashStore.setState({ fileInfo: info, fileData: data, loadingFile: false })
      } catch (err) {
        useFlashStore.setState({ loadingFile: false })
        console.error('[FilePanel] load failed:', err)
      }
    }
  }, [])

  return (
    <div className="flex h-full flex-col gap-2">
      {/* 文件信息 + 烧录选项（合并为一个紧凑 Card） */}
      <Card>
        <CardContent className="p-3 space-y-2">
          {filePath ? (
            <>
              {/* 第一行：文件名 + 清除按钮 */}
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 shrink-0 text-primary" />
                <span
                  className="truncate text-sm font-medium flex-1"
                  title={filePath}
                >
                  {getFileName(filePath)}
                </span>
                {fileInfo && (
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    <span className="uppercase font-medium">{fileInfo.format}</span>
                    <span className="mx-1">·</span>
                    {formatSize(fileInfo.size)}
                    {fileInfo.entry != null && <>
                      <span className="mx-1">·</span>
                      入口 {formatHex(fileInfo.entry)}
                    </>}
                  </span>
                )}
                <button onClick={clearFile} disabled={loadingFile} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="size-3.5" />
                </button>
              </div>
              {/* 第二行：烧录选项 */}
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={eraseBefore} onChange={(e) => setOption('eraseBefore', e.target.checked)} className="size-3 rounded border-border accent-primary" />
                  <Label className="cursor-pointer">烧录前擦除</Label>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={verifyAfter} onChange={(e) => setOption('verifyAfter', e.target.checked)} className="size-3 rounded border-border accent-primary" />
                  <Label className="cursor-pointer">烧录后校验</Label>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={resetAfter} onChange={(e) => setOption('resetAfter', e.target.checked)} className="size-3 rounded border-border accent-primary" />
                  <Label className="cursor-pointer">烧录后复位</Label>
                </label>
              </div>
              {loadingFile && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  加载中...
                </div>
              )}
            </>
          ) : (
            <div
              onClick={() => loadFile()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-6 transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
              )}
            >
              <Upload className="mb-1.5 size-5 text-muted-foreground" />
              <p className="text-sm">拖拽文件到此处或点击选择</p>
              <p className="mt-0.5 text-xs text-muted-foreground/60">支持 .bin / .hex / .elf / .axf</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hex 预览（工具栏 + 内容，最大化预览区域） */}
      {fileData && fileData.data && (
        <Card className="flex flex-1 flex-col min-h-0">
          {/* 工具栏 */}
          <div className="shrink-0 border-b border-border px-2 py-1.5 relative">
            <HexToolbar
              byteWidth={byteWidth}
              onByteWidthChange={setByteWidth}
              baseAddress={fileData.base_address}
              dataLength={fileData.size}
            />
          </div>
          {/* Hex 内容 */}
          <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
            <HexViewer
              base64Data={fileData.data}
              baseAddress={fileData.base_address}
              byteWidth={byteWidth}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
