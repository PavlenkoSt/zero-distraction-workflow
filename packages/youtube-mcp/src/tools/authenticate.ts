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
