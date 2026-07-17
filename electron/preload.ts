import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  /** 获取 Python 后端服务端口 */
  getPythonPort: (): Promise<number | null> => ipcRenderer.invoke('python:get-port'),

  /** 获取 Python 后端状态 */
  getPythonStatus: (): Promise<{ running: boolean; port: number | null }> =>
    ipcRenderer.invoke('python:status'),

  /** 打开文件选择对话框，返回选中文件路径或 null */
  openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-file'),

  /** 保存文件对话框，返回保存路径或 null */
  saveFileDialog: (defaultName?: string): Promise<string | null> => ipcRenderer.invoke('dialog:save-file', defaultName),

  /** 从拖拽的 File 对象获取文件路径（Electron 32+ context isolation 下 file.path 不可用） */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
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
