import { api } from './api'
import type { FirmwareFileInfo } from '@shared/types'

/** 文件读取结果（含 base64 二进制数据） */
export interface FileReadResult {
  format: string
  base_address: number
  data: string
  size: number
}

/** 解析固件文件，返回格式/大小/段信息 */
export async function parseFile(filePath: string): Promise<FirmwareFileInfo> {
  const client = await api()
  const { data } = await client.post('/api/files/parse', { file_path: filePath })
  return data as FirmwareFileInfo
}

/** 读取固件文件数据，返回 base64 编码的二进制数据和地址段 */
export async function readFile(filePath: string, baseAddress?: number): Promise<FileReadResult> {
  const client = await api()
  const { data } = await client.post('/api/files/read', {
    file_path: filePath,
    base_address: baseAddress,
  })
  return data as FileReadResult
}
