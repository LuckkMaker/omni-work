import { api } from './api'
import type { PackInfo } from '@shared/types'

/** 列出已安装的 CMSIS-Pack */
export async function listPacks(): Promise<PackInfo[]> {
  const client = await api()
  const { data } = await client.get('/api/packs')
  return data as PackInfo[]
}

/** 导入 CMSIS-Pack 文件 */
export async function importPack(path: string): Promise<{
  pack: PackInfo
  devices: unknown[]
  device_count: number
}> {
  const client = await api()
  const { data } = await client.post('/api/packs/import', { path })
  return data
}

/** 卸载 CMSIS-Pack */
export async function removePack(packName: string): Promise<void> {
  const client = await api()
  await client.delete(`/api/packs/${packName}`)
}
