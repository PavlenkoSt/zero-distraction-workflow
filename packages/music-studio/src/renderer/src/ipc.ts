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

declare global {
  interface Window {
    electronAPI: {
      scanFolder(folderPath: string): Promise<ScanResult>
      generateVideo(folderPath: string, outputPath: string): Promise<GenerateResult>
      uploadVideo(directory: string, keyword: string, mixNumber?: number): Promise<UploadResult>
      openPath(path: string): Promise<void>
      openExternal(url: string): Promise<void>
      cancelGenerate(): Promise<void>
      getDefaultOutputPath(): Promise<string>
      getPathForFile(file: File): string
      selectFolder(): Promise<string | null>
      generateShorts(folderPath: string, outputPath: string, thematicText: string): Promise<ShortsGenerateResult>
      publishShorts(directory: string): Promise<ShortsUploadResult>
    }
  }
}

export const api = window.electronAPI
