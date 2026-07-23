import { api } from './api'
import type { PackInfo, PackDevice } from '@shared/types'

/** 列出已安装的 CMSIS-Pack */
export async function listPacks(): Promise<PackInfo[]> {
  const client = await api()
  const { data } = await client.get('/api/packs')
  return data as PackInfo[]
}

/** 预览 Pack 中的设备列表（不导入） */
export async function previewPack(path: string): Promise<{ devices: PackDevice[]; device_count: number }> {
  const client = await api()
  const { data } = await client.post('/api/packs/preview', { path })
  return data
}

/** 导入 CMSIS-Pack 文件（可选择部分设备） */
export async function importPack(
  path: string,
  selectedParts?: string[]
): Promise<{
  pack: PackInfo
  devices: PackDevice[]
  device_count: number
}> {
  const client = await api()
  const { data } = await client.post('/api/packs/import', {
    path,
    selected_parts: selectedParts,
  })
  return data
}

/** 获取已安装 Pack 的设备列表（含当前导入状态） */
export async function getPackDevices(packName: string): Promise<{ pack: PackInfo; devices: PackDevice[] }> {
  const client = await api()
  const { data } = await client.get(`/api/packs/${encodeURIComponent(packName)}/devices`)
  return data
}

/** 更新 Pack 的设备选择 */
export async function updatePackDevices(
  packName: string,
  selectedParts: string[]
): Promise<{ added: string[]; removed: string[]; device_count: number }> {
  const client = await api()
  const { data } = await client.put(`/api/packs/${encodeURIComponent(packName)}/devices`, {
    selected_parts: selectedParts,
  })
  return data
}

/** 卸载 CMSIS-Pack */
export async function removePack(packName: string): Promise<void> {
  const client = await api()
  await client.delete(`/api/packs/${encodeURIComponent(packName)}`)
}
