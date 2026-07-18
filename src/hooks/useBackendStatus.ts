import { useEffect, useState } from 'react'

/**
 * 获取 Python 后端运行状态和端口。
 * 通过 Electron preload 暴露的 IPC API 获取。
 */
export function useBackendStatus() {
  const [status, setStatus] = useState<boolean>(false)
  const [port, setPort] = useState<number | null>(null)

  useEffect(() => {
    const check = async () => {
      if (window.electron) {
        const s = await window.electron.getPythonStatus()
        setStatus(s.running)
        setPort(s.port)
      }
    }
    check()
    const timer = setInterval(check, 3000)
    return () => clearInterval(timer)
  }, [])

  return { status, port }
}
