import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { wsClient } from '@/services/ws'
import { useRttStore } from '@/stores/rtt.store'
import { useUiStore } from '@/stores/ui.store'

/** 终端对外暴露的 API */
export interface RttTerminalApi {
  /** 清屏 */
  clear: () => void
  /** 获取当前 Tab 所有接收到的原始数据（用于保存到文件） */
  getData: () => Uint8Array
  /** 清空当前 Tab 的数据缓冲 */
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
  /** Tab ID（用于从 store 读取对应 Tab 的数据） */
  tabId: string
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
  function RttTerminal({ uid, running, tabId }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<XTerm | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const fontSize = useRef(13)

    // 已写入终端的数据缓冲长度（用于增量写入）
    const writtenBufferCountRef = useRef(0)
    const writtenBytesRef = useRef(0)

    // 同步 store 状态
    const displayMode = useRttStore((s) => s.displayMode)
    const displayModeRef = useRef(displayMode)
    displayModeRef.current = displayMode

    // 当前 Tab 的数据缓冲（订阅更新）
    const tabDataBuffer = useRttStore((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      return tab ? tab.dataBuffer : []
    })
    const uidRef = useRef<string | null>(uid)
    uidRef.current = uid

    // 暴露 API
    useImperativeHandle(ref, () => ({
      clear: () => {
        termRef.current?.clear()
      },
      getData: () => useRttStore.getState().getTabData(tabId),
      clearData: () => {
        useRttStore.getState().clearTabData(tabId)
        writtenBufferCountRef.current = 0
        writtenBytesRef.current = 0
        termRef.current?.clear()
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
    }), [tabId])

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
        theme: useUiStore.getState().terminalTheme.theme,
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

    // 响应终端主题切换
    const terminalTheme = useUiStore((s) => s.terminalTheme)
    useEffect(() => {
      if (termRef.current) {
        termRef.current.options.theme = terminalTheme.theme
      }
    }, [terminalTheme])

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

    // 增量写入：当 tabDataBuffer 增加新数据时，写入终端
    useEffect(() => {
      const term = termRef.current
      if (!term) return

      // 从上次写入位置开始，写入新增的缓冲块
      while (writtenBufferCountRef.current < tabDataBuffer.length) {
        const buf = tabDataBuffer[writtenBufferCountRef.current]
        if (displayModeRef.current === 'hex') {
          term.write(formatHexDump(buf, writtenBytesRef.current))
        } else {
          const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
          term.write(text)
        }
        writtenBytesRef.current += buf.length
        writtenBufferCountRef.current++
      }
    }, [tabDataBuffer])

    // rtt.error 错误提示（全局错误仍显示）
    useEffect(() => {
      const unsubError = wsClient.on('rtt.error', (data: unknown) => {
        const payload = data as { uid: string; error: string }
        if (payload.uid !== uidRef.current) return
        const term = termRef.current
        if (!term) return
        term.write(`\r\n${COLOR.red}[RTT 错误] ${payload.error}${COLOR.reset}\r\n`)
      })
      return unsubError
    }, [])

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

    // Tab 切换或清空时重置写入位置
    useEffect(() => {
      writtenBufferCountRef.current = 0
      writtenBytesRef.current = 0
      termRef.current?.clear()
    }, [tabId])

    return <div ref={containerRef} className="h-full w-full overflow-hidden" />
  }
)
