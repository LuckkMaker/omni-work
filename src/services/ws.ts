import type { WsEvent } from '@shared/types'

type EventHandler = (data: unknown) => void

/**
 * WebSocket 客户端，管理与 Python 后端的实时通信。
 * 支持自动重连、事件订阅、心跳检测。
 */
class WsClient {
  private ws: WebSocket | null = null
  private url: string | null = null
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 2000
  private manualClose = false

  /** 连接 WebSocket */
  async connect(port: number): Promise<void> {
    this.url = `ws://127.0.0.1:${port}/ws`
    this.manualClose = false
    this._createSocket()
  }

  private _createSocket(): void {
    if (!this.url) return

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this._startPing()
    }

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg: WsEvent = JSON.parse(ev.data as string)
        this._dispatch(msg.event, msg.data)
      } catch {
        // 忽略非 JSON 消息
      }
    }

    this.ws.onclose = () => {
      this._stopPing()
      if (!this.manualClose) {
        this._scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this._createSocket()
    }, this.reconnectDelay)
  }

  private _startPing(): void {
    this._stopPing()
    this.pingTimer = setInterval(() => {
      this.send({ action: 'ping' })
    }, 30000)
  }

  private _stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  /** 发送消息到后端 */
  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  /** 订阅事件 */
  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  /** 取消订阅 */
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler)
  }

  private _dispatch(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(data)
      } catch (err) {
        console.error(`[WS] handler error for "${event}":`, err)
      }
    })
  }

  /** 主动关闭连接 */
  disconnect(): void {
    this.manualClose = true
    this._stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  /** 连接是否已建立 */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const wsClient = new WsClient()
