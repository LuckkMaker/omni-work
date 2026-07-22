import { api } from './api'
import type { SourceSummary } from '@shared/types'

/** /api/system/info 返回的系统信息 */
export interface SystemInfo {
  /** 前端应用版本号（来自 package.json，后端原样回传） */
  app_version: string
  /** Python 后端版本号 */
  backend_version: string
  /** Python 解释器版本 */
  python_version: string
  /** 运行平台，如 windows/linux/darwin */
  platform: string
  /** 设备目录 schema 版本 */
  db_version: string
  /** 设备目录文件绝对路径 */
  db_path: string
  /** pyOCD 库版本 */
  pyocd_version: string
  /** 设备来源统计 */
  source_summary?: SourceSummary
}

/** System API 服务 */
export const systemService = {
  /** 获取系统信息（应用/后端/Python/数据库/pyOCD 版本等） */
  async getInfo(): Promise<SystemInfo> {
    const client = await api()
    const { data } = await client.get<SystemInfo>('/api/system/info')
    return data
  },
}
