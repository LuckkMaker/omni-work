import { api } from './api'
import type { FirmwareFileInfo } from '@shared/types'

/** 解析固件文件，返回格式/大小/段信息 */
export async function parseFile(filePath: string): Promise<FirmwareFileInfo> {
  const client = await api()
  const { data } = await client.post('/api/files/parse', { file_path: filePath })
  return data as FirmwareFileInfo
}
