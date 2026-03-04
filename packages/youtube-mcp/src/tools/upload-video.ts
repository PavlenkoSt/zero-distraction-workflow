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
        let msg: string;
        if (err && typeof err === "object" && "response" in err) {
          const gErr = err as { response?: { status?: number; statusText?: string; data?: unknown } };
          msg = `YouTube API Error ${gErr.response?.status} ${gErr.response?.statusText}\n${JSON.stringify(gErr.response?.data, null, 2)}`;
        } else {
          msg = err instanceof Error ? err.message : String(err);
        }
        return { isError: true, content: [{ type: "text", text: msg }] };
      }
    },
  );
}
