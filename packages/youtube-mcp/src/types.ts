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
