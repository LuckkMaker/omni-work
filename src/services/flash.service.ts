import { api } from './api'
import type { FlashResult } from '@shared/types'

/** 擦除 Flash */
export async function eraseFlash(
  uid: string,
  type: 'chip' | 'sector' = 'chip',
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

/** 烧录固件 */
export async function programFlash(
  uid: string,
  filePath: string,
  verify = true,
  reset = true
): Promise<FlashResult> {
  const client = await api()
  const { data } = await client.post(`/api/probes/${uid}/flash/program`, {
    file_path: filePath,
    verify,
    reset,
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
