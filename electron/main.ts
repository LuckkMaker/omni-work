import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { PythonBridge } from './python-bridge'

let mainWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Luckk Work',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function startPythonBackend(): Promise<void> {
  pythonBridge = new PythonBridge()
  try {
    const port = await pythonBridge.start()
    console.log(`[Python Backend] started on port ${port}`)
  } catch (err) {
    console.error('[Python Backend] failed to start:', err)
  }
}

app.whenReady().then(async () => {
  await startPythonBackend()

  // IPC: 获取 Python 后端端口
  ipcMain.handle('python:get-port', () => {
    return pythonBridge?.getPort() ?? null
  })

  // IPC: Python 后端状态
  ipcMain.handle('python:status', () => {
    return pythonBridge?.getStatus() ?? { running: false, port: null }
  })

  // IPC: 打开文件选择对话框
  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择固件文件',
      filters: [
        { name: '固件文件', extensions: ['bin', 'hex', 'elf', 'axf'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // IPC: 保存文件对话框
  ipcMain.handle('dialog:save-file', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '保存文件',
      defaultPath: defaultName || 'flash_dump.bin',
      filters: [
        { name: '二进制文件', extensions: ['bin'] },
        { name: 'Intel HEX', extensions: ['hex'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (result.canceled) return null
    return result.filePath
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  pythonBridge?.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  pythonBridge?.stop()
})
