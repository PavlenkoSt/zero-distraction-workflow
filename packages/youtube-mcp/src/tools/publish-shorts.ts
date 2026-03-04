import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import { getAuthClient } from "../auth/oauth.js";
import { generateShortsMetadata } from "../metadata/shorts-templates.js";

interface ShortFile {
  number: number;
  keyword: string;
  filename: string;
  filePath: string;
}

function discoverShorts(directory: string): ShortFile[] {
  const files = fs.readdirSync(directory);
  const shorts: ShortFile[] = [];

  for (const filename of files) {
    if (!filename.toLowerCase().endsWith(".mp4") || filename.startsWith(".")) continue;

    // Match pattern: {number}-{keyword}.mp4
    const match = filename.match(/^(\d+)-(.+)\.mp4$/i);
    if (!match) continue;

    const number = parseInt(match[1], 10);
    const keyword = match[2].replace(/-/g, " ").trim();

    shorts.push({
      number,
      keyword,
      filename,
      filePath: path.join(directory, filename),
    });
  }

  // Sort by number ascending
  shorts.sort((a, b) => a.number - b.number);
  return shorts;
}

export function registerPublishShortsTool(server: McpServer): void {
  server.tool(
    "publish_shorts",
    "Batch-upload YouTube Shorts from a folder of numbered .mp4 files. Filenames must follow the pattern {number}-{keyword}.mp4 (e.g. 1-deep-focus.mp4). Generates SEO metadata from the keyword and uploads each as a private draft.",
    {
      directory: z
        .string()
        .describe("Absolute path to folder containing numbered .mp4 shorts (e.g. 1-deep-focus.mp4, 2-spring-mode.mp4)"),
    },
    async ({ directory }) => {
      const log: string[] = [];
      const results: { filename: string; videoId?: string; error?: string }[] = [];

      try {
        // 1. Validate directory
        if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
          return {
            isError: true,
            content: [{ type: "text", text: `Directory not found: ${directory}` }],
          };
        }

        // 2. Discover shorts
        const shorts = discoverShorts(directory);
        if (shorts.length === 0) {
          return {
            isError: true,
            content: [{ type: "text", text: "No matching .mp4 files found. Expected pattern: {number}-{keyword}.mp4 (e.g. 1-deep-focus.mp4)" }],
          };
        }

        log.push(`Found ${shorts.length} shorts:`);
        for (const s of shorts) {
          const sizeMB = (fs.statSync(s.filePath).size / (1024 * 1024)).toFixed(1);
          log.push(`  ${s.filename} → "${s.keyword}" (${sizeMB} MB)`);
        }

        // 3. Upload each short
        const auth = getAuthClient();
        const youtube = google.youtube({ version: "v3", auth });

        for (const short of shorts) {
          log.push(`\nUploading ${short.filename}...`);

          try {
            const metadata = generateShortsMetadata(short.keyword);

            const response = await youtube.videos.insert({
              part: ["snippet", "status"],
              requestBody: {
                snippet: {
                  title: metadata.title,
                  description: metadata.description,
                  tags: metadata.tags,
                  categoryId: metadata.categoryId,
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
                body: fs.createReadStream(short.filePath),
              },
            });

            const videoId = response.data.id!;
            results.push({ filename: short.filename, videoId });
            log.push(`  ✓ Uploaded! ID: ${videoId}`);
          } catch (err: unknown) {
            let msg: string;
            if (err && typeof err === "object" && "response" in err) {
              const gErr = err as { response?: { status?: number; statusText?: string; data?: unknown } };
              msg = `YouTube API Error ${gErr.response?.status} ${gErr.response?.statusText}`;
            } else {
              msg = err instanceof Error ? err.message : String(err);
            }
            results.push({ filename: short.filename, error: msg });
            log.push(`  ✗ Failed: ${msg}`);
          }
        }

        // 4. Summary
        const succeeded = results.filter((r) => r.videoId);
        const failed = results.filter((r) => r.error);

        const output = [
          "**Shorts batch upload complete!**",
          "",
          ...log.map((l) => `${l}`),
          "",
          "---",
          "",
          `**${results.length} processed, ${succeeded.length} succeeded, ${failed.length} failed**`,
          "",
          ...succeeded.map((r) => `• ${r.filename} → https://studio.youtube.com/video/${r.videoId}/edit`),
          ...failed.map((r) => `• ${r.filename} → FAILED: ${r.error}`),
          "",
          "**Status:** Private (draft)",
          "",
          "**Before publishing, review each in YouTube Studio:**",
          "1. Set Altered content → No",
          "2. Review title and description",
          "3. Change visibility to Public when ready",
        ].join("\n");

        const hasErrors = failed.length > 0;
        return {
          isError: hasErrors && succeeded.length === 0,
          content: [{ type: "text", text: output }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const output = [
          "**Shorts publish failed**",
          "",
          ...log,
          "",
          `**Error:** ${msg}`,
        ].join("\n");
        return { isError: true, content: [{ type: "text", text: output }] };
      }
    },
  );
}
