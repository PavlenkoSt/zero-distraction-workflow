# YouTube Upload MCP Server

MCP server for uploading lofi/ambient music mixes to YouTube as private drafts with auto-generated SEO metadata.

## Setup

### 1. Google Cloud Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **YouTube Data API v3**:
   - Go to APIs & Services > Library
   - Search "YouTube Data API v3"
   - Click Enable
4. Create OAuth credentials:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: **Desktop app**
   - Download the JSON file
5. Save the downloaded file as `~/.youtube-mcp/client_secret.json`:
   ```bash
   mkdir -p ~/.youtube-mcp
   mv ~/Downloads/client_secret_*.json ~/.youtube-mcp/client_secret.json
   ```
6. Configure the OAuth consent screen:
   - Go to APIs & Services > OAuth consent screen
   - User type: External (or Internal if using Workspace)
   - Add your email as a test user

### 2. Build the Server

```bash
cd ~/Desktop/youtube-mcp
npm install
npm run build
```

### 3. Add to Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "node",
      "args": ["/Users/stanislavpavlenko/Desktop/youtube-mcp/dist/index.js"]
    }
  }
}
```

### 4. Authenticate

In Claude Code, run:
> Use the authenticate tool to sign in to YouTube

This opens your browser for Google sign-in. Authorize the app and you're set.

## Tools

### authenticate
Starts the OAuth2 flow. Run once to authorize.

### generate_metadata
Generates SEO-optimized title, description (with chapters), and tags.

Input: track names + timecodes, mood (relax/focus/ambient), optional mix number.

### upload_video
Uploads an MP4 to YouTube as a private draft. Returns video ID and Studio URL.

### set_thumbnail
Sets a custom thumbnail (JPEG/PNG, max 2MB) on an uploaded video.

## Typical Workflow

1. Generate metadata from your track list
2. Review the generated title, description, and tags
3. Upload the video with the metadata
4. Set the custom thumbnail
5. Review and publish in YouTube Studio
