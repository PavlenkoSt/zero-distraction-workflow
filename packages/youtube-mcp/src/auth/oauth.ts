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
