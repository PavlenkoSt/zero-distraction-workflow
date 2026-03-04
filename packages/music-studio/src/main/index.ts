import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 680,
    height: 700,
    minWidth: 560,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Packaged Electron apps start with a minimal PATH that omits Homebrew/macports dirs.
// Augment it so child processes (Python MCP server → ffmpeg) can find system binaries.
const EXTRA_PATHS = ['/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin', '/usr/bin', '/bin']
const existingParts = new Set((process.env.PATH ?? '').split(':'))
const missing = EXTRA_PATHS.filter(p => !existingParts.has(p))
if (missing.length) process.env.PATH = [...missing, process.env.PATH ?? ''].join(':')

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'])
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

ipcMain.handle('scan-folder', async (_event, folderPath: string) => {
  const entries = fs.readdirSync(folderPath)
  const audioFiles = entries.filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))
  const imageFile = entries.find((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase())) ?? null
  return {
    folderPath,
    trackCount: audioFiles.length,
    hasImage: imageFile !== null,
    audioFiles,
    imageFile
  }
})

ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (canceled) return null
  return filePaths[0]
})

ipcMain.handle('get-default-output-path', async () => {
  return path.join(os.homedir(), 'Desktop', 'zero-distraction-workflow', 'generated-video')
})

ipcMain.handle('open-path', async (_event, filePath: string) => {
  await shell.openPath(filePath)
})

ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url)
})

async function callMcpTool(
  command: string,
  args: string[],
  cwd: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  timeoutMs = 90 * 60 * 1000
): Promise<string> {
  const client = new Client({ name: 'music-studio', version: '1.0.0' })
  const transport = new StdioClientTransport({ command, args, cwd })
  await client.connect(transport)
  try {
    const result = await client.callTool({ name: toolName, arguments: toolArgs }, undefined, {
      timeout: timeoutMs
    })
    const content = result.content as Array<{ type: string; text: string }>
    return content.map((c) => c.text).join('\n')
  } finally {
    await client.close()
  }
}

const VIDEO_CREATOR_DIR = '/Users/stanislavpavlenko/Desktop/zero-distraction-workflow/packages/music-video-creator'
const VIDEO_CREATOR_PYTHON = `${VIDEO_CREATOR_DIR}/.venv/bin/python`
const VIDEO_CREATOR_SCRIPT = `${VIDEO_CREATOR_DIR}/server.py`

let activeGenerateClient: Client | null = null

ipcMain.handle('cancel-generate', async () => {
  if (activeGenerateClient) {
    await activeGenerateClient.close().catch(() => {})
    activeGenerateClient = null
  }
})

ipcMain.handle('generate-video', async (_event, folderPath: string, outputPath: string) => {
  fs.mkdirSync(outputPath, { recursive: true })

  const client = new Client({ name: 'music-studio', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: VIDEO_CREATOR_PYTHON,
    args: [VIDEO_CREATOR_SCRIPT],
    cwd: VIDEO_CREATOR_DIR
  })
  activeGenerateClient = client
  await client.connect(transport)

  let text: string
  try {
    const result = await client.callTool(
      {
        name: 'create_music_video',
        arguments: { folder_path: folderPath, output_path: outputPath }
      },
      undefined,
      { timeout: 90 * 60 * 1000 }
    )
    const content = result.content as Array<{ type: string; text: string }>
    text = content.map((c) => c.text).join('\n')
  } finally {
    activeGenerateClient = null
    await client.close().catch(() => {})
  }

  const videoPath = text.match(/- Video: (.+)/)?.[1]?.trim() ?? ''
  const csvPath = text.match(/- CSV: (.+)/)?.[1]?.trim() ?? ''
  const duration = text.match(/- Duration: (.+)/)?.[1]?.trim() ?? ''
  const trackCount = parseInt(text.match(/- Tracks: (\d+)/)?.[1] ?? '0')

  if (!videoPath) throw new Error(`Video generation failed:\n${text}`)

  return { videoPath, csvPath, duration, trackCount }
})

const YOUTUBE_MCP_SCRIPT = '/Users/stanislavpavlenko/Desktop/zero-distraction-workflow/packages/youtube-mcp/dist/index.js'
const YOUTUBE_MCP_DIR = '/Users/stanislavpavlenko/Desktop/zero-distraction-workflow/packages/youtube-mcp'

ipcMain.handle(
  'upload-video',
  async (_event, directory: string, keyword: string, mixNumber?: number) => {
    await callMcpTool('node', [YOUTUBE_MCP_SCRIPT], YOUTUBE_MCP_DIR, 'authenticate', {})

    const toolArgs: Record<string, unknown> = { directory, keyword }
    if (mixNumber !== undefined) toolArgs.mixNumber = mixNumber

    const text = await callMcpTool(
      'node',
      [YOUTUBE_MCP_SCRIPT],
      YOUTUBE_MCP_DIR,
      'publish_mix',
      toolArgs
    )

    const videoId = text.match(/(?:\*\*Video ID:\*\*|[Ii][Dd]:)\s*([A-Za-z0-9_-]{11})/)?.[1] ?? ''
    if (!videoId) throw new Error(`Upload may have failed. Response:\n${text}`)

    const url = `https://www.youtube.com/watch?v=${videoId}`
    return { videoId, url }
  }
)

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
