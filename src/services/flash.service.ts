import { api } from './api'
import type { FlashResult } from '@shared/types'

/** 擦除 Flash */
export async function eraseFlash(
  uid: string,
  type: 'chip' | 'sector' | 'sector_range' = 'chip',
  address = 0,
  size = 0
): Promise<FlashResult> {
  const client = await api()
  const { data } = await client.post(`/api/probes/${uid}/flash/erase`, {
    type,
    address,
    size,
  })
  return data as FlashResult
}

/** 编程固件 */
export async function programFlash(
  uid: string,
  filePath: string,
  verify = true,
  reset = true,
  baseAddress?: number
): Promise<FlashResult> {
  const client = await api()
  const { data } = await client.post(`/api/probes/${uid}/flash/program`, {
    file_path: filePath,
    verify,
    reset,
    base_address: baseAddress,
  })
  return data as FlashResult
}

/** 校验 Flash 内容 */
export async function verifyFlash(uid: string, filePath: string): Promise<FlashResult> {
  const client = await api()
  const { data } = await client.post(`/api/probes/${uid}/flash/verify`, {
    file_path: filePath,
  })
  return data as FlashResult
}

/** 检查 Flash 是否为空白 */
export async function checkBlank(
  uid: string,
  address?: number,
  size?: number
): Promise<{
  success: boolean
  is_blank?: boolean
  blank_bytes?: number
  total_bytes?: number
  first_nonblank_addr?: number | null
  error?: string
  duration_ms?: number
}> {
  const client = await api()
  const { data } = await client.post(`/api/probes/${uid}/flash/blank-check`, {
    address,
    size,
  }, { timeout: 0 })
  return data
}

/** 读回 Flash 内容（返回 base64 数据） */
export async function readBack(
  uid: string,
  type: 'chip' | 'range',
  address = 0,
  size = 0
): Promise<{
  success: boolean
  base64_data?: string
  base_address?: number
  bytes_read?: number
  error?: string
  duration_ms?: number
}> {
  const client = await api()
  const { data } = await client.post(`/api/probes/${uid}/flash/read`, {
    type,
    address,
    size,
    output_path: '',
  }, { timeout: 0 })
  return data
}

/** 复位目标 */
export async function resetTarget(
  uid: string,
  type: 'hw' | 'sw' = 'hw',
  run = true
): Promise<{ success: boolean }> {
  const client = await api()
  const { data } = await client.post(`/api/probes/${uid}/reset`, { type, run })
  return data
}

/** 取消正在进行的 Flash 操作 */
export async function cancelOperation(uid: string): Promise<{ success: boolean }> {
  const client = await api()
  const { data } = await client.post(`/api/probes/${uid}/flash/cancel`)
  return data
}
