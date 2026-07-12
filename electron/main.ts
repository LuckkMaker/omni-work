import { app, BrowserWindow, ipcMain, shell } from 'electron'
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
    title: 'DAPLink Work',
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
