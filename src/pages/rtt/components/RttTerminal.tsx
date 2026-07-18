import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { wsClient } from '@/services/ws'
import { useRttStore } from '@/stores/rtt.store'

/** 终端对外暴露的 API */
export interface RttTerminalApi {
  /** 清屏 */
  clear: () => void
  /** 获取所有接收到的原始数据（用于保存到文件） */
  getData: () => Uint8Array
  /** 清空数据缓冲 */
  clearData: () => void
  /** 聚焦终端 */
  focus: () => void
  /** 字体缩放 */
  zoom: (delta: number) => void
}

interface RttTerminalProps {
  /** 当前探针 UID */
  uid: string | null
  /** 是否正在运行 */
  running: boolean
}

const COLOR = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
}

/** 将字节数组格式化为 hex dump 文本 */
function formatHexDump(data: Uint8Array, offset = 0): string {
  let result = ''
  let pos = offset
  while (pos < data.length) {
    const chunk = data.slice(pos, pos + 16)
    const hexPart = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
    const asciiPart = Array.from(chunk)
      .map((b) => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.')
      .join('')
    const addr = (pos).toString(16).padStart(8, '0')
    result += `${COLOR.dim}${addr}${COLOR.reset}  ${hexPart.padEnd(47)}  ${asciiPart}\r\n`
    pos += 16
  }
  return result
}

export const RttTerminal = forwardRef<RttTerminalApi, RttTerminalProps>(
  function RttTerminal({ uid, running }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<XTerm | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const fontSize = useRef(13)

    // 接收数据缓冲（用于保存到文件）
    const dataBufferRef = useRef<Uint8Array[]>([])

    // 同步 store 状态到 ref（供 WebSocket 回调访问最新值）
    const selectedUpChannelRef = useRef(0)
    const displayModeRef = useRef<'text' | 'hex'>('text')
    const uidRef = useRef<string | null>(uid)
    uidRef.current = uid

    const selectedUpChannel = useRttStore((s) => s.selectedUpChannel)
    selectedUpChannelRef.current = selectedUpChannel
    const displayMode = useRttStore((s) => s.displayMode)
    displayModeRef.current = displayMode
    const addBytesReceived = useRttStore((s) => s.addBytesReceived)

    // 暴露 API
    useImperativeHandle(ref, () => ({
      clear: () => {
        const term = termRef.current
        if (term) {
          term.clear()
        }
      },
      getData: () => {
        const buffers = dataBufferRef.current
        const total = buffers.reduce((sum, b) => sum + b.length, 0)
        const result = new Uint8Array(total)
        let offset = 0
        for (const buf of buffers) {
          result.set(buf, offset)
          offset += buf.length
        }
        return result
      },
      clearData: () => {
        dataBufferRef.current = []
      },
      focus: () => termRef.current?.focus(),
      zoom: (delta: number) => {
        const term = termRef.current
        const fit = fitRef.current
        if (!term || !fit) return
        fontSize.current = Math.max(8, Math.min(24, fontSize.current + delta))
        term.options.fontSize = fontSize.current
        requestAnimationFrame(() => {
          try { fit.fit() } catch { /* ignore */ }
        })
      },
    }), [])

    // 初始化终端
    useEffect(() => {
      if (!containerRef.current) return

      const term = new XTerm({
        cursorBlink: false,
        fontSize: fontSize.current,
        fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
        convertEol: true,
        scrollback: 10000,
        disableStdin: true,
        allowProposedApi: true,
        theme: {
          background: '#0f172a',
          foreground: '#e2e8f0',
          cursor: '#2563eb',
          selectionBackground: '#33415580',
          black: '#0f172a',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#f8fafc',
          brightBlack: '#64748b',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff',
        },
      })

      const fit = new FitAddon()
      term.loadAddon(fit)
      term.loadAddon(new WebLinksAddon())
      term.open(containerRef.current)

      termRef.current = term
      fitRef.current = fit

      // 欢迎信息
      term.write(`${COLOR.bold}${COLOR.cyan}RTT Viewer${COLOR.reset}\r\n`)
      term.write(`${COLOR.dim}等待启动 RTT 会话...${COLOR.reset}\r\n`)

      // 复制支持
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
          const selection = term.getSelection()
          if (selection) {
            navigator.clipboard.writeText(selection).catch(() => {})
            event.preventDefault()
            return false
          }
        }
        return true
      })

      // 响应式调整
      const fitNow = () => { try { fit.fit() } catch { /* ignore */ } }
      requestAnimationFrame(() => { fitNow(); setTimeout(fitNow, 100) })

      const ro = new ResizeObserver(fitNow)
      ro.observe(containerRef.current)
      window.addEventListener('resize', fitNow)

      return () => {
        ro.disconnect()
        window.removeEventListener('resize', fitNow)
        term.dispose()
        termRef.current = null
        fitRef.current = null
      }
    }, [])

    // 运行状态变化时显示提示
    const isFirstMount = useRef(true)
    useEffect(() => {
      const term = termRef.current
      if (!term) return
      if (isFirstMount.current) {
        isFirstMount.current = false
        return
      }
      if (running) {
        term.write(`\r\n${COLOR.green}[RTT 已启动]${COLOR.reset}\r\n`)
      } else {
        term.write(`\r\n${COLOR.yellow}[RTT 已停止]${COLOR.reset}\r\n`)
      }
    }, [running])

    // 订阅 WebSocket 事件
    useEffect(() => {
      // rtt.data: 接收数据
      const unsubData = wsClient.on('rtt.data', (data: unknown) => {
        const payload = data as { uid: string; channel: number; data: string; size: number }
        if (payload.uid !== uidRef.current) return
        if (payload.channel !== selectedUpChannelRef.current) return

        const term = termRef.current
        if (!term) return

        // 解码 base64
        const binary = atob(payload.data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }

        // 保存到缓冲
        dataBufferRef.current.push(bytes)
        // 限制缓冲大小（~10MB）
        const totalSize = dataBufferRef.current.reduce((s, b) => s + b.length, 0)
        if (totalSize > 10 * 1024 * 1024) {
          dataBufferRef.current.shift()
        }

        addBytesReceived(bytes.length)

        // 写入终端
        if (displayModeRef.current === 'hex') {
          term.write(formatHexDump(bytes))
        } else {
          // 文本模式：直接写入 UTF-8 文本
          const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
          term.write(text)
        }
      })

      // rtt.error: 错误
      const unsubError = wsClient.on('rtt.error', (data: unknown) => {
        const payload = data as { uid: string; error: string }
        if (payload.uid !== uidRef.current) return
        const term = termRef.current
        if (!term) return
        term.write(`\r\n${COLOR.red}[RTT 错误] ${payload.error}${COLOR.reset}\r\n`)
      })

      return () => {
        unsubData()
        unsubError()
      }
    }, [addBytesReceived])

    // 显示模式切换时显示提示
    const prevMode = useRef(displayMode)
    useEffect(() => {
      if (prevMode.current !== displayMode) {
        prevMode.current = displayMode
        const term = termRef.current
        if (term) {
          term.write(`\r\n${COLOR.dim}[显示模式: ${displayMode === 'text' ? '文本' : '十六进制'}]${COLOR.reset}\r\n`)
        }
      }
    }, [displayMode])

    return <div ref={containerRef} className="h-full w-full overflow-hidden" />
  }
)
