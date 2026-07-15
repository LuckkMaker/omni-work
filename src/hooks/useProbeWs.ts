import { useEffect, useRef } from 'react'
import { wsClient } from '@/services/ws'
import { useProbeStore } from '@/stores/probe.store'
import type {
  ProbeListData,
  ProbeConnectedData,
  ProbeDisconnectedData,
} from '@shared/types'

/**
 * 绑定 WebSocket 事件到 probe store。
 * 在后端就绪后自动连接 WebSocket，订阅仿真器相关事件。
 * 支持 port 变化时自动重连（后端重启场景）。
 */
export function useProbeWs(port: number | null): void {
  const connectedPort = useRef<number | null>(null)

  useEffect(() => {
    if (!port || connectedPort.current === port) return

    // 如果之前连接了不同端口，先断开
    if (connectedPort.current !== null) {
      wsClient.disconnect()
    }
    connectedPort.current = port

    const store = useProbeStore.getState()

    // 连接 WebSocket
    wsClient.connect(port)

    // 订阅仿真器列表更新
    const unsubList = wsClient.on('probe.list', (data) => {
      const d = data as ProbeListData
      store.onProbeList(d.probes)
    })

    // 订阅仿真器已连接
    const unsubConnected = wsClient.on('probe.connected', (data) => {
      const d = data as ProbeConnectedData
      store.onProbeConnected(d.uid, d.target ?? null)
    })

    // 订阅仿真器已断开
    const unsubDisconnected = wsClient.on('probe.disconnected', (data) => {
      const d = data as ProbeDisconnectedData
      store.onProbeDisconnected(d.uid)
    })

    // 订阅仿真器热插拔 — 刷新仿真器列表
    const unsubAdded = wsClient.on('probe.added', () => {
      store.fetchProbes()
    })
    const unsubRemoved = wsClient.on('probe.removed', () => {
      store.fetchProbes()
    })

    // 注意：不在 cleanup 中 disconnect，由 port 变化或组件卸载时处理
    return () => {
      unsubList()
      unsubConnected()
      unsubDisconnected()
      unsubAdded()
      unsubRemoved()
    }
  }, [port])
}
