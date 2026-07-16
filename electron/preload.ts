import { contextBridge, ipcRenderer } from 'electron'

const api = {
  /** 获取 Python 后端服务端口 */
  getPythonPort: (): Promise<number | null> => ipcRenderer.invoke('python:get-port'),

  /** 获取 Python 后端状态 */
  getPythonStatus: (): Promise<{ running: boolean; port: number | null }> =>
    ipcRenderer.invoke('python:status'),

  /** 打开文件选择对话框，返回选中文件路径或 null */
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-file'),
}

export type ElectronAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = api
}
