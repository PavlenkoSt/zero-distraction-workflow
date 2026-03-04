from mcp.server.fastmcp import FastMCP
from video_builder import build_video

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


if __name__ == "__main__":
    mcp.run(transport="stdio")
