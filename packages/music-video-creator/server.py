import json
from mcp.server.fastmcp import FastMCP
from video_builder import build_video
from shorts_builder import build_shorts

mcp = FastMCP("music-video-creator")


@mcp.tool()
def create_music_video(folder_path: str, output_path: str) -> str:
    """Generate a music video from audio tracks and a background image.

    Takes a folder containing numbered audio tracks (1-name.mp3, 2-name.mp3, etc.)
    and one background image (jpg/png). Produces an MP4 video with:
    - Static background image at 1920x1080
    - All tracks played twice with 2-second crossfade transitions
    - Track name overlays at each transition
    - Chapter markers for each track
    Also generates a CSV file with timecodes.

    Args:
        folder_path: Path to folder with audio tracks and background image
        output_path: Directory where video.mp4 and timecodes.csv will be saved
    """
    logs = []

    def log(msg: str):
        logs.append(msg)

    try:
        result = build_video(folder_path, output_path, log_fn=log)
        summary = "\n".join(logs)
        return f"{summary}\n\nOutput:\n- Video: {result['video_path']}\n- CSV: {result['csv_path']}\n- Duration: {result['total_duration']}\n- Tracks: {result['track_count']}"
    except Exception as e:
        summary = "\n".join(logs) if logs else ""
        return f"Error: {e}\n\nProgress before failure:\n{summary}"


@mcp.tool()
def create_shorts(folder_path: str, output_path: str, track_texts: str = "[]") -> str:
    """Generate YouTube Shorts from audio tracks and a background image.

    Takes a folder containing numbered audio tracks (1-name.mp3, 2-name.mp3, etc.)
    and one background image (jpg/png). Produces portrait videos (1080x1920, 10s each) with:
    - Full-screen background image
    - Track audio (first 10 seconds)
    - Centered text overlay with 1-second fade-in
    Also generates companion .txt files with title, description, and tags.

    Args:
        folder_path: Path to folder with audio tracks and background image
        output_path: Directory where shorts and metadata files will be saved
        track_texts: JSON array of per-track overlay texts, e.g. ["Deep focus mode", "Drift away"]
    """
    logs = []

    def log(msg: str):
        logs.append(msg)

    try:
        texts = json.loads(track_texts) if track_texts else []
        result = build_shorts(folder_path, output_path, texts, log_fn=log)
        summary = "\n".join(logs)
        return f"{summary}\n\nGenerated {result['count']} shorts in {result['output_path']}"
    except Exception as e:
        summary = "\n".join(logs) if logs else ""
        return f"Error: {e}\n\nProgress before failure:\n{summary}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
