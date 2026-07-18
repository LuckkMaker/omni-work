import { useCallback, useState } from 'react'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export function FileDropZone() {
  const { filePath, fileInfo, loadingFile, loadFile, clearFile } = useFlashStore()
  const [dragOver, setDragOver] = useState(false)

  // 拖拽 — Electron 中拖拽文件需要从 event.dataTransfer 获取 path
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      // Electron 中 file 对象有 path 属性
      const file = files[0] as File & { path?: string }
      if (file.path) {
        // 直接设置路径并解析
        useFlashStore.setState({ loadingFile: true, filePath: file.path, fileInfo: null })
        import('@/services/file.service').then(({ parseFile }) => {
          parseFile(file.path!)
            .then((info) => useFlashStore.setState({ fileInfo: info, loadingFile: false }))
            .catch((err) => {
              useFlashStore.setState({ loadingFile: false })
              console.error('[FileDropZone] parse failed:', err)
            })
        })
      }
    }
  }, [])

  if (filePath) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              <CardTitle>固件文件</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFile} disabled={loadingFile}>
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">{getFileName(filePath)}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{filePath}</div>
              {fileInfo && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="uppercase">{fileInfo.format}</Badge>
                  <Badge variant="outline">{formatSize(fileInfo.size)}</Badge>
                  {fileInfo.entry != null && (
                    <Badge variant="outline">入口 {formatHex(fileInfo.entry)}</Badge>
                  )}
                  {fileInfo.segments && fileInfo.segments.length > 0 && (
                    <Badge variant="outline">
                      {fileInfo.segments.length} 段 (0x{fileInfo.segments[0].address.toString(16).toUpperCase()})
                    </Badge>
                  )}
                </div>
              )}
              {loadingFile && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  解析中...
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="size-5 text-muted-foreground" />
          <CardTitle>固件文件</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div
          onClick={() => loadFile()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
          )}
        >
          <Upload className="mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">拖拽固件文件到此处</p>
          <p className="mt-1 text-xs text-muted-foreground">或点击选择文件</p>
          <p className="mt-3 text-xs text-muted-foreground/60">支持 .bin / .hex / .elf / .axf 格式</p>
        </div>
      </CardContent>
    </Card>
  )
}
