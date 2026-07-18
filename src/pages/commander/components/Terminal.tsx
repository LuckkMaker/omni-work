import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useCommanderStore } from '@/stores/commander.store'

/** 终端对外暴露的命令 API（供父组件通过 ref 调用） */
export interface TerminalApi {
  /** 立即执行一条命令（显示回显 + 执行 + 输出结果） */
  runCommand: (cmd: string) => void
  /** 在当前光标位置插入文本（不执行，等用户按 Enter） */
  insertText: (text: string) => void
  /** 清屏 */
  clear: () => void
}

interface TerminalProps {
  uid: string | null
  connected: boolean
  /** 父组件创建的 ref，Terminal 会将 API 写入此 ref */
  apiRef: React.MutableRefObject<TerminalApi | null>
}

// ANSI 颜色码
const COLOR = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
}

const PROMPT = `${COLOR.green}pyocd${COLOR.reset}> `
const PROMPT_VISIBLE_LEN = 7 // "pyocd> " 可见长度

export function Terminal({ uid, connected, apiRef }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)

  // 输入缓冲与历史导航状态（用 ref 避免 re-render）
  const inputBuf = useRef('')
  const cursorPos = useRef(0)
  const historyIndex = useRef(-1) // -1 = 当前输入，0+ = 历史浏览
  const savedInput = useRef('') // 浏览历史时保存的当前输入

  // uid/running 同步到 ref（供 onData 闭包访问最新值）
  const uidRef = useRef<string | null>(uid)
  uidRef.current = uid

  const execute = useCommanderStore((s) => s.execute)
  const getHistory = useCommanderStore((s) => s.getHistory)
  const runningCommand = useCommanderStore((s) => s.runningCommand)
  const runningRef = useRef(runningCommand)
  runningRef.current = runningCommand

  /** 重绘当前输入行（清除当前行并重写，光标回到正确位置） */
  const redrawInputLine = useCallback(() => {
    const term = termRef.current
    if (!term) return
    term.write('\r\x1b[2K')
    term.write(PROMPT + inputBuf.current)
    const targetCol = PROMPT_VISIBLE_LEN + cursorPos.current
    const currentCol = PROMPT_VISIBLE_LEN + inputBuf.current.length
    if (targetCol < currentCol) {
      term.write(`\x1b[${currentCol - targetCol}D`)
    }
  }, [])

  /** 执行命令并显示结果
   * @param cmd 命令字符串
   * @param echo 是否显示命令回显（侧边栏点击时为 true，Enter 键为 false）
   */
  const runCommand = useCallback(
    async (cmd: string, echo: boolean) => {
      const term = termRef.current
      if (!term) return

      // 清除当前输入行，换行
      if (inputBuf.current || echo) {
        term.write('\r\n')
      }
      if (echo && cmd) {
        term.write(`${COLOR.dim}${cmd}${COLOR.reset}\r\n`)
      }
      inputBuf.current = ''
      cursorPos.current = 0
      historyIndex.current = -1

      if (!cmd.trim()) {
        term.write(PROMPT)
        return
      }

      if (!uidRef.current) {
        term.write(`${COLOR.red}Error: No probe selected${COLOR.reset}\r\n`)
        term.write(PROMPT)
        return
      }

      const result = await execute(uidRef.current, cmd)

      if (result.output) {
        term.write(result.output)
        if (!result.output.endsWith('\n')) {
          term.write('\r\n')
        }
      }

      if (!result.success && result.error) {
        term.write(`${COLOR.red}Error: ${result.error}${COLOR.reset}\r\n`)
      }

      term.write(PROMPT)
    },
    [execute]
  )

  /** 在当前光标位置插入文本（不执行） */
  const insertText = useCallback(
    (text: string) => {
      if (runningRef.current) return
      inputBuf.current =
        inputBuf.current.slice(0, cursorPos.current) +
        text +
        inputBuf.current.slice(cursorPos.current)
      cursorPos.current += text.length
      redrawInputLine()
    },
    [redrawInputLine]
  )

  /** 清屏 */
  const clearScreen = useCallback(() => {
    const term = termRef.current
    if (!term) return
    term.clear()
    term.write(PROMPT + inputBuf.current)
  }, [])

  // 暴露 API 给父组件
  useEffect(() => {
    apiRef.current = {
      runCommand: (cmd: string) => void runCommand(cmd, true),
      insertText,
      clear: clearScreen,
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, runCommand, insertText, clearScreen])

  // 初始化终端（仅挂载时）
  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
      convertEol: true,
      scrollback: 10000,
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

    // 欢迎信息
    term.write(`${COLOR.bold}${COLOR.cyan}DAPLink Work Commander${COLOR.reset}\r\n`)
    term.write(`${COLOR.dim}Type 'help' for command list, Ctrl+L to clear${COLOR.reset}\r\n`)
    term.write(PROMPT)

    // 延迟 fit：等待 flex 布局计算完成，避免列数过少导致换行
    const fitNow = () => {
      try {
        fit.fit()
      } catch {
        // 容器未就绪时忽略
      }
    }
    requestAnimationFrame(() => {
      fitNow()
      // 二次 fit：某些场景下首帧后容器才获得最终尺寸
      setTimeout(fitNow, 100)
    })

    // 输入处理
    term.onData((data) => {
      if (runningRef.current) return
      const t = termRef.current
      if (!t) return

      for (const ch of data) {
        switch (ch) {
          case '\r': {
            // Enter：执行命令（echo=false，用户已自行输入）
            const cmd = inputBuf.current
            void runCommand(cmd, false)
            break
          }
          case '\x7f': {
            // Backspace
            if (cursorPos.current > 0) {
              inputBuf.current =
                inputBuf.current.slice(0, cursorPos.current - 1) +
                inputBuf.current.slice(cursorPos.current)
              cursorPos.current--
              redrawInputLine()
            }
            break
          }
          case '\x1b[A': {
            // Arrow Up：历史上一条
            const cmd = getHistory(historyIndex.current + 1)
            if (cmd !== undefined) {
              if (historyIndex.current === -1) {
                savedInput.current = inputBuf.current
              }
              historyIndex.current++
              inputBuf.current = cmd
              cursorPos.current = cmd.length
              redrawInputLine()
            }
            break
          }
          case '\x1b[B': {
            // Arrow Down：历史下一条
            if (historyIndex.current > 0) {
              historyIndex.current--
              const cmd = getHistory(historyIndex.current)
              if (cmd !== undefined) {
                inputBuf.current = cmd
                cursorPos.current = cmd.length
              }
            } else if (historyIndex.current === 0) {
              historyIndex.current = -1
              inputBuf.current = savedInput.current
              cursorPos.current = savedInput.current.length
            }
            redrawInputLine()
            break
          }
          case '\x1b[C': {
            // Arrow Right
            if (cursorPos.current < inputBuf.current.length) {
              cursorPos.current++
              t.write('\x1b[C')
            }
            break
          }
          case '\x1b[D': {
            // Arrow Left
            if (cursorPos.current > 0) {
              cursorPos.current--
              t.write('\x1b[D')
            }
            break
          }
          case '\x03': {
            // Ctrl+C：取消当前输入行
            t.write('^C\r\n')
            inputBuf.current = ''
            cursorPos.current = 0
            historyIndex.current = -1
            t.write(PROMPT)
            break
          }
          case '\x0c': {
            // Ctrl+L：清屏
            t.clear()
            t.write(PROMPT + inputBuf.current)
            break
          }
          case '\x15': {
            // Ctrl+U：删除整行
            inputBuf.current = ''
            cursorPos.current = 0
            redrawInputLine()
            break
          }
          case '\x01': {
            // Ctrl+A：行首
            cursorPos.current = 0
            redrawInputLine()
            break
          }
          case '\x05': {
            // Ctrl+E：行尾
            cursorPos.current = inputBuf.current.length
            redrawInputLine()
            break
          }
          default: {
            // 可打印字符
            if (ch >= ' ' || ch === '\t') {
              inputBuf.current =
                inputBuf.current.slice(0, cursorPos.current) +
                ch +
                inputBuf.current.slice(cursorPos.current)
              cursorPos.current++
              redrawInputLine()
            }
          }
        }
      }
    })

    // 响应式调整
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // 容器未就绪时忽略
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 连接状态变化时显示提示
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    if (!connected) {
      term.write(`\r\n${COLOR.yellow}[Probe disconnected]${COLOR.reset}\r\n`)
      term.write(PROMPT)
      inputBuf.current = ''
      cursorPos.current = 0
    }
  }, [connected])

  return <div ref={containerRef} className="h-full w-full" />
}
