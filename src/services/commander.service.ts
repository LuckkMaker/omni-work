import { api } from './api'

/** Commander 命令执行结果 */
export interface CommandResult {
  success: boolean
  output: string
  error: string | null
  command: string
}

/** Commander 命令帮助信息 */
export interface CommandInfo {
  name: string
  aliases: string[]
  category: string
  usage: string
  help: string
  extra_help: string
}

/** 执行一条 Commander 命令 */
export async function execCommand(uid: string, command: string): Promise<CommandResult> {
  const client = await api()
  const { data } = await client.post(
    `/api/probes/${uid}/commander/exec`,
    { command },
    { timeout: 0 }
  )
  return data as CommandResult
}

/** 获取探针可用的所有命令及帮助 */
export async function listCommands(uid: string): Promise<CommandInfo[]> {
  const client = await api()
  const { data } = await client.get(`/api/probes/${uid}/commander/commands`)
  return data.commands as CommandInfo[]
}

/** 获取所有命令（不依赖探针连接） */
export async function listAllCommands(): Promise<CommandInfo[]> {
  const client = await api()
  const { data } = await client.get(`/api/commander/commands`)
  return data.commands as CommandInfo[]
}

/** 重置探针的命令上下文（目标切换后调用） */
export async function resetContext(uid: string): Promise<void> {
  const client = await api()
  await client.post(`/api/probes/${uid}/commander/reset`)
}
