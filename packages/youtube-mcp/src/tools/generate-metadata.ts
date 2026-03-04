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
      keyword: z
        .string()
        .describe("Video keyword/theme (e.g. 'build the system', 'deep work', 'steady mind') — shapes the description hook, tone, and hashtags"),
      mixNumber: z
        .number()
        .optional()
        .describe("Optional mix number for the title (e.g. 'Mix #11')"),
    },
    async ({ tracks, keyword, mixNumber }) => {
      try {
        const metadata = generateMetadata(tracks, keyword, mixNumber);
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
