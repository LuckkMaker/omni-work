import { api } from './api'

/** 列出所有支持的 MCU 型号 */
export async function listTargets(): Promise<string[]> {
  const client = await api()
  const { data } = await client.get('/api/targets')
  return data.targets as string[]
}
