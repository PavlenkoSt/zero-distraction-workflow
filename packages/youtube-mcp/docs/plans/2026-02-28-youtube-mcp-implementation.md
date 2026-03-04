# YouTube Upload MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript MCP server that generates SEO metadata and uploads lofi/ambient music mixes to YouTube as private drafts.

**Architecture:** Stdio MCP server with 4 tools (authenticate, generate_metadata, upload_video, set_thumbnail). OAuth2 Desktop flow with localhost redirect for token capture. Template-based metadata generation per mood (relax/focus/ambient).

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, googleapis, zod, open (browser launcher)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Step 1: Initialize npm project**

Run: `cd ~/Desktop/youtube-mcp && npm init -y`

**Step 2: Install dependencies**

Run: `npm install @modelcontextprotocol/sdk googleapis zod open`
Run: `npm install -D typescript @types/node`

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

**Step 4: Update package.json scripts and type**

Add to package.json:
```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "bin": {
    "youtube-mcp": "./dist/index.js"
  }
}
```

**Step 5: Create directory structure**

Run: `mkdir -p src/tools src/auth src/metadata`

**Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: scaffold project with dependencies and tsconfig"
```

---

### Task 2: Types and Constants

**Files:**
- Create: `src/types.ts`

**Step 1: Create types file**

```typescript
export interface Track {
  name: string;
  timecode: string;
}

export type Mood = "relax" | "focus" | "ambient";

export interface GeneratedMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

export interface UploadResult {
  videoId: string;
  url: string;
}

export const CONFIG_DIR = `${process.env.HOME}/.youtube-mcp`;
export const CLIENT_SECRET_PATH = `${CONFIG_DIR}/client_secret.json`;
export const TOKEN_PATH = `${CONFIG_DIR}/credentials.json`;
export const OAUTH_REDIRECT_PORT = 3456;
export const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_REDIRECT_PORT}`;
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add types and constants"
```

---

### Task 3: OAuth2 Authentication Module

**Files:**
- Create: `src/auth/oauth.ts`

**Step 1: Create the OAuth module**

This module handles:
- Loading client credentials from `~/.youtube-mcp/client_secret.json`
- Token persistence to `~/.youtube-mcp/credentials.json`
- Auto-refresh of expired tokens
- First-time auth flow: opens browser, starts local HTTP server to capture redirect code

```typescript
import { google } from "googleapis";
import * as fs from "fs";
import * as http from "http";
import open from "open";
import {
  CONFIG_DIR,
  CLIENT_SECRET_PATH,
  TOKEN_PATH,
  OAUTH_REDIRECT_PORT,
  OAUTH_REDIRECT_URI,
  YOUTUBE_SCOPES,
} from "../types.js";

let oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadClientCredentials(): { clientId: string; clientSecret: string } {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    throw new Error(
      `Client secret not found at ${CLIENT_SECRET_PATH}.\n` +
        "Download it from Google Cloud Console:\n" +
        "1. Go to https://console.cloud.google.com/apis/credentials\n" +
        "2. Create OAuth 2.0 Client ID (Desktop app)\n" +
        "3. Download JSON and save as ~/.youtube-mcp/client_secret.json"
    );
  }
  const raw = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf-8"));
  const creds = raw.installed || raw.web;
  return { clientId: creds.client_id, clientSecret: creds.client_secret };
}

function createOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  const { clientId, clientSecret } = loadClientCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, OAUTH_REDIRECT_URI);
}

function captureAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${OAUTH_REDIRECT_PORT}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Authorization denied</h1><p>You can close this tab.</p>");
        server.close();
        reject(new Error(`Authorization denied: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Authorization successful!</h1><p>You can close this tab and return to Claude Code.</p>"
        );
        server.close();
        resolve(code);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(OAUTH_REDIRECT_PORT, () => {});
    server.on("error", reject);

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out after 2 minutes"));
    }, 120_000);
  });
}

export async function authenticate(): Promise<string> {
  ensureConfigDir();
  const client = createOAuth2Client();

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: YOUTUBE_SCOPES,
    prompt: "consent",
  });

  // Start local server to capture the redirect
  const codePromise = captureAuthCode();

  // Open browser
  await open(authUrl);

  const code = await codePromise;
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Save tokens
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  oauth2Client = client;
  return "Authenticated successfully! Token saved.";
}

export function getAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  if (oauth2Client) return oauth2Client;

  const client = createOAuth2Client();

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      "Not authenticated. Run the 'authenticate' tool first to authorize with YouTube."
    );
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  client.setCredentials(tokens);

  // Auto-save refreshed tokens
  client.on("tokens", (newTokens) => {
    const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    const merged = { ...existing, ...newTokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
  });

  oauth2Client = client;
  return client;
}
```

**Step 2: Commit**

```bash
git add src/auth/oauth.ts
git commit -m "feat: add OAuth2 authentication module with localhost redirect flow"
```

---

### Task 4: Metadata Templates

**Files:**
- Create: `src/metadata/templates.ts`

**Step 1: Create the template-based metadata generator**

Templates are organized by mood. Each generates a title, description with chapters, and SEO tags.

```typescript
import { Track, Mood, GeneratedMetadata } from "../types.js";

const MOOD_CONFIG: Record<
  Mood,
  {
    titlePrefixes: string[];
    titleSuffixes: string[];
    introTemplates: string[];
    baseTags: string[];
  }
> = {
  relax: {
    titlePrefixes: [
      "2 Hours of Lofi Ambient for Deep Relaxation",
      "2 Hours of Calming Lofi Beats to Unwind",
      "2 Hours of Peaceful Ambient Music for Rest",
    ],
    titleSuffixes: ["Chill Mix", "Relaxation Mix", "Ambient Mix"],
    introTemplates: [
      "Unwind and let go with 2 hours of calming lofi ambient music. Perfect for winding down after a long day, meditation, or simply finding your peace.",
      "Take a deep breath and relax. This 2-hour mix of soothing ambient lofi tracks is designed to help you decompress and find tranquility.",
      "Let the gentle waves of ambient sound wash over you. Two hours of carefully curated lofi music to help you rest, recover, and recharge.",
    ],
    baseTags: [
      "lofi",
      "lofi music",
      "ambient music",
      "relaxation music",
      "chill music",
      "calming music",
      "lofi ambient",
      "peaceful music",
      "unwind music",
      "stress relief music",
      "meditation music",
      "lofi mix",
      "ambient mix",
      "2 hour mix",
      "long mix",
      "background music",
      "sleep music",
      "chill beats",
      "lofi beats",
      "soft music",
    ],
  },
  focus: {
    titlePrefixes: [
      "2 Hours of Lofi Beats for Deep Focus & Productivity",
      "2 Hours of Ambient Lofi for Work & Study",
      "2 Hours of Lofi Music to Concentrate",
    ],
    titleSuffixes: ["Focus Mix", "Study Mix", "Work Mix"],
    introTemplates: [
      "Lock in and get things done with 2 hours of focus-enhancing lofi beats. Designed for deep work sessions, studying, and creative flow.",
      "Enter your flow state with this 2-hour collection of ambient lofi tracks. Perfect background music for coding, writing, studying, or any focused work.",
      "Two hours of carefully selected lofi ambient music to keep you in the zone. No distractions, just the right sonic environment for peak productivity.",
    ],
    baseTags: [
      "lofi",
      "lofi music",
      "study music",
      "focus music",
      "lofi beats to study to",
      "coding music",
      "work music",
      "productivity music",
      "lofi hip hop",
      "ambient focus",
      "concentration music",
      "lofi mix",
      "study mix",
      "2 hour mix",
      "long mix",
      "background music",
      "deep focus",
      "lofi beats",
      "chill beats",
      "programming music",
    ],
  },
  ambient: {
    titlePrefixes: [
      "2 Hours of Pure Ambient Soundscapes",
      "2 Hours of Ethereal Ambient Music",
      "2 Hours of Atmospheric Ambient Textures",
    ],
    titleSuffixes: ["Ambient Mix", "Soundscape Mix", "Atmospheric Mix"],
    introTemplates: [
      "Immerse yourself in 2 hours of rich ambient soundscapes. Layers of atmospheric textures that create a space for reflection, creativity, and calm.",
      "Float through two hours of ethereal ambient music. These carefully crafted soundscapes provide the perfect backdrop for any moment of your day.",
      "A journey through sound. Two hours of immersive ambient textures that transform your space into a sanctuary of calm and creativity.",
    ],
    baseTags: [
      "ambient",
      "ambient music",
      "soundscape",
      "atmospheric music",
      "ambient soundscape",
      "ethereal music",
      "ambient textures",
      "dark ambient",
      "light ambient",
      "space ambient",
      "ambient mix",
      "2 hour mix",
      "long mix",
      "background music",
      "ambient electronic",
      "drone music",
      "chill ambient",
      "lofi ambient",
      "cinematic ambient",
      "meditation music",
    ],
  },
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildChapters(tracks: Track[]): string {
  return tracks.map((t) => `${t.timecode} ${t.name}`).join("\n");
}

export function generateMetadata(
  tracks: Track[],
  mood: Mood,
  mixNumber?: number,
): GeneratedMetadata {
  const config = MOOD_CONFIG[mood];

  // Title
  const prefix = pickRandom(config.titlePrefixes);
  const suffix = pickRandom(config.titleSuffixes);
  const title = mixNumber
    ? `${prefix} | ${suffix} #${mixNumber}`
    : `${prefix} | ${suffix}`;

  // Description
  const intro = pickRandom(config.introTemplates);
  const chapters = buildChapters(tracks);

  const hashtags = [
    "#lofi",
    "#ambient",
    "#" + mood,
    "#chillmusic",
    "#lofimix",
  ].join(" ");

  const description = [
    intro,
    "",
    "~ Tracklist ~",
    chapters,
    "",
    "---",
    "",
    `${hashtags}`,
    "",
    "If you enjoy this mix, consider subscribing for more lofi ambient content.",
  ].join("\n");

  return {
    title,
    description,
    tags: config.baseTags,
    categoryId: "10", // Music
  };
}
```

**Step 2: Commit**

```bash
git add src/metadata/templates.ts
git commit -m "feat: add template-based metadata generator for relax/focus/ambient moods"
```

---

### Task 5: Authenticate Tool

**Files:**
- Create: `src/tools/authenticate.ts`

**Step 1: Create the authenticate tool**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { authenticate } from "../auth/oauth.js";
import { CLIENT_SECRET_PATH } from "../types.js";

export function registerAuthenticateTool(server: McpServer): void {
  server.tool(
    "authenticate",
    `Authenticate with YouTube via OAuth2. Opens a browser for Google sign-in. Requires client_secret.json at ${CLIENT_SECRET_PATH}.`,
    {},
    async () => {
      try {
        const message = await authenticate();
        return { content: [{ type: "text", text: message }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: msg }] };
      }
    },
  );
}
```

**Step 2: Commit**

```bash
git add src/tools/authenticate.ts
git commit -m "feat: add authenticate MCP tool"
```

---

### Task 6: Generate Metadata Tool

**Files:**
- Create: `src/tools/generate-metadata.ts`

**Step 1: Create the generate_metadata tool**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateMetadata } from "../metadata/templates.js";

export function registerGenerateMetadataTool(server: McpServer): void {
  server.tool(
    "generate_metadata",
    "Generate SEO-optimized title, description with chapters, and tags for a YouTube lofi/ambient mix video.",
    {
      tracks: z
        .array(
          z.object({
            name: z.string().describe("Track name"),
            timecode: z.string().describe("Timecode in format H:MM:SS or M:SS"),
          }),
        )
        .describe("List of tracks with their timecodes"),
      mood: z
        .enum(["relax", "focus", "ambient"])
        .describe("Mood of the mix — determines title style, description, and tags"),
      mixNumber: z
        .number()
        .optional()
        .describe("Optional mix number for the title (e.g. 'Mix #11')"),
    },
    async ({ tracks, mood, mixNumber }) => {
      try {
        const metadata = generateMetadata(tracks, mood, mixNumber);
        const output = [
          `**Title:** ${metadata.title}`,
          "",
          `**Category:** Music (ID: ${metadata.categoryId})`,
          "",
          "**Description:**",
          "```",
          metadata.description,
          "```",
          "",
          `**Tags (${metadata.tags.length}):** ${metadata.tags.join(", ")}`,
          "",
          "---",
          "Review the metadata above. Pass title, description, and tags to the upload_video tool when ready.",
        ].join("\n");

        return { content: [{ type: "text", text: output }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: msg }] };
      }
    },
  );
}
```

**Step 2: Commit**

```bash
git add src/tools/generate-metadata.ts
git commit -m "feat: add generate_metadata MCP tool"
```

---

### Task 7: Upload Video Tool

**Files:**
- Create: `src/tools/upload-video.ts`

**Step 1: Create the upload_video tool**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { google } from "googleapis";
import * as fs from "fs";
import { getAuthClient } from "../auth/oauth.js";

export function registerUploadVideoTool(server: McpServer): void {
  server.tool(
    "upload_video",
    "Upload a video to YouTube as a private draft. Returns the video ID and URL for review in YouTube Studio.",
    {
      videoPath: z.string().describe("Absolute path to the .mp4 video file"),
      title: z.string().describe("Video title"),
      description: z.string().describe("Video description (with chapters/timecodes)"),
      tags: z.array(z.string()).describe("List of SEO tags/keywords"),
      categoryId: z
        .string()
        .default("10")
        .describe("YouTube category ID (default: 10 = Music)"),
    },
    async ({ videoPath, title, description, tags, categoryId }) => {
      try {
        // Validate file exists
        if (!fs.existsSync(videoPath)) {
          return {
            isError: true,
            content: [{ type: "text", text: `File not found: ${videoPath}` }],
          };
        }

        const stat = fs.statSync(videoPath);
        const fileSizeMB = (stat.size / (1024 * 1024)).toFixed(1);

        const auth = getAuthClient();
        const youtube = google.youtube({ version: "v3", auth });

        const response = await youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody: {
            snippet: {
              title,
              description,
              tags,
              categoryId,
              defaultLanguage: "en",
              defaultAudioLanguage: "en",
            },
            status: {
              privacyStatus: "private",
              selfDeclaredMadeForKids: false,
              embeddable: true,
            },
          },
          media: {
            mimeType: "video/mp4",
            body: fs.createReadStream(videoPath),
          },
        });

        const videoId = response.data.id;
        const url = `https://studio.youtube.com/video/${videoId}/edit`;

        const output = [
          `Video uploaded successfully!`,
          "",
          `**Video ID:** ${videoId}`,
          `**Size:** ${fileSizeMB} MB`,
          `**Status:** Private (draft)`,
          `**Studio URL:** ${url}`,
          "",
          "The video is saved as a private draft. Use set_thumbnail to add a custom thumbnail, then publish from YouTube Studio.",
        ].join("\n");

        return { content: [{ type: "text", text: output }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: msg }] };
      }
    },
  );
}
```

**Step 2: Commit**

```bash
git add src/tools/upload-video.ts
git commit -m "feat: add upload_video MCP tool with resumable upload"
```

---

### Task 8: Set Thumbnail Tool

**Files:**
- Create: `src/tools/set-thumbnail.ts`

**Step 1: Create the set_thumbnail tool**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import { getAuthClient } from "../auth/oauth.js";

export function registerSetThumbnailTool(server: McpServer): void {
  server.tool(
    "set_thumbnail",
    "Set a custom thumbnail on an uploaded YouTube video. Image must be JPEG or PNG, under 2MB.",
    {
      videoId: z.string().describe("YouTube video ID from upload_video result"),
      thumbnailPath: z
        .string()
        .describe("Absolute path to thumbnail image (JPEG or PNG, max 2MB)"),
    },
    async ({ videoId, thumbnailPath }) => {
      try {
        // Validate file exists
        if (!fs.existsSync(thumbnailPath)) {
          return {
            isError: true,
            content: [
              { type: "text", text: `File not found: ${thumbnailPath}` },
            ],
          };
        }

        // Validate file size
        const stat = fs.statSync(thumbnailPath);
        if (stat.size > 2 * 1024 * 1024) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Thumbnail too large: ${(stat.size / (1024 * 1024)).toFixed(1)}MB (max 2MB)`,
              },
            ],
          };
        }

        // Determine MIME type from extension
        const ext = path.extname(thumbnailPath).toLowerCase();
        const mimeType =
          ext === ".png" ? "image/png" : "image/jpeg";

        const auth = getAuthClient();
        const youtube = google.youtube({ version: "v3", auth });

        await youtube.thumbnails.set({
          videoId,
          media: {
            mimeType,
            body: fs.createReadStream(thumbnailPath),
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Thumbnail set successfully for video ${videoId}.\n\nYou can now review and publish at: https://studio.youtube.com/video/${videoId}/edit`,
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: msg }] };
      }
    },
  );
}
```

**Step 2: Commit**

```bash
git add src/tools/set-thumbnail.ts
git commit -m "feat: add set_thumbnail MCP tool"
```

---

### Task 9: Server Entry Point

**Files:**
- Create: `src/index.ts`

**Step 1: Create the MCP server entry point**

```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAuthenticateTool } from "./tools/authenticate.js";
import { registerGenerateMetadataTool } from "./tools/generate-metadata.js";
import { registerUploadVideoTool } from "./tools/upload-video.js";
import { registerSetThumbnailTool } from "./tools/set-thumbnail.js";

const server = new McpServer({
  name: "youtube-mcp",
  version: "1.0.0",
});

registerAuthenticateTool(server);
registerGenerateMetadataTool(server);
registerUploadVideoTool(server);
registerSetThumbnailTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point wiring all tools"
```

---

### Task 10: Build, Verify, and Configure

**Step 1: Build the project**

Run: `cd ~/Desktop/youtube-mcp && npm run build`
Expected: Clean compilation, `dist/` directory created with .js files

**Step 2: Verify dist output**

Run: `ls dist/` and `ls dist/tools/` and `ls dist/auth/` and `ls dist/metadata/`
Expected: All .js files present matching src structure

**Step 3: Add shebang and make executable**

Run: `chmod +x dist/index.js`

**Step 4: Create .gitignore**

Create `.gitignore`:
```
node_modules/
dist/
```

**Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore and verify build"
```

---

### Task 11: README with Setup Guide

**Files:**
- Create: `README.md`

**Step 1: Create README**

```markdown
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
      "args": ["/Users/YOUR_USERNAME/Desktop/youtube-mcp/dist/index.js"]
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with Google Cloud setup guide"
```

---

### Task 12: Register MCP Server in Claude Code Settings

**Step 1: Add MCP server to Claude Code settings**

Add to `~/.claude/settings.json` under `mcpServers`:
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

**Step 2: Verify by restarting Claude Code or running /mcp**

Expected: youtube MCP server listed and connected

**Step 3: Commit settings update (optional — user preference)**
