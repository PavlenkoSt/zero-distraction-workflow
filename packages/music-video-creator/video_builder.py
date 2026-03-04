"""FFmpeg-based music video builder."""

import csv as csv_module
import json
import os
import re
import subprocess
from dataclasses import dataclass

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"}
TRACK_PATTERN = re.compile(r"^(\d+)-(.+)\.\w+$")


@dataclass
class Track:
    index: int
    name: str
    path: str
    duration: float = 0.0


def parse_folder(folder_path: str) -> tuple[str, list[Track]]:
    """Parse folder to find background image and audio tracks.

    Tracks can be numbered (1-name.mp3) or unnumbered (name.mp3).
    Numbered tracks are sorted by number first, then unnumbered tracks
    are appended in alphabetical order.

    Returns (image_path, sorted_tracks).
    Raises ValueError if image or tracks are missing.
    """
    if not os.path.isdir(folder_path):
        raise ValueError(f"Folder not found: {folder_path}")

    image_path = None
    numbered_tracks = []
    unnumbered_tracks = []

    for fname in os.listdir(folder_path):
        fpath = os.path.join(folder_path, fname)
        if not os.path.isfile(fpath):
            continue
        ext = os.path.splitext(fname)[1].lower()

        if ext in IMAGE_EXTENSIONS and image_path is None:
            image_path = fpath
            continue

        if ext in AUDIO_EXTENSIONS:
            match = TRACK_PATTERN.match(fname)
            if match:
                index = int(match.group(1))
                name = match.group(2)
                numbered_tracks.append(Track(index=index, name=name, path=fpath))
            else:
                name = os.path.splitext(fname)[0]
                unnumbered_tracks.append(Track(index=0, name=name, path=fpath))

    if image_path is None:
        raise ValueError(f"No image file found in {folder_path}. Expected .jpg or .png")

    if not numbered_tracks and not unnumbered_tracks:
        raise ValueError(f"No audio tracks found in {folder_path}. Supported: .mp3, .wav, .flac, .aac, .ogg, .m4a")

    # Numbered first (by number), then unnumbered (alphabetically)
    numbered_tracks.sort(key=lambda t: t.index)
    unnumbered_tracks.sort(key=lambda t: t.name.lower())

    # Assign final sequential indices
    tracks = numbered_tracks + unnumbered_tracks
    for i, track in enumerate(tracks):
        track.index = i + 1

    return image_path, tracks


def probe_duration(file_path: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", file_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {file_path}: {result.stderr}")
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def probe_all_durations(tracks: list[Track]) -> None:
    """Probe and set duration for each track in-place."""
    for track in tracks:
        track.duration = probe_duration(track.path)


def format_timecode(seconds: float) -> str:
    """Format seconds as H:MM:SS."""
    s = int(seconds)
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    return f"{h}:{m:02d}:{sec:02d}"


def calculate_timecodes(tracks: list[Track], fade_duration: float) -> list[dict]:
    """Calculate start/end times for all tracks across two loops.

    No overlap — tracks play back-to-back (each has its own fade-in/fade-out).
    Returns list of dicts with: track_number, track_name, start_seconds, end_seconds, duration, loop.
    """
    full_playlist = tracks + tracks  # two loops
    entries = []
    current_time = 0.0

    for i, track in enumerate(full_playlist):
        start = current_time
        end = start + track.duration

        entries.append({
            "track_number": track.index,
            "track_name": track.name,
            "start_seconds": start,
            "end_seconds": end,
            "duration": track.duration,
            "loop": 1 if i < len(tracks) else 2,
        })
        current_time = end

    return entries


def write_csv(entries: list[dict], output_path: str) -> None:
    """Write timecode entries to CSV file."""
    with open(output_path, "w", newline="") as f:
        writer = csv_module.DictWriter(f, fieldnames=["track_number", "track_name", "start_time", "end_time", "duration"])
        writer.writeheader()
        for entry in entries:
            writer.writerow({
                "track_number": entry["track_number"],
                "track_name": entry["track_name"],
                "start_time": format_timecode(entry["start_seconds"]),
                "end_time": format_timecode(entry["end_seconds"]),
                "duration": format_timecode(entry["duration"]),
            })


def build_audio_filtergraph(durations: list[float], fade_duration: float) -> tuple[str, str]:
    """Build FFmpeg filtergraph: fade-in/fade-out each track, then concatenate.

    Args:
        durations: duration in seconds for each audio input (including both loops)
        fade_duration: fade in/out duration in seconds

    Returns: (filtergraph_string, final_output_label)
    """
    track_count = len(durations)

    if track_count == 1:
        fade_out_start = max(0.0, durations[0] - fade_duration)
        fg = (
            f"[0:a]afade=t=in:st=0:d={fade_duration},"
            f"afade=t=out:st={fade_out_start}:d={fade_duration}[out]"
        )
        return fg, "[out]"

    filters = []
    concat_inputs = ""

    for i, duration in enumerate(durations):
        fade_out_start = max(0.0, duration - fade_duration)
        label = f"[f{i}]"
        filters.append(
            f"[{i}:a]afade=t=in:st=0:d={fade_duration},"
            f"afade=t=out:st={fade_out_start}:d={fade_duration}{label}"
        )
        concat_inputs += label

    filters.append(f"{concat_inputs}concat=n={track_count}:v=0:a=1[out]")
    return ";".join(filters), "[out]"


def merge_audio(tracks: list[Track], fade_duration: float, output_dir: str, log_fn=print) -> str:
    """Merge all tracks (both loops) with fade-in/fade-out transitions.

    Returns path to merged audio file.
    """
    full_playlist = tracks + tracks
    merged_path = os.path.join(output_dir, "_merged_audio.wav")

    input_args = []
    for track in full_playlist:
        input_args.extend(["-i", track.path])

    durations = [track.duration for track in full_playlist]
    filtergraph, final_label = build_audio_filtergraph(durations, fade_duration)

    log_fn(f"Merging {len(full_playlist)} tracks with {fade_duration}s fade-in/fade-out...")

    cmd = [
        "ffmpeg", "-y",
        *input_args,
        "-filter_complex", filtergraph,
        "-map", final_label,
        "-c:a", "pcm_f32le", "-ar", "48000", "-ac", "2",
        merged_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Audio merge failed: {result.stderr[-500:]}")

    log_fn("Audio merge complete.")
    return merged_path


def build_drawtext_filters(entries: list[dict], crossfade: float) -> list[str]:
    """Build drawtext filter strings for track name overlays.

    Each overlay: 1s fade-in + slide-up, 10s hold, 1s fade-out. Total: 12s.
    Appears at the start of every track including the first.
    """
    filters = []

    for i, entry in enumerate(entries):
        t_start = entry["start_seconds"]
        t_end = t_start + 12.0
        track_name = entry["track_name"].replace("'", "'\\''").replace(":", "\\:")

        # Alpha: fade in 0-1 over 1s, hold 10s, fade out over 1s
        alpha_expr = (
            f"if(lt(t-{t_start},1),(t-{t_start}),"
            f"if(lt(t-{t_start},11),1,"
            f"if(lt(t-{t_start},12),1-(t-{t_start}-11),0)))"
        )

        # Y: slide from bottom to lower-third over first 1s, then stay
        y_expr = (
            f"if(lt(t-{t_start},1),"
            f"1080-((1080*0.22)*(t-{t_start})),"
            f"1080*0.78)"
        )

        # Track name text (white, no background)
        filters.append(
            f"drawtext=text='{track_name}'"
            f":fontsize=48:fontcolor=white"
            f":x=(w-text_w)/2:y='{y_expr}'"
            f":alpha='{alpha_expr}'"
            f":enable='between(t,{t_start},{t_end})'"
        )

    return filters


def render_video(
    image_path: str,
    audio_path: str,
    entries: list[dict],
    crossfade: float,
    output_path: str,
    log_fn=print,
) -> str:
    """Render final video: image + audio + text overlays."""
    video_path = os.path.join(output_path, "video_no_chapters.mp4")

    overlay_filters = build_drawtext_filters(entries, crossfade)
    vf_chain = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"
    if overlay_filters:
        vf_chain += "," + ",".join(overlay_filters)

    total_duration = entries[-1]["end_seconds"] if entries else 0
    log_fn("Rendering video with text overlays...")

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-i", audio_path,
        "-vf", vf_chain,
        "-c:v", "libx264", "-tune", "stillimage", "-preset", "medium",
        "-crf", "18",
        "-r", "30", "-g", "60",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "384k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "9999",
        "-t", str(total_duration),
        video_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Video render failed: {result.stderr[-500:]}")

    log_fn("Video render complete.")
    return video_path


def write_chapters_metadata(entries: list[dict], output_dir: str) -> str:
    """Write FFmpeg-format chapter metadata file."""
    metadata_path = os.path.join(output_dir, "_chapters.txt")
    with open(metadata_path, "w") as f:
        f.write(";FFMETADATA1\n")
        for entry in entries:
            start_ms = int(entry["start_seconds"] * 1000)
            end_ms = int(entry["end_seconds"] * 1000)
            loop = entry["loop"]
            title = entry["track_name"]
            if loop == 2:
                title = f"{title} (Repeat)"
            f.write(f"\n[CHAPTER]\nTIMEBASE=1/1000\nSTART={start_ms}\nEND={end_ms}\ntitle={title}\n")
    return metadata_path


def embed_chapters(video_path: str, metadata_path: str, final_output: str, log_fn=print) -> str:
    """Re-mux video with chapter metadata."""
    log_fn("Embedding chapter markers...")

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", metadata_path,
        "-map_metadata", "1",
        "-map", "0:v", "-map", "0:a",
        "-c", "copy",
        final_output,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Chapter embedding failed: {result.stderr[-500:]}")

    log_fn("Chapters embedded.")
    return final_output


def build_video(folder_path: str, output_path: str, log_fn=print) -> dict:
    """Full pipeline: parse → probe → merge audio → render video → chapters → CSV.

    Returns dict with: video_path, csv_path, total_duration, track_count.
    """
    for tool in ["ffmpeg", "ffprobe"]:
        result = subprocess.run(["which", tool], capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"{tool} not found. Please install FFmpeg.")

    os.makedirs(output_path, exist_ok=True)
    fade_duration = 2.0

    # Step 1: Parse inputs
    log_fn("Parsing input folder...")
    image_path, tracks = parse_folder(folder_path)
    log_fn(f"Found image: {os.path.basename(image_path)}")
    log_fn(f"Found {len(tracks)} tracks")

    # Step 2: Probe durations
    log_fn("Probing track durations...")
    probe_all_durations(tracks)
    for t in tracks:
        log_fn(f"  {t.index}. {t.name} — {format_timecode(t.duration)}")

    # Step 2b: Validate minimum duration (1 hour)
    total_track_duration = sum(t.duration for t in tracks)
    min_duration = 3600.0
    if total_track_duration < min_duration:
        raise ValueError(
            f"Total track duration is {format_timecode(total_track_duration)} — "
            f"need at least 1 hour of audio. Add more tracks."
        )
    log_fn(f"Total unique track duration: {format_timecode(total_track_duration)}")

    # Step 3: Calculate timecodes
    entries = calculate_timecodes(tracks, fade_duration)

    # Step 4: Merge audio
    merged_audio = merge_audio(tracks, fade_duration, output_path, log_fn)

    # Step 5: Render video with overlays
    video_no_chapters = render_video(image_path, merged_audio, entries, fade_duration, output_path, log_fn)

    # Step 6: Embed chapters
    final_video = os.path.join(output_path, "video.mp4")
    embed_chapters(video_no_chapters, write_chapters_metadata(entries, output_path), final_video, log_fn)

    # Step 7: Write CSV
    csv_path = os.path.join(output_path, "timecodes.csv")
    write_csv(entries, csv_path)
    log_fn(f"CSV written to {csv_path}")

    # Cleanup temp files
    for tmp in [merged_audio, video_no_chapters, os.path.join(output_path, "_chapters.txt")]:
        if os.path.exists(tmp):
            os.remove(tmp)

    total_duration = entries[-1]["end_seconds"]
    log_fn(f"Done! Video: {final_video} ({format_timecode(total_duration)})")

    return {
        "video_path": final_video,
        "csv_path": csv_path,
        "total_duration": format_timecode(total_duration),
        "track_count": len(tracks),
    }
