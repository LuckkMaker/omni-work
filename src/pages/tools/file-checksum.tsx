import { useState, useCallback, useRef } from 'react'
import { FileCheck2, Upload, FileText, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ChecksumResult {
  crc32: string
  md5: string
  sha1: string
  sha256: string
  size: number
}

export default function FileChecksum() {
  const [result, setResult] = useState<ChecksumResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [computing, setComputing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setComputing(true)
    setProgress(0)
    setFileName(file.name)
    setResult(null)

    try {
      // CRC32 通过自定义实现
      const crc32Promise = computeCRC32(file, setProgress)

      // SHA 系列通过 Web Crypto API
      const md5Promise = computeHashWithSubtleCrypto(file, 'MD5').catch(() => '不支持（浏览器未实现 MD5）')
      const sha1Promise = computeHashWithSubtleCrypto(file, 'SHA-1')
      const sha256Promise = computeHashWithSubtleCrypto(file, 'SHA-256')

      const [crc32, md5, sha1, sha256] = await Promise.all([
        crc32Promise,
        md5Promise,
        sha1Promise,
        sha256Promise,
      ])

      setResult({
        crc32: crc32.toString(16).padStart(8, '0').toUpperCase(),
        md5,
        sha1,
        sha256,
        size: file.size,
      })
    } catch (e) {
      setResult({
        crc32: '计算失败',
        md5: '计算失败',
        sha1: '计算失败',
        sha256: '计算失败',
        size: file.size,
      })
    } finally {
      setComputing(false)
      setProgress(100)
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

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <FileCheck2 className="h-6 w-6 text-purple-500" />
        <div>
          <h1 className="text-xl font-bold">File Checksum</h1>
          <p className="text-sm text-muted-foreground">文件校验和计算（CRC32 / MD5 / SHA-1 / SHA-256）</p>
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
          拖放文件到此处，或
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={computing}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          选择文件
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInput}
        />
        {fileName && (
          <p className="mt-2 text-xs text-muted-foreground">已选择: {fileName} ({formatBytes(result?.size ?? 0)})</p>
        )}
      </div>

      {/* 计算进度 */}
      {computing && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>计算中...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-purple-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 结果 */}
      {result && !computing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">校验和结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChecksumRow
              label="CRC32"
              value={result.crc32}
              onCopy={() => handleCopy(result.crc32, 'CRC32')}
              copied={copied === 'CRC32'}
            />
            <ChecksumRow
              label="MD5"
              value={result.md5}
              onCopy={() => handleCopy(result.md5, 'MD5')}
              copied={copied === 'MD5'}
              mono
            />
            <ChecksumRow
              label="SHA-1"
              value={result.sha1}
              onCopy={() => handleCopy(result.sha1, 'SHA-1')}
              copied={copied === 'SHA-1'}
              mono
            />
            <ChecksumRow
              label="SHA-256"
              value={result.sha256}
              onCopy={() => handleCopy(result.sha256, 'SHA-256')}
              copied={copied === 'SHA-256'}
              mono
            />
            <div className="border-t border-border pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">文件大小</span>
                <span className="font-mono">{formatBytes(result.size)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ChecksumRow({
  label,
  value,
  onCopy,
  copied,
  mono,
}: {
  label: string
  value: string
  onCopy: () => void
  copied: boolean
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="w-20 shrink-0 text-sm font-medium text-muted-foreground">{label}</span>
      <code className={cn('flex-1 truncate text-sm', mono && 'font-mono break-all')}>
        {value}
      </code>
      <button
        onClick={onCopy}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title="复制"
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** 使用 Web Crypto API 计算哈希 */
async function computeHashWithSubtleCrypto(file: File, algorithm: string): Promise<string> {
  try {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest(algorithm, buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return '不支持'
  }
}

/** CRC32 计算（分块处理大文件） */
async function computeCRC32(file: File, onProgress: (pct: number) => void): Promise<number> {
  // CRC32 查表法
  const crcTable = (() => {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let crc = i
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
      }
      table[i] = crc
    }
    return table
  })()

  let crc = 0xffffffff
  const chunkSize = 4 * 1024 * 1024 // 4MB 分块
  let offset = 0

  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize)
    const buffer = await slice.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
    }
    offset += chunkSize
    onProgress(Math.round((offset / file.size) * 100))
    // 让出主线程
    await new Promise((r) => setTimeout(r, 0))
  }

  return (crc ^ 0xffffffff) >>> 0
}
