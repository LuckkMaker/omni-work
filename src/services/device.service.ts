import { api } from './api'
import type { DeviceInfo } from '@shared/types'

/** 获取完整设备目录 */
export async function listDevices(): Promise<DeviceInfo[]> {
  const client = await api()
  const { data } = await client.get('/api/devices')
  return data.devices as DeviceInfo[]
}

/** 获取指定设备信息 */
export async function getDevice(partNumber: string): Promise<DeviceInfo> {
  const client = await api()
  const { data } = await client.get(`/api/devices/${partNumber}`)
  return data as DeviceInfo
}
