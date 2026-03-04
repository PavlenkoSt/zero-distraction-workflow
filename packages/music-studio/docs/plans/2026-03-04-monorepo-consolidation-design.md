# Monorepo Consolidation Design

**Date:** 2026-03-04
**Status:** Approved

## Goal

Consolidate three separate repositories into a single monorepo so they can be maintained in one place while remaining independently deployable.

## Repositories Being Merged

| Current repo | New location |
|---|---|
| `music-studio` (Electron app) | `packages/music-studio/` |
| `music-video-creator` (Python MCP) | `packages/music-video-creator/` |
| `youtube-mcp` (Node.js MCP) | `packages/youtube-mcp/` |

## Structure

```
zero-distraction-workflow/
├── packages/
│   ├── music-studio/
│   ├── music-video-creator/
│   └── youtube-mcp/
├── .gitignore
└── README.md
```

## Approach

Simple directory-based monorepo (Option A). No workspace tooling — each package keeps its own `package.json` or `requirements.txt` and installs/runs independently.

## Changes Required

- Update hardcoded paths in `packages/music-studio/src/main/index.ts`:
  - `VIDEO_CREATOR_DIR` → new path under `packages/music-video-creator/`
  - `YOUTUBE_MCP_DIR` + `YOUTUBE_MCP_SCRIPT` → new path under `packages/youtube-mcp/`
- Root `.gitignore` covering all packages' artifacts (`node_modules`, `.venv`, `out/`, `dist/`)
- Root `README.md` with overview and per-package setup instructions

## What Stays the Same

Each package deploys and runs independently. No shared tooling or dependencies introduced.

## Old Repos

Archive or keep the three original GitHub repos after migration.
