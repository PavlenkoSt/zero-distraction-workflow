#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAuthenticateTool } from "./tools/authenticate.js";
import { registerGenerateMetadataTool } from "./tools/generate-metadata.js";
import { registerUploadVideoTool } from "./tools/upload-video.js";
import { registerSetThumbnailTool } from "./tools/set-thumbnail.js";
import { registerPublishMixTool } from "./tools/publish-mix.js";
import { registerPublishShortsTool } from "./tools/publish-shorts.js";

const server = new McpServer({
  name: "youtube-mcp",
  version: "1.0.0",
});

registerAuthenticateTool(server);
registerGenerateMetadataTool(server);
registerUploadVideoTool(server);
registerSetThumbnailTool(server);
registerPublishMixTool(server);
registerPublishShortsTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
