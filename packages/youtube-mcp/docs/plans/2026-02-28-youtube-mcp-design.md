# YouTube Upload MCP Server — Design

## Purpose

MCP server for uploading lofi/ambient music mixes to YouTube as private drafts with auto-generated SEO metadata. Integrates with Claude Code so the full workflow happens in the terminal.

## Architecture

- **Runtime:** TypeScript (Node.js) MCP server using `@modelcontextprotocol/sdk`
- **Transport:** stdio
- **YouTube API:** YouTube Data API v3 via `googleapis` npm package
- **Auth:** OAuth2 Desktop flow, refresh token persisted to `~/.youtube-mcp/credentials.json`

## Tools

### `authenticate`
- Triggers OAuth2 consent flow in browser
- Saves refresh token for subsequent runs
- Auto-refreshes on future calls

### `generate_metadata`
**Input:**
- `tracks`: array of `{ name: string, timecode: string }`
- `mood`: `"relax"` | `"focus"` | `"ambient"`
- `mixNumber`: optional number for title

**Output:**
- `title`: SEO-optimized title (e.g. "2 Hours of Lofi Ambient for Deep Relaxation | Chill Mix #11")
- `description`: intro paragraph + chapter list with timecodes + hashtags
- `tags`: 15-20 relevant keywords
- `categoryId`: "10" (Music)

Generation is template-based (no external AI calls). Templates are tuned per mood for YouTube SEO.

### `upload_video`
**Input:**
- `videoPath`: absolute path to .mp4
- `title`, `description`, `tags`, `categoryId`
- `privacyStatus`: always "private"

Uses resumable upload for large files (2-4 GB). Returns video ID and URL.

### `set_thumbnail`
**Input:**
- `videoId`: YouTube video ID
- `thumbnailPath`: absolute path to .png/.jpg (must be <2MB)

Sets custom thumbnail on the uploaded video.

## Error Handling

- Auth expired/missing: prompts to run `authenticate`
- File not found: validates paths before upload
- Upload failure: resumable upload retries from last checkpoint
- Quota exceeded: clear error message (daily limit ~6 uploads)
- Invalid thumbnail: validates size/format before upload

## Project Structure

```
~/Desktop/youtube-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/
│   │   ├── authenticate.ts
│   │   ├── generate-metadata.ts
│   │   ├── upload-video.ts
│   │   └── set-thumbnail.ts
│   ├── auth/
│   │   └── oauth.ts          # OAuth2 flow + token management
│   ├── metadata/
│   │   └── templates.ts      # SEO templates per mood
│   └── types.ts
├── package.json
├── tsconfig.json
└── README.md                 # Google Cloud setup guide
```

## Google Cloud Setup

1. Create project in Google Cloud Console
2. Enable YouTube Data API v3
3. Create OAuth 2.0 Client ID (Desktop app)
4. Download `client_secret.json` to `~/.youtube-mcp/`
5. Run `authenticate` tool to complete auth flow

## Claude Code Integration

```json
{
  "mcpServers": {
    "youtube": {
      "command": "node",
      "args": ["~/Desktop/youtube-mcp/dist/index.js"]
    }
  }
}
```
