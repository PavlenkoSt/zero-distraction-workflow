"""FFmpeg-based YouTube Shorts builder."""

import json
import os
import re
import subprocess
from video_builder import parse_folder, probe_duration, probe_all_durations, Track
from hook_matcher import load_hooks, match_hooks_to_tracks

SHORTS_DURATION = 10.0
SHORTS_WIDTH = 1080
SHORTS_HEIGHT = 1920

SHORTS_BASE_TAGS = [
    "lofi", "ambient", "focus music", "deep focus",
    "study music", "coding music", "chill beats", "background music",
]

SHORTS_HASHTAGS = ["#lofi", "#ambient", "#focusmusic", "#deepwork", "#studymusic"]

MAX_TITLE_LENGTH = 100


def slugify_track_name(name: str) -> str:
    """Convert track name to URL-friendly slug."""
    return re.sub(r"\s+", "-", name.strip()).lower()


def build_text_filter(text: str) -> str:
    """Build FFmpeg filter for centered text with 1s fade-in, then static.

    Adds a full-screen black overlay at 0.2 opacity for text readability,
    then draws white text centered on screen.
    """
    if not text:
        return ""

    escaped = text.replace("'", "'\\''").replace(":", "\\:").replace("%", "%%")

    overlay = "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.2:t=fill"
    text_filter = (
        f"drawtext=text='{escaped}'"
        f":fontsize=52:fontcolor=white:fontfile=/System/Library/Fonts/Helvetica.ttc"
        f":x=(w-text_w)/2:y=(h-text_h)/2"
        f":alpha='if(lt(t,1),t,1)'"
    )

    return overlay + "," + text_filter


def build_metadata_text(track_name: str, hook: str, thematic_text: str) -> str:
    """Build companion .txt file content with Title, Description, Tags."""
    capitalized = track_name.strip().title()

    # Build title with hashtags (no #shorts)
    title = capitalized
    for tag in SHORTS_HASHTAGS:
        candidate = f"{title} {tag}"
        if len(candidate) > MAX_TITLE_LENGTH:
            break
        title = candidate

    description = (
        f"{hook}\n"
        f"\n"
        f"Subscribe @ZeroDistractionLab for more ambient focus music."
    )

    tags_list = list(SHORTS_BASE_TAGS)
    for word in track_name.lower().split():
        if word not in tags_list:
            tags_list.append(word)

    return (
        f"Title: {title}\n"
        f"Description: {description}\n"
        f"Tags: {', '.join(tags_list)}\n"
    )


def render_short(
    image_path: str,
    track: Track,
    hook: str,
    output_path: str,
    log_fn=print,
) -> str:
    """Render a single 10s portrait short video."""
    slug = slugify_track_name(track.name)
    filename = f"{track.index}-{slug}.mp4"
    video_path = os.path.join(output_path, filename)

    text_filter = build_text_filter(hook)

    vf = (
        f"scale={SHORTS_WIDTH}:{SHORTS_HEIGHT}:force_original_aspect_ratio=increase,"
        f"crop={SHORTS_WIDTH}:{SHORTS_HEIGHT},"
        f"setsar=1"
    )
    if text_filter:
        vf += "," + text_filter

    log_fn(f"Rendering short: {filename} — \"{hook}\"")

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-i", track.path,
        "-map", "0:v", "-map", "1:a",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-r", "30", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
        "-t", str(SHORTS_DURATION),
        video_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Short render failed for {filename}: {result.stderr[-500:]}")

    log_fn(f"Rendered: {filename}")
    return video_path


def build_shorts(folder_path: str, output_path: str, thematic_text: str, log_fn=print) -> dict:
    """Full pipeline: parse folder -> match hooks -> render shorts -> write metadata."""
    for tool in ["ffmpeg", "ffprobe"]:
        result = subprocess.run(["which", tool], capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"{tool} not found. Please install FFmpeg.")

    os.makedirs(output_path, exist_ok=True)

    log_fn("Parsing input folder...")
    image_path, tracks = parse_folder(folder_path)
    log_fn(f"Found image: {os.path.basename(image_path)}")
    log_fn(f"Found {len(tracks)} tracks")

    log_fn("Matching hooks to tracks...")
    hooks = load_hooks()
    matched = match_hooks_to_tracks(hooks, tracks, thematic_text)

    files = []
    for item in matched:
        track = item["track"]
        hook = item["hook"]

        video_path = render_short(image_path, track, hook, output_path, log_fn)

        slug = slugify_track_name(track.name)
        txt_filename = f"{track.index}-{slug}.txt"
        txt_path = os.path.join(output_path, txt_filename)
        metadata = build_metadata_text(track.name, hook, thematic_text)
        with open(txt_path, "w") as f:
            f.write(metadata)
        log_fn(f"Metadata: {txt_filename}")

        files.append({"video": video_path, "metadata": txt_path})

    log_fn(f"Done! Generated {len(files)} shorts in {output_path}")
    return {
        "output_path": output_path,
        "count": len(files),
        "files": files,
    }
