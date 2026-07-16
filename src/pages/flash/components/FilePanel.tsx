import { useCallback, useState } from 'react'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { HexViewer } from './HexViewer'
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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0] as File & { path?: string }
      if (file.path) {
        const { parseFile, readFile } = await import('@/services/file.service')
        useFlashStore.setState({ loadingFile: true, filePath: file.path, fileInfo: null, fileData: null })
        try {
          const [info, data] = await Promise.all([parseFile(file.path), readFile(file.path)])
          useFlashStore.setState({ fileInfo: info, fileData: data, loadingFile: false })
        } catch (err) {
          useFlashStore.setState({ loadingFile: false })
          console.error('[FilePanel] load failed:', err)
        }
      }
    }
  }, [])

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 文件拖拽/选择区 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {filePath ? <FileText className="size-4 text-primary" /> : <Upload className="size-4 text-muted-foreground" />}
              <CardTitle className="text-sm">固件文件</CardTitle>
            </div>
            {filePath && (
              <button onClick={clearFile} disabled={loadingFile} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filePath ? (
            <div className="space-y-2">
              <div className="truncate text-sm font-medium">{getFileName(filePath)}</div>
              <div className="truncate text-xs text-muted-foreground">{filePath}</div>
              {fileInfo && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="uppercase font-medium">{fileInfo.format}</span>
                  <span>· {formatSize(fileInfo.size)}</span>
                  {fileInfo.entry != null && <span>· 入口 {formatHex(fileInfo.entry)}</span>}
                </div>
              )}
              {loadingFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  加载中...
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={() => loadFile()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
              )}
            >
              <Upload className="mb-2 size-6 text-muted-foreground" />
              <p className="text-sm">拖拽文件到此处或点击选择</p>
              <p className="mt-1 text-xs text-muted-foreground/60">支持 .bin / .hex / .elf / .axf</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hex 查看器 */}
      {fileData && fileData.data && (
        <Card className="flex flex-1 flex-col min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">文件预览 ({fileData.format.toUpperCase()})</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <HexViewer
              base64Data={fileData.data}
              baseAddress={fileData.base_address}
            />
          </CardContent>
        </Card>
      )}

      {/* 烧录选项 */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 py-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={eraseBefore} onChange={(e) => setOption('eraseBefore', e.target.checked)} className="size-4 rounded border-border accent-primary" />
            <Label className="cursor-pointer">烧录前擦除</Label>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={verifyAfter} onChange={(e) => setOption('verifyAfter', e.target.checked)} className="size-4 rounded border-border accent-primary" />
            <Label className="cursor-pointer">烧录后校验</Label>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={resetAfter} onChange={(e) => setOption('resetAfter', e.target.checked)} className="size-4 rounded border-border accent-primary" />
            <Label className="cursor-pointer">烧录后复位</Label>
          </label>
        </CardContent>
      </Card>
    </div>
  )
}
