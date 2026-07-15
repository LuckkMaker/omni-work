import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

interface PythonStatus {
  running: boolean
  port: number | null
}

/**
 * 管理 Python 后端子进程的生命周期。
 *
 * 启动流程：
 * 1. spawn Python 子进程运行 server.py
 * 2. Python 后端输出首行 JSON {"port": 12345} 表示就绪
 * 3. Electron 读取端口并通过 IPC 暴露给渲染进程
 */
export class PythonBridge {
  private proc: ChildProcess | null = null
  private port: number | null = null
  private ready: Promise<number> | null = null

  getPort(): number | null {
    return this.port
  }

  getStatus(): PythonStatus {
    return {
      running: this.proc !== null && !this.proc.killed && this.port !== null,
      port: this.port
    }
  }

  /**
   * 启动 Python 后端，返回监听端口。
   * 如果已经在运行，直接返回已知端口。
   */
  start(): Promise<number> {
    if (this.port) return Promise.resolve(this.port)
    if (this.ready) return this.ready

    this.ready = new Promise<number>((resolve, reject) => {
      const isDev = !!process.env.ELECTRON_RENDERER_URL
      const pythonExe = this.findPython()
      const scriptPath = this.findScript()

      if (!pythonExe) {
        reject(new Error('Python not found. Please ensure Python is installed and in PATH.'))
        return
      }

      if (!scriptPath) {
        reject(new Error('server.py not found.'))
        return
      }

      // 开发模式下使用固定端口 8765，生产模式用 0（自动分配）
      const portArg = isDev ? '8765' : '0'

      this.proc = spawn(pythonExe, [scriptPath, '--port', portArg], {
        cwd: join(scriptPath, '..'),
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        windowsHide: true
      })

      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error('Python backend startup timeout (30s)'))
        }
      }, 30000)

      this.proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString().trim()
        if (!resolved && text.startsWith('{')) {
          // 首行 JSON 包含端口信息
          try {
            const info = JSON.parse(text)
            if (info.port) {
              resolved = true
              this.port = info.port
              clearTimeout(timeout)
              resolve(info.port)
              return
            }
          } catch {
            // 非 JSON，当作普通日志处理
          }
        }
        // 后续日志转发到主进程控制台
        console.log(`[Python] ${text}`)
      })

      this.proc.stderr?.on('data', (data: Buffer) => {
        console.error(`[Python:ERR] ${data.toString().trim()}`)
      })

      this.proc.on('error', (err) => {
        console.error('[Python] process error:', err)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          reject(err)
        }
      })

      this.proc.on('exit', (code) => {
        console.log(`[Python] process exited with code ${code}`)
        this.proc = null
        this.port = null
        this.ready = null
      })
    })

    return this.ready
  }

  /** 停止 Python 后端 */
  stop(): void {
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
      this.port = null
      this.ready = null
    }
  }

  private findPython(): string | null {
    // 优先使用项目虚拟环境
    const venvPython = join(process.cwd(), '.venv', 'Scripts', 'python.exe')
    if (existsSync(venvPython)) return venvPython

    // 生产环境：PyInstaller 产物
    const bundledPython = join(process.resourcesPath, 'python', 'python.exe')
    if (existsSync(bundledPython)) return bundledPython

    // 系统 Python
    return 'python'
  }

  private findScript(): string | null {
    const devPath = join(process.cwd(), 'python', 'server.py')
    if (existsSync(devPath)) return devPath

    const prodPath = join(process.resourcesPath, 'python', 'server.py')
    if (existsSync(prodPath)) return prodPath

    return null
  }
}
