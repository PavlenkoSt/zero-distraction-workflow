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
        if (!fs.existsSync(thumbnailPath)) {
          return {
            isError: true,
            content: [
              { type: "text", text: `File not found: ${thumbnailPath}` },
            ],
          };
        }

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

        const ext = path.extname(thumbnailPath).toLowerCase();
        const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

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
