import { useState, useCallback } from 'react'
import { Binary } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Base = 'hex' | 'dec' | 'bin' | 'oct'

const BASE_INFO: Record<Base, { label: string; prefix: string; radix: number }> = {
  hex: { label: '十六进制', prefix: '0x', radix: 16 },
  dec: { label: '十进制', prefix: '', radix: 10 },
  bin: { label: '二进制', prefix: '0b', radix: 2 },
  oct: { label: '八进制', prefix: '0o', radix: 8 },
}

export default function NumberConverter() {
  const [inputBase, setInputBase] = useState<Base>('hex')
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState('')

  const value = (() => {
    if (!inputValue.trim()) return null
    try {
      const cleaned = inputValue.trim().replace(/^0x/i, '').replace(/^0b/i, '').replace(/^0o/i, '')
      const num = parseInt(cleaned, BASE_INFO[inputBase].radix)
      if (isNaN(num)) return null
      return num >>> 0 // 转为无符号 32 位
    } catch {
      return null
    }
  })()

  const handleInputChange = useCallback((v: string) => {
    setInputValue(v)
    setError('')
    // 验证输入
    if (v.trim()) {
      const cleaned = v.trim().replace(/^0x/i, '').replace(/^0b/i, '').replace(/^0o/i, '')
      const radix = BASE_INFO[inputBase].radix
      const valid = radix === 16 ? /^[0-9a-fA-F]+$/ : radix === 10 ? /^\d+$/ : radix === 2 ? /^[01]+$/ : /^[0-7]+$/
      if (!valid.test(cleaned)) {
        setError(`无效的${BASE_INFO[inputBase].label}输入`)
      }
    }
  }, [inputBase])

  const conversions: Record<Base, string> = {
    hex: value !== null ? value.toString(16).toUpperCase() : '',
    dec: value !== null ? value.toString(10) : '',
    bin: value !== null ? value.toString(2) : '',
    oct: value !== null ? value.toString(8) : '',
  }

  // ASCII 表示
  const ascii = value !== null && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value).replace(/[^\x20-\x7E]/g, '.')
    : ''
  const asciiInfo = value !== null && value >= 32 && value < 127
    ? `可打印字符: '${ascii}'`
    : value !== null && value < 32
    ? `控制字符: ${getControlCharName(value)}`
    : ''

  // 位域分析
  const bits = value !== null ? value.toString(2).padStart(32, '0') : ''

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <Binary className="h-6 w-6 text-green-500" />
        <div>
          <h1 className="text-xl font-bold">Number Converter</h1>
          <p className="text-sm text-muted-foreground">进制转换与位域分析</p>
        </div>
      </div>

      {/* 输入 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">输入</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-1">
            {(Object.keys(BASE_INFO) as Base[]).map((base) => (
              <Button
                key={base}
                variant={inputBase === base ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setInputBase(base)
                  setInputValue('')
                  setError('')
                }}
                className="text-xs"
              >
                {BASE_INFO[base].label}
              </Button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              {BASE_INFO[inputBase].prefix}
            </span>
            <Input
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={`输入${BASE_INFO[inputBase].label}数值...`}
              className={cn('pl-12 font-mono text-lg', error && 'border-red-500')}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {/* 转换结果 */}
      {value !== null && !error && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">转换结果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(Object.keys(BASE_INFO) as Base[]).map((base) => (
                <div
                  key={base}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-4 py-3',
                    base === inputBase ? 'bg-primary/5' : 'bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{BASE_INFO[base].label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{BASE_INFO[base].prefix}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-base font-semibold">
                      {conversions[base]}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(BASE_INFO[base].prefix + conversions[base])}
                      className="text-xs text-muted-foreground hover:text-foreground"
                      title="复制"
                    >
                      复制
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 字符信息 */}
          {asciiInfo && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">ASCII:</span>
                  <span className="font-mono text-base">{asciiInfo}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 位域分析 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">位域分析（32 位）</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1 font-mono text-sm">
                {bits.split('').map((bit, i) => (
                  <span
                    key={i}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-xs',
                      bit === '1' ? 'bg-green-500/20 text-green-500' : 'bg-muted/30 text-muted-foreground'
                    )}
                    title={`Bit ${31 - i}`}
                  >
                    {bit}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
                <span>Bit 31</span>
                <span>Bit 0</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <BitGroup label="Byte 3" bits={bits.substring(0, 8)} value={value !== null ? (value >>> 24) & 0xff : 0} />
                <BitGroup label="Byte 2" bits={bits.substring(8, 16)} value={value !== null ? (value >>> 16) & 0xff : 0} />
                <BitGroup label="Byte 1" bits={bits.substring(16, 24)} value={value !== null ? (value >>> 8) & 0xff : 0} />
                <BitGroup label="Byte 0" bits={bits.substring(24, 32)} value={value !== null ? value & 0xff : 0} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function BitGroup({ label, bits, value }: { label: string; bits: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/20 p-2 text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xs">{bits}</div>
      <div className="mt-0.5 font-mono text-xs text-green-500">0x{value.toString(16).padStart(2, '0')}</div>
    </div>
  )
}

function getControlCharName(code: number): string {
  const names: Record<number, string> = {
    0: 'NUL (空字符)',
    1: 'SOH',
    2: 'STX',
    3: 'ETX',
    4: 'EOT',
    5: 'ENQ',
    6: 'ACK',
    7: 'BEL (响铃)',
    8: 'BS (退格)',
    9: 'HT (水平制表)',
    10: 'LF (换行)',
    11: 'VT (垂直制表)',
    12: 'FF (换页)',
    13: 'CR (回车)',
    14: 'SO',
    15: 'SI',
    16: 'DLE',
    17: 'DC1',
    18: 'DC2',
    19: 'DC3',
    20: 'DC4',
    21: 'NAK',
    22: 'SYN',
    23: 'ETB',
    24: 'CAN',
    25: 'EM',
    26: 'SUB',
    27: 'ESC (转义)',
    28: 'FS',
    29: 'GS',
    30: 'RS',
    31: 'US',
  }
  return names[code] || `控制字符 ${code}`
}
