# Shorts UI Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire `create_shorts` and `publish_shorts` MCP tools into the Electron music-studio app with Generate Shorts and Publish Shorts flows.

**Architecture:** The app uses a state machine in `App.tsx` with screens as discriminated union types. IPC flows through `preload/index.ts` (contextBridge) → `src/renderer/src/ipc.ts` (type declarations) → `src/main/index.ts` (handlers). Two new MCP calls are added: `generate-shorts` calls the Python MCP server, `publish-shorts` calls the YouTube MCP server. Three UI files are modified, four new files are created.

**Tech Stack:** Electron + React + TypeScript, no component test framework (use `npx tsc --noEmit` for type verification, `npm run dev` to smoke-test visually)

---

### Task 1: IPC types — new result types + API methods

**Files:**
- Modify: `packages/music-studio/src/preload/index.ts`
- Modify: `packages/music-studio/src/renderer/src/ipc.ts`

**Context:** `preload/index.ts` uses `contextBridge.exposeInMainWorld('electronAPI', {...})` to expose IPC methods. `ipc.ts` declares the matching `Window.electronAPI` interface and re-exports types for React components.

**Step 1: Add new types and methods to preload/index.ts**

Open `packages/music-studio/src/preload/index.ts`. After the existing `UploadResult` type, add:

```typescript
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
```

Inside the `contextBridge.exposeInMainWorld` object, after `cancelGenerate`, add:

```typescript
  generateShorts: (folderPath: string, outputPath: string, thematicText: string): Promise<ShortsGenerateResult> =>
    ipcRenderer.invoke('generate-shorts', folderPath, outputPath, thematicText),

  publishShorts: (directory: string): Promise<ShortsUploadResult> =>
    ipcRenderer.invoke('publish-shorts', directory),
```

**Step 2: Mirror in ipc.ts**

Open `packages/music-studio/src/renderer/src/ipc.ts`. After `UploadResult`, add:

```typescript
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
```

Inside the `Window.electronAPI` interface, after `selectFolder`, add:

```typescript
      generateShorts(folderPath: string, outputPath: string, thematicText: string): Promise<ShortsGenerateResult>
      publishShorts(directory: string): Promise<ShortsUploadResult>
```

**Step 3: Verify types compile**

```bash
cd packages/music-studio && npx tsc --noEmit
```

Expected: no errors

**Step 4: Commit**

```bash
git add packages/music-studio/src/preload/index.ts packages/music-studio/src/renderer/src/ipc.ts
git commit -m "feat: add shorts IPC types to preload and ipc bridge"
```

---

### Task 2: Main process — generate-shorts handler

**Files:**
- Modify: `packages/music-studio/src/main/index.ts`

**Context:** The main process uses `callMcpTool()` for simple calls and direct client instantiation for cancellable long operations. `generate-video` uses the direct pattern with `activeGenerateClient`. `generate-shorts` should reuse the same `activeGenerateClient` pattern so the existing cancel handler works for it too.

The `create_shorts` MCP tool returns text ending with:
```
Done! Generated 3 shorts in /path/to/output

Generated 3 shorts in /path/to/output
```
And per-file lines like:
```
Rendered: 1-midnight-rain.mp4
Metadata: 1-midnight-rain.txt
```

**Step 1: Add generate-shorts IPC handler**

In `packages/music-studio/src/main/index.ts`, after the `generate-video` handler (after line ~159), add:

```typescript
ipcMain.handle('generate-shorts', async (_event, folderPath: string, outputPath: string, thematicText: string) => {
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
        name: 'create_shorts',
        arguments: { folder_path: folderPath, output_path: outputPath, thematic_text: thematicText }
      },
      undefined,
      { timeout: 30 * 60 * 1000 }
    )
    const content = result.content as Array<{ type: string; text: string }>
    text = content.map((c) => c.text).join('\n')
  } finally {
    activeGenerateClient = null
    await client.close().catch(() => {})
  }

  const countMatch = text.match(/Generated (\d+) shorts/)
  const count = countMatch ? parseInt(countMatch[1]) : 0
  if (!count) throw new Error(`Shorts generation failed:\n${text}`)

  // Parse file pairs from log lines
  const lines = text.split('\n')
  const files: Array<{ video: string; metadata: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const videoMatch = lines[i].match(/^Rendered: (.+\.mp4)$/)
    if (videoMatch) {
      const videoFile = videoMatch[1]
      const metaMatch = lines[i + 1]?.match(/^Metadata: (.+\.txt)$/)
      const metaFile = metaMatch ? metaMatch[1] : videoFile.replace('.mp4', '.txt')
      files.push({
        video: path.join(outputPath, videoFile),
        metadata: path.join(outputPath, metaFile),
      })
    }
  }

  return { outputPath, count, files }
})
```

**Step 2: Verify types compile**

```bash
cd packages/music-studio && npx tsc --noEmit
```

Expected: no errors

**Step 3: Commit**

```bash
git add packages/music-studio/src/main/index.ts
git commit -m "feat: add generate-shorts IPC handler in main process"
```

---

### Task 3: Main process — publish-shorts handler

**Files:**
- Modify: `packages/music-studio/src/main/index.ts`

**Context:** The `publish_shorts` MCP tool (in youtube-mcp) returns text like:
```
**Shorts batch upload complete!**
...
**3 processed, 2 succeeded, 1 failed**

• 1-midnight-rain.mp4 → https://studio.youtube.com/video/abc123XYZ/edit
• 2-solar-wind.mp4 → FAILED: YouTube API Error 403
```

**Step 1: Add publish-shorts IPC handler**

In `packages/music-studio/src/main/index.ts`, after the `upload-video` handler, add:

```typescript
ipcMain.handle('publish-shorts', async (_event, directory: string) => {
  await callMcpTool('node', [YOUTUBE_MCP_SCRIPT], YOUTUBE_MCP_DIR, 'authenticate', {})

  const text = await callMcpTool(
    'node',
    [YOUTUBE_MCP_SCRIPT],
    YOUTUBE_MCP_DIR,
    'publish_shorts',
    { directory }
  )

  // Parse summary counts
  const summaryMatch = text.match(/\*\*(\d+) processed, (\d+) succeeded, (\d+) failed\*\*/)
  const total = summaryMatch ? parseInt(summaryMatch[1]) : 0
  const succeeded = summaryMatch ? parseInt(summaryMatch[2]) : 0
  const failed = summaryMatch ? parseInt(summaryMatch[3]) : 0

  if (!total) throw new Error(`Publish shorts failed:\n${text}`)

  // Parse per-video results from bullet lines
  const results: Array<{ filename: string; videoId?: string; studioUrl?: string; error?: string }> = []
  for (const line of text.split('\n')) {
    // Success: • filename.mp4 → https://studio.youtube.com/video/{id}/edit
    const successMatch = line.match(/^[•·]\s+(.+\.mp4)\s+→\s+(https:\/\/studio\.youtube\.com\/video\/([A-Za-z0-9_-]+)\/edit)/)
    if (successMatch) {
      results.push({ filename: successMatch[1], videoId: successMatch[3], studioUrl: successMatch[2] })
      continue
    }
    // Failure: • filename.mp4 → FAILED: message
    const failMatch = line.match(/^[•·]\s+(.+\.mp4)\s+→\s+FAILED:\s+(.+)/)
    if (failMatch) {
      results.push({ filename: failMatch[1], error: failMatch[2] })
    }
  }

  return { total, succeeded, failed, results }
})
```

**Step 2: Verify types compile**

```bash
cd packages/music-studio && npx tsc --noEmit
```

Expected: no errors

**Step 3: Commit**

```bash
git add packages/music-studio/src/main/index.ts
git commit -m "feat: add publish-shorts IPC handler in main process"
```

---

### Task 4: Home screen — 4-card grid

**Files:**
- Modify: `packages/music-studio/src/renderer/src/screens/Home.tsx`
- Modify: `packages/music-studio/src/renderer/src/screens/Home.css`

**Context:** Current Home has 2 cards in a flex column. Change to 2×2 CSS grid. Add `onGenerateShorts` and `onPublishShorts` callbacks.

**Step 1: Update Home.tsx**

Replace the entire file content:

```tsx
import './Home.css'

type Props = {
  onRender: () => void
  onPublish: () => void
  onGenerateShorts: () => void
  onPublishShorts: () => void
}

export function Home({ onRender, onPublish, onGenerateShorts, onPublishShorts }: Props) {
  return (
    <div className="home-screen">
      <h1>Music Studio</h1>

      <div className="home-cards">
        <button className="home-card" onClick={onRender}>
          <div className="card-icon">🎬</div>
          <div className="card-title">Render Video</div>
          <div className="card-desc">Audio tracks + image → MP4 video with chapters</div>
        </button>

        <button className="home-card" onClick={onGenerateShorts}>
          <div className="card-icon">📱</div>
          <div className="card-title">Generate Shorts</div>
          <div className="card-desc">Audio tracks + image → portrait shorts with typing text</div>
        </button>

        <button className="home-card" onClick={onPublish}>
          <div className="card-icon">📡</div>
          <div className="card-title">Publish Video</div>
          <div className="card-desc">Upload existing video to YouTube as private draft</div>
        </button>

        <button className="home-card" onClick={onPublishShorts}>
          <div className="card-icon">🚀</div>
          <div className="card-title">Publish Shorts</div>
          <div className="card-desc">Batch upload shorts folder to YouTube</div>
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Update Home.css**

Change `.home-cards` from flex column to 2-column grid:

```css
.home-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 40px;
  padding: 40px;
  height: 100vh;
  box-sizing: border-box;
}

.home-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  width: 100%;
  max-width: 480px;
}

.home-card {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s, background 0.2s;
}
.home-card:hover {
  border-color: #7c6af5;
  background: #242424;
}

.card-icon { font-size: 28px; margin-bottom: 8px; }
.card-title { font-size: 17px; font-weight: 600; color: #e0e0e0; margin-bottom: 4px; }
.card-desc { font-size: 13px; color: #888; line-height: 1.4; }
```

**Step 3: Verify types compile**

```bash
cd packages/music-studio && npx tsc --noEmit
```

Expected: error about `App.tsx` missing the new props — that's expected, will be fixed in Task 8.

**Step 4: Commit**

```bash
git add packages/music-studio/src/renderer/src/screens/Home.tsx packages/music-studio/src/renderer/src/screens/Home.css
git commit -m "feat: expand Home to 4-card grid with Generate Shorts and Publish Shorts"
```

---

### Task 5: DropZone — mode prop + thematic text input

**Files:**
- Modify: `packages/music-studio/src/renderer/src/screens/DropZone.tsx`
- Modify: `packages/music-studio/src/renderer/src/screens/DropZone.css`

**Context:** DropZone currently has `onGenerate: (folderPath, outputPath) => void`. In `shorts` mode it needs to also pass `thematicText`. The callback signature changes to `(folderPath, outputPath, thematicText: string) => void`. In `video` mode `thematicText` is always `''`.

**Step 1: Update DropZone.tsx**

Replace the entire file:

```tsx
import { useState, useCallback, useEffect } from 'react'
import { api } from '../ipc'
import type { ScanResult } from '../ipc'
import './DropZone.css'

type Props = {
  mode: 'video' | 'shorts'
  onGenerate: (folderPath: string, outputPath: string, thematicText: string) => void
  onBack: () => void
}

export function DropZone({ mode, onGenerate, onBack }: Props) {
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [outputPath, setOutputPath] = useState('')
  const [thematicText, setThematicText] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    api.getDefaultOutputPath().then(setOutputPath)
  }, [])

  const scanPath = useCallback(async (filePath: string) => {
    setError('')
    try {
      const result = await api.scanFolder(filePath)
      setScan(result)
    } catch (err) {
      setError(String(err))
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const filePath = api.getPathForFile(file)
    if (!filePath) { setError('Could not get folder path'); return }
    scanPath(filePath)
  }, [scanPath])

  const handleBrowse = useCallback(async () => {
    const folderPath = await api.selectFolder()
    if (folderPath) scanPath(folderPath)
  }, [scanPath])

  const isReady = scan && scan.hasImage && !!outputPath && (mode === 'video' || !!thematicText.trim())

  const title = mode === 'shorts' ? 'Generate Shorts' : 'Render Video'
  const buttonLabel = mode === 'shorts' ? 'Generate Shorts' : 'Generate Video'

  return (
    <div className="dropzone-screen">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1>{title}</h1>

      <div
        className={`drop-target ${dragging ? 'dragging' : ''} ${scan ? 'has-scan' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {scan ? (
          <div className="scan-result">
            <div className="folder-name">{scan.folderPath.split('/').pop()}</div>
            <div className="scan-info">
              <span className={scan.trackCount > 0 ? 'ok' : 'warn'}>
                {scan.trackCount} audio tracks
              </span>
              <span className={scan.hasImage ? 'ok' : 'warn'}>
                {scan.hasImage ? '✓ background image' : '✗ no image found'}
              </span>
            </div>
            <button className="link-btn" onClick={() => setScan(null)}>
              Drop a different folder
            </button>
          </div>
        ) : (
          <>
            <p>Drop a music folder here</p>
            <button className="link-btn" onClick={handleBrowse}>or browse…</button>
          </>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="output-row">
        <label>Output folder</label>
        <input
          type="text"
          value={outputPath}
          onChange={e => setOutputPath(e.target.value)}
          placeholder="~/Desktop/Music"
        />
      </div>

      {mode === 'shorts' && (
        <div className="output-row">
          <label>Thematic text</label>
          <input
            type="text"
            value={thematicText}
            onChange={e => setThematicText(e.target.value)}
            placeholder="e.g. lofi ambient focus music for deep work"
          />
        </div>
      )}

      <button
        className="primary-btn"
        disabled={!isReady}
        onClick={() => scan && onGenerate(scan.folderPath, outputPath, thematicText)}
      >
        {buttonLabel}
      </button>
    </div>
  )
}
```

**Step 2: DropZone.css — add thematic input row styling**

Open `packages/music-studio/src/renderer/src/screens/DropZone.css`. The `.output-row` style should already exist. If `thematic-row` needs extra margin, it shares the same `.output-row` class so no CSS changes needed. Verify `.output-row` exists in the file — if it doesn't, add:

```css
.output-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 420px;
}

.output-row label {
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.output-row input {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 10px 14px;
  color: #e0e0e0;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

.output-row input:focus {
  border-color: #7c6af5;
}
```

**Step 3: Verify types compile**

```bash
cd packages/music-studio && npx tsc --noEmit
```

Expected: error about App.tsx not passing `mode` prop — expected, fixed in Task 8.

**Step 4: Commit**

```bash
git add packages/music-studio/src/renderer/src/screens/DropZone.tsx packages/music-studio/src/renderer/src/screens/DropZone.css
git commit -m "feat: add mode prop and thematic text input to DropZone"
```

---

### Task 6: ShortsGenerating screen

**Files:**
- Create: `packages/music-studio/src/renderer/src/screens/ShortsGenerating.tsx`
- Create: `packages/music-studio/src/renderer/src/screens/ShortsGenerating.css`

**Context:** Like `Generating.tsx` but: calls `api.generateShorts()`, shows a results list on completion (filenames, not a single path), has "Open Output Folder" and "Back to Home" but no "Upload to YouTube" button.

**Step 1: Create ShortsGenerating.tsx**

```tsx
import { useEffect, useState, useRef } from 'react'
import { api } from '../ipc'
import type { ShortsGenerateResult } from '../ipc'
import './ShortsGenerating.css'

type Props = {
  folderPath: string
  outputPath: string
  thematicText: string
  onBack: () => void
}

export function ShortsGenerating({ folderPath, outputPath, thematicText, onBack }: Props) {
  const [result, setResult] = useState<ShortsGenerateResult | null>(null)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [cancelled, setCancelled] = useState(false)
  const startRef = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)

    api.generateShorts(folderPath, outputPath, thematicText)
      .then(r => {
        clearInterval(timerRef.current!)
        setResult(r)
      })
      .catch(err => {
        clearInterval(timerRef.current!)
        if (!cancelled) setError(String(err))
      })

    return () => clearInterval(timerRef.current!)
  }, [])

  const handleCancel = async () => {
    setCancelled(true)
    clearInterval(timerRef.current!)
    await api.cancelGenerate()
    onBack()
  }

  const fmtElapsed = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (error) return (
    <div className="shorts-generating-screen">
      <h2>Generation Failed</h2>
      <pre className="error-box">{error}</pre>
      <button className="secondary-btn" onClick={onBack}>← Back to Home</button>
    </div>
  )

  if (!result) return (
    <div className="shorts-generating-screen">
      <div className="spinner" />
      <h2>Generating shorts…</h2>
      <p className="elapsed">{fmtElapsed(elapsed)}</p>
      <p className="hint">Rendering {folderPath.split('/').pop()} into portrait clips.</p>
      <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
    </div>
  )

  return (
    <div className="shorts-generating-screen done">
      <div className="checkmark">✓</div>
      <h2>{result.count} Shorts Ready</h2>
      <ul className="shorts-file-list">
        {result.files.map((f, i) => (
          <li key={i} className="shorts-file-item">
            <span className="shorts-file-name">{f.video.split('/').pop()}</span>
          </li>
        ))}
      </ul>
      <div className="action-row">
        <button className="secondary-btn" onClick={() => api.openPath(result.outputPath)}>
          Open Output Folder
        </button>
        <button className="primary-btn" onClick={onBack}>
          Back to Home
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Create ShortsGenerating.css**

```css
.shorts-generating-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100vh;
  padding: 40px;
  box-sizing: border-box;
  text-align: center;
}

.shorts-generating-screen h2 {
  font-size: 20px;
  font-weight: 600;
  color: #e0e0e0;
  margin: 0;
}

.shorts-generating-screen .elapsed {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 28px;
  color: #7c6af5;
  margin: 0;
}

.shorts-generating-screen .hint {
  font-size: 13px;
  color: #888;
  margin: 0;
}

.shorts-generating-screen .error-box {
  background: #2a1a1a;
  border: 1px solid #eb5757;
  border-radius: 8px;
  padding: 16px;
  font-size: 12px;
  color: #eb5757;
  max-height: 200px;
  overflow-y: auto;
  width: 100%;
  max-width: 480px;
  text-align: left;
  white-space: pre-wrap;
}

.shorts-generating-screen.done {
  justify-content: center;
}

.shorts-generating-screen .checkmark {
  font-size: 40px;
  color: #6fcf97;
}

.shorts-file-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  max-width: 400px;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shorts-file-item {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 10px 14px;
  text-align: left;
}

.shorts-file-name {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: #e0e0e0;
}

.action-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top-color: #7c6af5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.cancel-btn {
  background: transparent;
  border: 1px solid #555;
  border-radius: 8px;
  color: #888;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.2s, color 0.2s;
}
.cancel-btn:hover {
  border-color: #eb5757;
  color: #eb5757;
}

.secondary-btn {
  background: transparent;
  border: 1px solid #555;
  border-radius: 8px;
  color: #e0e0e0;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.2s;
}
.secondary-btn:hover { border-color: #7c6af5; }

.primary-btn {
  background: #7c6af5;
  border: none;
  border-radius: 8px;
  color: white;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.2s;
}
.primary-btn:hover { background: #6a58e0; }
.primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

**Step 3: Verify types compile**

```bash
cd packages/music-studio && npx tsc --noEmit
```

Expected: errors only from App.tsx (not yet wired) — all new file errors should be clean.

**Step 4: Commit**

```bash
git add packages/music-studio/src/renderer/src/screens/ShortsGenerating.tsx packages/music-studio/src/renderer/src/screens/ShortsGenerating.css
git commit -m "feat: add ShortsGenerating screen with results list"
```

---

### Task 7: PublishShorts screen

**Files:**
- Create: `packages/music-studio/src/renderer/src/screens/PublishShorts.tsx`
- Create: `packages/music-studio/src/renderer/src/screens/PublishShorts.css`

**Context:** Folder picker (drag-drop + browse) → one button "Authenticate & Publish" → spinner → results list with per-video YouTube Studio links and a summary. Similar structure to `Upload.tsx` but results are multiple.

**Step 1: Create PublishShorts.tsx**

```tsx
import { useState, useCallback } from 'react'
import { api } from '../ipc'
import type { ShortsUploadResult } from '../ipc'
import './PublishShorts.css'

type Status = 'idle' | 'authenticating' | 'uploading' | 'done' | 'error'

type Props = {
  onBack: () => void
}

export function PublishShorts({ onBack }: Props) {
  const [folderPath, setFolderPath] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [uploadResult, setUploadResult] = useState<ShortsUploadResult | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const p = api.getPathForFile(file)
    if (p) setFolderPath(p)
  }, [])

  const handleBrowse = useCallback(async () => {
    const p = await api.selectFolder()
    if (p) setFolderPath(p)
  }, [])

  const handlePublish = async () => {
    if (!folderPath) return
    setStatus('authenticating')
    setError('')
    try {
      setStatus('uploading')
      const result = await api.publishShorts(folderPath)
      setUploadResult(result)
      setStatus('done')
    } catch (err) {
      setError(String(err))
      setStatus('error')
    }
  }

  return (
    <div className="publish-shorts-screen">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h2>Publish Shorts</h2>

      <div
        className={`folder-picker ${dragging ? 'dragging' : ''} ${folderPath ? 'has-folder' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleFolderDrop}
      >
        {folderPath ? (
          <div className="folder-selected">
            <span className="folder-name">{folderPath.split('/').pop()}</span>
            <button className="link-btn" onClick={() => setFolderPath('')}>change</button>
          </div>
        ) : (
          <>
            <p>Drop shorts folder here</p>
            <button className="link-btn" onClick={handleBrowse}>or browse…</button>
          </>
        )}
      </div>

      {(status === 'idle' || status === 'error') && (
        <button
          className="primary-btn"
          disabled={!folderPath}
          onClick={handlePublish}
        >
          Authenticate &amp; Publish
        </button>
      )}

      {(status === 'authenticating' || status === 'uploading') && (
        <div className="uploading-panel">
          <div className="spinner" />
          <p>{status === 'authenticating' ? 'Opening browser for Google sign-in…' : 'Uploading shorts…'}</p>
        </div>
      )}

      {status === 'done' && uploadResult && (
        <div className="done-panel">
          <div className="checkmark">✓</div>
          <p className="summary">
            {uploadResult.succeeded} of {uploadResult.total} uploaded
            {uploadResult.failed > 0 && ` · ${uploadResult.failed} failed`}
          </p>
          <ul className="results-list">
            {uploadResult.results.map((r, i) => (
              <li key={i} className={`result-item ${r.error ? 'failed' : 'ok'}`}>
                <span className="result-filename">{r.filename}</span>
                {r.studioUrl ? (
                  <a
                    className="result-link"
                    onClick={() => api.openExternal(r.studioUrl!)}
                  >
                    Studio →
                  </a>
                ) : (
                  <span className="result-error">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">Set Altered content → No, then publish when ready.</p>
        </div>
      )}

      {error && <pre className="error-box">{error}</pre>}
    </div>
  )
}
```

**Step 2: Create PublishShorts.css**

```css
.publish-shorts-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 60px 40px 40px;
  min-height: 100vh;
  box-sizing: border-box;
}

.publish-shorts-screen h2 {
  font-size: 20px;
  font-weight: 600;
  color: #e0e0e0;
  margin: 0;
}

.back-btn {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  transition: color 0.2s;
}
.back-btn:hover { color: #e0e0e0; }

.folder-picker {
  width: 100%;
  max-width: 420px;
  border: 1px dashed #444;
  border-radius: 12px;
  padding: 28px 20px;
  text-align: center;
  cursor: default;
  transition: border-color 0.2s, background 0.2s;
}
.folder-picker p { color: #888; font-size: 14px; margin: 0 0 8px; }
.folder-picker.dragging { border-color: #7c6af5; background: rgba(124,106,245,0.06); }
.folder-picker.has-folder { border-style: solid; border-color: #555; }

.folder-selected {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.folder-name {
  font-size: 14px;
  color: #e0e0e0;
  font-weight: 500;
}

.link-btn {
  background: transparent;
  border: none;
  color: #7c6af5;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.link-btn:hover { text-decoration: underline; }

.primary-btn {
  background: #7c6af5;
  border: none;
  border-radius: 8px;
  color: white;
  padding: 12px 28px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  transition: background 0.2s;
  width: 100%;
  max-width: 420px;
}
.primary-btn:hover { background: #6a58e0; }
.primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.uploading-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.uploading-panel p { color: #888; font-size: 14px; margin: 0; }

.done-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 420px;
}

.checkmark { font-size: 32px; color: #6fcf97; }

.summary {
  font-size: 15px;
  color: #e0e0e0;
  font-weight: 600;
  margin: 0;
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 10px 14px;
}
.result-item.failed { border-color: #eb575740; }

.result-filename {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: #e0e0e0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-link {
  color: #7c6af5;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  margin-left: 12px;
}
.result-link:hover { text-decoration: underline; }

.result-error {
  color: #eb5757;
  font-size: 11px;
  margin-left: 12px;
  white-space: nowrap;
}

.hint { font-size: 12px; color: #888; margin: 0; text-align: center; }

.error-box {
  background: #2a1a1a;
  border: 1px solid #eb5757;
  border-radius: 8px;
  padding: 16px;
  font-size: 12px;
  color: #eb5757;
  max-height: 200px;
  overflow-y: auto;
  width: 100%;
  max-width: 420px;
  white-space: pre-wrap;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #333;
  border-top-color: #7c6af5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**Step 3: Verify types compile**

```bash
cd packages/music-studio && npx tsc --noEmit
```

Expected: errors only from App.tsx (not yet wired).

**Step 4: Commit**

```bash
git add packages/music-studio/src/renderer/src/screens/PublishShorts.tsx packages/music-studio/src/renderer/src/screens/PublishShorts.css
git commit -m "feat: add PublishShorts screen with results list"
```

---

### Task 8: App.tsx — wire all new screens

**Files:**
- Modify: `packages/music-studio/src/renderer/src/App.tsx`

**Context:** Add three new screen states. Pass `mode` to DropZone. Connect all callbacks.

**Step 1: Replace App.tsx**

```tsx
import { useState } from 'react'
import { Home } from './screens/Home'
import { DropZone } from './screens/DropZone'
import { Generating } from './screens/Generating'
import { ShortsGenerating } from './screens/ShortsGenerating'
import { Upload } from './screens/Upload'
import { PublishShorts } from './screens/PublishShorts'
import type { GenerateResult } from './ipc'

type Screen =
  | { name: 'home' }
  | { name: 'drop' }
  | { name: 'generating'; folderPath: string; outputPath: string }
  | { name: 'upload'; outputPath: string; result: GenerateResult }
  | { name: 'publish' }
  | { name: 'shorts-drop' }
  | { name: 'shorts-generating'; folderPath: string; outputPath: string; thematicText: string }
  | { name: 'publish-shorts' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })

  const goHome = () => setScreen({ name: 'home' })

  let content

  if (screen.name === 'home') {
    content = (
      <Home
        onRender={() => setScreen({ name: 'drop' })}
        onPublish={() => setScreen({ name: 'publish' })}
        onGenerateShorts={() => setScreen({ name: 'shorts-drop' })}
        onPublishShorts={() => setScreen({ name: 'publish-shorts' })}
      />
    )
  } else if (screen.name === 'drop') {
    content = (
      <DropZone
        mode="video"
        onGenerate={(folderPath, outputPath) =>
          setScreen({ name: 'generating', folderPath, outputPath })
        }
        onBack={goHome}
      />
    )
  } else if (screen.name === 'generating') {
    content = (
      <Generating
        folderPath={screen.folderPath}
        outputPath={screen.outputPath}
        onUpload={(outputPath, result) =>
          setScreen({ name: 'upload', outputPath, result })
        }
        onBack={goHome}
      />
    )
  } else if (screen.name === 'shorts-drop') {
    content = (
      <DropZone
        mode="shorts"
        onGenerate={(folderPath, outputPath, thematicText) =>
          setScreen({ name: 'shorts-generating', folderPath, outputPath, thematicText })
        }
        onBack={goHome}
      />
    )
  } else if (screen.name === 'shorts-generating') {
    content = (
      <ShortsGenerating
        folderPath={screen.folderPath}
        outputPath={screen.outputPath}
        thematicText={screen.thematicText}
        onBack={goHome}
      />
    )
  } else if (screen.name === 'publish-shorts') {
    content = <PublishShorts onBack={goHome} />
  } else if (screen.name === 'publish') {
    content = <Upload onBack={goHome} />
  } else {
    content = (
      <Upload
        outputPath={screen.outputPath}
        generateResult={screen.result}
        onBack={goHome}
      />
    )
  }

  return (
    <>
      <div className="drag-region" />
      {content}
    </>
  )
}
```

**Step 2: Verify full TypeScript compile — all errors resolved**

```bash
cd packages/music-studio && npx tsc --noEmit
```

Expected: **no errors**

**Step 3: Smoke test in dev mode**

```bash
cd packages/music-studio && npm run dev
```

Expected: App launches, Home shows 4 cards in 2×2 grid. Clicking "Generate Shorts" shows DropZone with thematic text field. Clicking "Publish Shorts" shows PublishShorts screen.

**Step 4: Commit**

```bash
git add packages/music-studio/src/renderer/src/App.tsx
git commit -m "feat: wire shorts screens into App state machine"
```
