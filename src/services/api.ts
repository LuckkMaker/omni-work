import axios, { AxiosInstance } from 'axios'

/**
 * HTTP 客户端，用于与 Python FastAPI 后端通信。
 * 端口由 Electron 主进程动态分配，通过 IPC 获取。
 */
let baseURL: string | null = null
let client: AxiosInstance | null = null

async function getBaseURL(): Promise<string> {
  if (baseURL) return baseURL

  const port = window.electron ? await window.electron.getPythonPort() : null
  if (!port) {
    // 后端尚未就绪，不缓存，抛异常让调用方在 status 就绪后重试
    throw new Error('Python backend not ready (port unknown)')
  }

  baseURL = `http://127.0.0.1:${port}`
  return baseURL
}

export async function api(): Promise<AxiosInstance> {
  if (client) return client
  const url = await getBaseURL()
  client = axios.create({
    baseURL: url,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
  })
  return client
}

/**
 * 重置客户端（Python 后端重启后需要重新获取端口）
 */
export function resetApiClient(): void {
  baseURL = null
  client = null
}
