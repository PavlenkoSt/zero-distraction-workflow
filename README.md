# Zero Distraction Workflow

Tools for generating and publishing lofi/ambient music videos to YouTube.

## Packages

### `packages/music-studio`
Electron app — drag-and-drop interface for rendering videos and uploading to YouTube.

```bash
cd packages/music-studio
npm install
npm run dev
```

### `packages/music-video-creator`
Python MCP server — generates MP4 videos from audio tracks and a background image using FFmpeg.

```bash
cd packages/music-video-creator
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

### `packages/youtube-mcp`
Node.js MCP server — authenticates with YouTube and uploads videos as private drafts.

```bash
cd packages/youtube-mcp
npm install
npm run build
node dist/index.js
```
