import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import { getAuthClient } from "../auth/oauth.js";
import { parseTimelineCsv } from "../metadata/parse-csv.js";
import { generateMetadata } from "../metadata/templates.js";

function findFile(dir: string, ext: string): string | null {
  const files = fs.readdirSync(dir);
  const match = files.find(
    (f) => f.toLowerCase().endsWith(ext) && !f.startsWith("."),
  );
  return match ? path.join(dir, match) : null;
}

export function registerPublishMixTool(server: McpServer): void {
  server.tool(
    "publish_mix",
    "Full automated workflow: parse CSV tracklist, generate metadata, upload video, and set thumbnail. Provide a directory containing .mp4, .png, and .csv files plus a keyword.",
    {
      directory: z
        .string()
        .describe(
          "Absolute path to directory containing .mp4 (video), .png (thumbnail), and .csv (DaVinci Resolve timeline export) files",
        ),
      keyword: z
        .string()
        .describe(
          "Video keyword/theme — the text on the cover (e.g. 'build the system', 'deep work')",
        ),
      mixNumber: z
        .number()
        .optional()
        .describe("Optional mix number for the title"),
    },
    async ({ directory, keyword, mixNumber }) => {
      const log: string[] = [];

      try {
        // 1. Validate directory
        if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
          return {
            isError: true,
            content: [{ type: "text", text: `Directory not found: ${directory}` }],
          };
        }

        // 2. Find files
        const videoPath = findFile(directory, ".mp4");
        const thumbnailPath = findFile(directory, ".png");
        const csvPath = findFile(directory, ".csv");

        if (!videoPath) {
          return {
            isError: true,
            content: [{ type: "text", text: "No .mp4 file found in directory" }],
          };
        }
        if (!thumbnailPath) {
          return {
            isError: true,
            content: [{ type: "text", text: "No .png file found in directory" }],
          };
        }
        if (!csvPath) {
          return {
            isError: true,
            content: [{ type: "text", text: "No .csv file found in directory" }],
          };
        }

        const videoSize = (
          fs.statSync(videoPath).size /
          (1024 * 1024 * 1024)
        ).toFixed(1);
        log.push(`Found video: ${path.basename(videoPath)} (${videoSize} GB)`);
        log.push(`Found thumbnail: ${path.basename(thumbnailPath)}`);
        log.push(`Found timeline: ${path.basename(csvPath)}`);

        // 3. Parse CSV
        const tracks = parseTimelineCsv(csvPath);
        log.push(`Parsed ${tracks.length} tracks (including Repeat marker)`);

        // 4. Generate metadata
        const metadata = generateMetadata(tracks, keyword, mixNumber);
        log.push(`Generated title: ${metadata.title}`);

        // 5. Upload video
        log.push("Uploading video...");
        const auth = getAuthClient();
        const youtube = google.youtube({ version: "v3", auth });

        const uploadResponse = await youtube.videos.insert({
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
            body: fs.createReadStream(videoPath),
          },
        });

        const videoId = uploadResponse.data.id!;
        log.push(`Video uploaded! ID: ${videoId}`);

        // 6. Set thumbnail
        const thumbExt = path.extname(thumbnailPath).toLowerCase();
        const mimeType = thumbExt === ".png" ? "image/png" : "image/jpeg";

        await youtube.thumbnails.set({
          videoId,
          media: {
            mimeType,
            body: fs.createReadStream(thumbnailPath),
          },
        });
        log.push("Thumbnail set!");

        // 7. Summary
        const studioUrl = `https://studio.youtube.com/video/${videoId}/edit`;
        const output = [
          "**Mix published successfully!**",
          "",
          ...log.map((l) => `• ${l}`),
          "",
          `**Video ID:** ${videoId}`,
          `**Status:** Private (draft)`,
          `**Studio URL:** ${studioUrl}`,
          "",
          "**Before publishing, review in YouTube Studio:**",
          "1. Set Altered content → No",
          "2. Review title, description, thumbnail",
          "3. Change visibility to Public when ready",
        ].join("\n");

        return { content: [{ type: "text", text: output }] };
      } catch (err: unknown) {
        let msg: string;
        if (err && typeof err === "object" && "response" in err) {
          const gErr = err as {
            response?: { status?: number; statusText?: string; data?: unknown };
          };
          msg = `YouTube API Error ${gErr.response?.status} ${gErr.response?.statusText}\n${JSON.stringify(gErr.response?.data, null, 2)}`;
        } else {
          msg = err instanceof Error ? err.message : String(err);
        }

        const output = [
          "**Publish failed**",
          "",
          ...log.map((l) => `• ${l}`),
          "",
          `**Error:** ${msg}`,
        ].join("\n");

        return { isError: true, content: [{ type: "text", text: output }] };
      }
    },
  );
}
