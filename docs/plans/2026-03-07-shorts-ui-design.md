# Shorts UI Integration — Design

## Goal

Wire `create_shorts` and `publish_shorts` MCP tools into the existing music-studio Electron app with two new user flows.

## Home Screen

Change `.home-cards` from `flex-direction: column` to a `2×2 grid` (400px max-width, 2 columns). Four cards:
- Render Video (existing)
- Generate Shorts (new)
- Publish Video (existing)
- Publish Shorts (new)

**Modified:** `Home.tsx`, `Home.css`

## Generate Shorts Flow

### DropZone (mode prop)

Add `mode: 'video' | 'shorts'` prop. In `shorts` mode:
- Title changes to "Generate Shorts"
- Add a text input below the drop target: "Thematic text" (e.g. "lofi ambient focus for deep work")
- Button label: "Generate Shorts"
- `onGenerate` callback signature gains thematic text: `(folderPath, outputPath, thematicText) => void` (in video mode, thematicText is ignored/empty)

**Modified:** `DropZone.tsx`, `DropZone.css`

### ShortsGenerating (new screen)

Props: `folderPath`, `outputPath`, `thematicText`, `onBack`

- On mount: calls `api.generateShorts(folderPath, outputPath, thematicText)`
- Shows per-track progress — output is parsed line by line as MCP streams. Progress label: "Rendering 2 / 5 — Midnight Rain"
- Elapsed time counter (same pattern as Generating.tsx)
- Cancel button → calls `api.cancelGenerate()` (reuses same cancel mechanism)
- On completion: results panel — list of generated files, "Open Output Folder" button, "Back to Home" button

**New files:** `ShortsGenerating.tsx`, `ShortsGenerating.css`

## Publish Shorts Flow

### PublishShorts (new screen)

Props: `onBack`

- Folder picker (drag-drop or browse, same pattern as Upload)
- "Authenticate & Publish" button → calls `api.publishShorts(directory)`
- Progress: spinner with "Uploading shorts…"
- Results: list of uploaded shorts with YouTube Studio link per video, summary line (N succeeded, N failed)

**New files:** `PublishShorts.tsx`, `PublishShorts.css`

## App.tsx State Machine

New screen states:
```typescript
| { name: 'shorts-drop' }
| { name: 'shorts-generating'; folderPath: string; outputPath: string; thematicText: string }
| { name: 'publish-shorts' }
```

Home gets two new callbacks: `onGenerateShorts` and `onPublishShorts`.

**Modified:** `App.tsx`

## IPC Layer

### New types (preload/index.ts + ipc.ts)

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

### New preload methods

```typescript
generateShorts(folderPath: string, outputPath: string, thematicText: string): Promise<ShortsGenerateResult>
publishShorts(directory: string): Promise<ShortsUploadResult>
```

### New main process handlers

**`generate-shorts`:** Calls `create_shorts` on the Python MCP server (same client/transport pattern as `generate-video`). Parses result text for count and output path.

**`publish-shorts`:** Calls `authenticate` then `publish_shorts` on the YouTube MCP server. Parses the result text to extract per-video IDs and build `ShortsUploadResult`.

**Modified:** `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/ipc.ts`
