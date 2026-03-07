import { contextBridge, ipcRenderer, webUtils } from 'electron'

export type ScanResult = {
  folderPath: string
  trackCount: number
  hasImage: boolean
  audioFiles: string[]
  imageFile: string | null
}

export type GenerateResult = {
  videoPath: string
  csvPath: string
  duration: string
  trackCount: number
}

export type UploadResult = {
  videoId: string
  url: string
}

export type ShortsGenerateResult = {
  outputPath: string
  count: number
  files: Array<{ video: string; metadata: string }>
}

export type ShortsUploadResult = {
  total: number
  succeeded: number
  failed: number
  results: Array<{ filename: string; videoId?: string; studioUrl?: string; error?: string }>
}

contextBridge.exposeInMainWorld('electronAPI', {
  scanFolder: (folderPath: string): Promise<ScanResult> =>
    ipcRenderer.invoke('scan-folder', folderPath),

  generateVideo: (folderPath: string, outputPath: string): Promise<GenerateResult> =>
    ipcRenderer.invoke('generate-video', folderPath, outputPath),

  uploadVideo: (directory: string, keyword: string, mixNumber?: number): Promise<UploadResult> =>
    ipcRenderer.invoke('upload-video', directory, keyword, mixNumber),

  openPath: (path: string): Promise<void> =>
    ipcRenderer.invoke('open-path', path),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),

  getDefaultOutputPath: (): Promise<string> =>
    ipcRenderer.invoke('get-default-output-path'),

  cancelGenerate: (): Promise<void> =>
    ipcRenderer.invoke('cancel-generate'),

  generateShorts: (folderPath: string, outputPath: string, trackTexts: string[]): Promise<ShortsGenerateResult> =>
    ipcRenderer.invoke('generate-shorts', folderPath, outputPath, trackTexts),

  publishShorts: (directory: string): Promise<ShortsUploadResult> =>
    ipcRenderer.invoke('publish-shorts', directory),

  getPathForFile: (file: File): string =>
    webUtils.getPathForFile(file),

  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('select-folder'),
})
