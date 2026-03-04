# Monorepo Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all three repos into a single `zero-distraction-workflow` monorepo under `packages/`, update internal path references, and push to a new GitHub repo.

**Architecture:** Simple directory-based monorepo — no workspace tooling. Each package keeps its own install/run process. Root holds only `.gitignore` and `README.md`.

**Tech Stack:** Git, GitHub CLI (`gh`), Node.js (music-studio + youtube-mcp), Python (music-video-creator)

---

### Task 1: Create the new GitHub repo and local directory

**Files:**
- Create: `/Users/stanislavpavlenko/Desktop/zero-distraction-workflow/` (directory)

**Step 1: Create the GitHub repo**

```bash
gh repo create zero-distraction-workflow --public --description "Zero Distraction Lab — video generation and YouTube upload workflow"
```

**Step 2: Init local monorepo**

```bash
mkdir -p /Users/stanislavpavlenko/Desktop/zero-distraction-workflow/packages
cd /Users/stanislavpavlenko/Desktop/zero-distraction-workflow
git init
git remote add origin https://github.com/PavlenkoSt/zero-distraction-workflow.git
```

---

### Task 2: Copy packages into the monorepo

**Files:**
- Create: `packages/music-studio/`
- Create: `packages/music-video-creator/`
- Create: `packages/youtube-mcp/`

**Step 1: Copy each package (excluding their git history and build artifacts)**

```bash
cd /Users/stanislavpavlenko/Desktop/zero-distraction-workflow

rsync -av --exclude='.git' --exclude='node_modules' --exclude='out' --exclude='dist' \
  /Users/stanislavpavlenko/Desktop/music-studio/ packages/music-studio/

rsync -av --exclude='.git' --exclude='.venv' \
  /Users/stanislavpavlenko/Desktop/music-video-creator/ packages/music-video-creator/

rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist' \
  /Users/stanislavpavlenko/Desktop/youtube-mcp/ packages/youtube-mcp/
```

**Step 2: Verify structure**

```bash
ls packages/
# Expected: music-studio  music-video-creator  youtube-mcp
```

---

### Task 3: Create root .gitignore and README.md

**Files:**
- Create: `.gitignore`
- Create: `README.md`

**Step 1: Write .gitignore**

```
# music-studio (Electron)
packages/music-studio/node_modules/
packages/music-studio/out/
packages/music-studio/.vite/

# youtube-mcp (Node.js)
packages/youtube-mcp/node_modules/
packages/youtube-mcp/dist/

# music-video-creator (Python)
packages/music-video-creator/.venv/
packages/music-video-creator/__pycache__/
packages/music-video-creator/*.pyc

# macOS
.DS_Store
```

**Step 2: Write README.md**

```markdown
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
```

---

### Task 4: Update hardcoded paths in music-studio

**Files:**
- Modify: `packages/music-studio/src/main/index.ts` (lines 109-111, 161-162)

**Step 1: Update VIDEO_CREATOR_DIR and YOUTUBE_MCP paths**

Replace:
```typescript
const VIDEO_CREATOR_DIR = '/Users/stanislavpavlenko/Desktop/music-video-creator'
const VIDEO_CREATOR_PYTHON = `${VIDEO_CREATOR_DIR}/.venv/bin/python`
const VIDEO_CREATOR_SCRIPT = `${VIDEO_CREATOR_DIR}/server.py`
```

With:
```typescript
const VIDEO_CREATOR_DIR = '/Users/stanislavpavlenko/Desktop/zero-distraction-workflow/packages/music-video-creator'
const VIDEO_CREATOR_PYTHON = `${VIDEO_CREATOR_DIR}/.venv/bin/python`
const VIDEO_CREATOR_SCRIPT = `${VIDEO_CREATOR_DIR}/server.py`
```

Replace:
```typescript
const YOUTUBE_MCP_SCRIPT = '/Users/stanislavpavlenko/Desktop/youtube-mcp/dist/index.js'
const YOUTUBE_MCP_DIR = '/Users/stanislavpavlenko/Desktop/youtube-mcp'
```

With:
```typescript
const YOUTUBE_MCP_SCRIPT = '/Users/stanislavpavlenko/Desktop/zero-distraction-workflow/packages/youtube-mcp/dist/index.js'
const YOUTUBE_MCP_DIR = '/Users/stanislavpavlenko/Desktop/zero-distraction-workflow/packages/youtube-mcp'
```

**Step 2: Verify build still passes**

```bash
cd /Users/stanislavpavlenko/Desktop/zero-distraction-workflow/packages/music-studio
npm install
npm run build
# Expected: no TypeScript errors, build succeeds
```

---

### Task 5: Initial commit and push

**Step 1: Stage and commit everything**

```bash
cd /Users/stanislavpavlenko/Desktop/zero-distraction-workflow
git add .
git commit -m "feat: initial monorepo with music-studio, music-video-creator, youtube-mcp"
```

**Step 2: Push**

```bash
git push -u origin main
```

**Step 3: Verify on GitHub**

```bash
gh repo view zero-distraction-workflow --web
```

---

### Task 6: Archive old repos (optional, do when ready)

```bash
gh repo archive PavlenkoSt/music-studio
gh repo archive PavlenkoSt/music-video-creator
gh repo archive PavlenkoSt/youtube-mcp
```

> Only do this once you're confident the monorepo is working correctly and you no longer need to push to the old repos.
