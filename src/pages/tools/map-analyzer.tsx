import { useState, useCallback, useRef } from 'react'
import { FileBarChart, Upload, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MemoryRegion {
  name: string
  origin: number
  length: number
  used: number
}

interface SectionInfo {
  name: string
  address: number
  size: number
  file?: string
}

interface MapData {
  regions: MemoryRegion[]
  sections: SectionInfo[]
  totalText: number
  totalData: number
  totalBss: number
}

export default function MapAnalyzer() {
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState<'size' | 'address' | 'name'>('size')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError('')
    setFileName(file.name)
    try {
      const text = await file.text()
      const data = parseMapFile(text)
      setMapData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败')
      setMapData(null)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const sortedSections = mapData
    ? [...mapData.sections].sort((a, b) => {
        switch (sortBy) {
          case 'size': return b.size - a.size
          case 'address': return a.address - b.address
          case 'name': return a.name.localeCompare(b.name)
        }
      })
    : []

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <FileBarChart className="h-6 w-6 text-blue-500" />
        <div>
          <h1 className="text-xl font-bold">Map Analyzer</h1>
          <p className="text-sm text-muted-foreground">GNU ld 链接映射文件分析</p>
        </div>
      </div>

      {/* 文件上传 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-10 transition-colors',
          'hover:border-primary/50 hover:bg-muted/20'
        )}
      >
        <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          拖放 .map 文件到此处，或
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          选择文件
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".map,.txt"
          className="hidden"
          onChange={handleFileInput}
        />
        {fileName && (
          <p className="mt-2 text-xs text-muted-foreground">已加载: {fileName}</p>
        )}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      {/* 分析结果 */}
      {mapData && (
        <>
          {/* 内存区域概览 */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Flash (.text)" value={mapData.totalText} color="text-blue-500" />
            <StatCard label="RAM (.data)" value={mapData.totalData} color="text-green-500" />
            <StatCard label="RAM (.bss)" value={mapData.totalBss} color="text-purple-500" />
          </div>

          {/* 内存区域使用率 */}
          {mapData.regions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">内存区域使用率</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mapData.regions.map((region) => {
                  const pct = region.length > 0 ? (region.used / region.length) * 100 : 0
                  return (
                    <div key={region.name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-mono font-medium">{region.name}</span>
                        <span className="text-muted-foreground">
                          {formatBytes(region.used)} / {formatBytes(region.length)} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                          )}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* 区段明细 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">区段明细（{mapData.sections.length} 项）</CardTitle>
                <div className="flex gap-1">
                  {(['size', 'address', 'name'] as const).map((key) => (
                    <Button
                      key={key}
                      variant={sortBy === key ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSortBy(key)}
                    >
                      {key === 'size' ? '按大小' : key === 'address' ? '按地址' : '按名称'}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">区段</th>
                      <th className="py-2 pr-4 font-medium">地址</th>
                      <th className="py-2 pr-4 text-right font-medium">大小</th>
                      <th className="py-2 font-medium">文件</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {sortedSections.slice(0, 200).map((section, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-1.5 pr-4 text-blue-500">{section.name}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">
                          0x{section.address.toString(16).padStart(8, '0')}
                        </td>
                        <td className="py-1.5 pr-4 text-right">
                          {section.size > 0 ? formatBytes(section.size) : '-'}
                        </td>
                        <td className="py-1.5 truncate text-muted-foreground" title={section.file}>
                          {section.file || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sortedSections.length > 200 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    仅显示前 200 项（共 {sortedSections.length} 项）
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-2xl font-bold font-mono', color)}>{formatBytes(value)}</div>
      </CardContent>
    </Card>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** 解析 GNU ld .map 文件 */
function parseMapFile(text: string): MapData {
  const lines = text.split('\n')
  const regions: MemoryRegion[] = []
  const sections: SectionInfo[] = []
  let totalText = 0
  let totalData = 0
  let totalBss = 0

  // 解析 Memory Configuration
  let inMemoryConfig = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('Memory Configuration')) {
      inMemoryConfig = true
      continue
    }
    if (inMemoryConfig) {
      if (line.startsWith('Linker script') || line === '') {
        if (regions.length > 0) inMemoryConfig = false
        continue
      }
      // 格式: Name             Origin             Length             Attributes
      const match = line.match(/^(\S+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)\s*(\S*)/)
      if (match) {
        regions.push({
          name: match[1],
          origin: parseInt(match[2], 16),
          length: parseInt(match[3], 16),
          used: 0,
        })
      }
    }
  }

  // 解析区段和符号
  // 匹配格式: .text 0x08000000 0x1234 file.o
  const sectionRegex = /^(\.\S+)\s+0x([0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+|\d+)\s*(.*)$/

  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(sectionRegex)
    if (match) {
      const name = match[1]
      const address = parseInt(match[2], 16)
      const sizeStr = match[3]
      const size = sizeStr.startsWith('0x') ? parseInt(sizeStr, 16) : parseInt(sizeStr, 10)
      const file = match[4].trim() || undefined

      sections.push({ name, address, size, file })

      // 统计
      if (name.startsWith('.text') || name.startsWith('.rodata') || name.startsWith('.init') || name.startsWith('.fini') || name.startsWith('.isr_vector') || name.startsWith('.ARM.extab') || name.startsWith('.ARM.exidx')) {
        totalText += size
        // 匹配到对应内存区域
        const region = regions.find((r) => address >= r.origin && address < r.origin + r.length)
        if (region) region.used += size
      } else if (name.startsWith('.data') || name.startsWith('.got')) {
        totalData += size
        const region = regions.find((r) => address >= r.origin && address < r.origin + r.length)
        if (region) region.used += size
      } else if (name.startsWith('.bss') || name.startsWith('._user_heap_stack') || name.startsWith('.noinit')) {
        totalBss += size
        const region = regions.find((r) => address >= r.origin && address < r.origin + r.length)
        if (region) region.used += size
      }
    }
  }

  return { regions, sections, totalText, totalData, totalBss }
}
