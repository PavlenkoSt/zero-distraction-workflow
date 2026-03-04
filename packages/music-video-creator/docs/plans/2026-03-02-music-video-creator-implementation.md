# Music Video Creator MCP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Python MCP server that generates music videos (MP4 + CSV) from audio tracks and a background image using FFmpeg.

**Architecture:** Two-module design — `server.py` (MCP entry with FastMCP, parameter validation) and `video_builder.py` (FFmpeg orchestration via subprocess). Multi-step FFmpeg pipeline: probe durations → merge audio with crossfades → render video with text overlays → embed chapters.

**Tech Stack:** Python 3.13, `mcp` package (official Anthropic SDK), FFmpeg/FFprobe (subprocess), venv for isolation.

---

### Task 1: Project scaffold and venv

**Files:**
- Create: `requirements.txt`
- Create: `server.py` (stub)
- Create: `video_builder.py` (stub)

**Step 1: Create requirements.txt**

```
mcp[cli]
```

**Step 2: Create venv and install dependencies**

Run:
```bash
cd ~/Desktop/music-video-creator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Expected: successful install of `mcp` package with dependencies.

**Step 3: Create server.py stub**

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("music-video-creator")


@mcp.tool()
def create_music_video(folder_path: str, output_path: str) -> str:
    """Generate a music video from audio tracks and a background image.

    Args:
        folder_path: Path to folder containing audio tracks (numbered: 1-name.mp3, 2-name.mp3) and one image file (jpg/png)
        output_path: Path where output files (video.mp4 and timecodes.csv) will be saved
    """
    return "Not implemented yet"


if __name__ == "__main__":
    mcp.run(transport="stdio")
```

**Step 4: Create video_builder.py stub**

```python
"""FFmpeg-based music video builder."""


def build_video(folder_path: str, output_path: str) -> dict:
    """Build a music video from audio tracks and a background image.

    Returns dict with keys: video_path, csv_path, total_duration, track_count
    """
    raise NotImplementedError
```

**Step 5: Verify server starts**

Run:
```bash
cd ~/Desktop/music-video-creator
.venv/bin/python server.py &
# Should start without errors, then kill it
kill %1
```

**Step 6: Commit**

```bash
git init
git add requirements.txt server.py video_builder.py
git commit -m "feat: project scaffold with MCP server stub"
```

---

### Task 2: Input parsing and validation

**Files:**
- Modify: `video_builder.py`
- Create: `tests/test_parsing.py`

**Step 1: Write tests for input parsing**

Create `tests/__init__.py` (empty) and `tests/test_parsing.py`:

```python
import os
import tempfile
from video_builder import parse_folder, Track


def _make_folder(files: list[str]) -> str:
    """Create a temp folder with empty files."""
    d = tempfile.mkdtemp()
    for f in files:
        open(os.path.join(d, f), "w").close()
    return d


def test_parse_finds_image_and_tracks():
    d = _make_folder(["cover.png", "1-intro.mp3", "2-deep focus.mp3", "3-outro.mp3"])
    image, tracks = parse_folder(d)
    assert image.endswith("cover.png")
    assert len(tracks) == 3
    assert tracks[0].name == "intro"
    assert tracks[1].name == "deep focus"
    assert tracks[2].name == "outro"
    assert tracks[0].index == 1
    assert tracks[1].index == 2


def test_parse_sorts_by_numeric_prefix():
    d = _make_folder(["cover.jpg", "3-c.mp3", "1-a.mp3", "2-b.mp3"])
    _, tracks = parse_folder(d)
    assert [t.name for t in tracks] == ["a", "b", "c"]


def test_parse_no_image_raises():
    d = _make_folder(["1-a.mp3"])
    try:
        parse_folder(d)
        assert False, "Should have raised"
    except ValueError as e:
        assert "image" in str(e).lower()


def test_parse_no_tracks_raises():
    d = _make_folder(["cover.png"])
    try:
        parse_folder(d)
        assert False, "Should have raised"
    except ValueError as e:
        assert "track" in str(e).lower()
```

**Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_parsing.py -v`
Expected: FAIL (ImportError — `parse_folder` doesn't exist yet)

**Step 3: Implement parse_folder in video_builder.py**

```python
"""FFmpeg-based music video builder."""

import os
import re
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
    """Parse folder to find background image and numbered audio tracks.

    Returns (image_path, sorted_tracks).
    Raises ValueError if image or tracks are missing.
    """
    if not os.path.isdir(folder_path):
        raise ValueError(f"Folder not found: {folder_path}")

    image_path = None
    tracks = []

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
                tracks.append(Track(index=index, name=name, path=fpath))

    if image_path is None:
        raise ValueError(f"No image file found in {folder_path}. Expected .jpg or .png")

    if not tracks:
        raise ValueError(f"No numbered audio tracks found in {folder_path}. Expected format: 1-trackname.mp3")

    tracks.sort(key=lambda t: t.index)
    return image_path, tracks
```

**Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_parsing.py -v`
Expected: all 4 tests PASS

**Step 5: Commit**

```bash
git add video_builder.py tests/
git commit -m "feat: input folder parsing with validation"
```

---

### Task 3: Duration probing and timecode calculation

**Files:**
- Modify: `video_builder.py`
- Create: `tests/test_timecodes.py`

**Step 1: Write tests for timecode calculation**

```python
from video_builder import Track, calculate_timecodes, format_timecode

CROSSFADE = 2.0


def _tracks(durations: list[float]) -> list[Track]:
    return [Track(index=i + 1, name=f"track{i + 1}", path=f"/tmp/{i}.mp3", duration=d) for i, d in enumerate(durations)]


def test_format_timecode():
    assert format_timecode(0) == "0:00:00"
    assert format_timecode(61) == "0:01:01"
    assert format_timecode(3661) == "1:01:01"
    assert format_timecode(7200) == "2:00:00"


def test_single_track_timecodes():
    tracks = _tracks([300.0])  # 5 min
    entries = calculate_timecodes(tracks, CROSSFADE)
    # Two loops: loop1 track1, loop2 track1
    assert len(entries) == 2
    assert entries[0]["start_seconds"] == 0
    assert entries[0]["end_seconds"] == 300.0 - 1.0  # half crossfade before next
    assert entries[1]["start_seconds"] == 300.0 - CROSSFADE  # crossfade overlap


def test_two_track_timecodes():
    tracks = _tracks([100.0, 200.0])  # 2 tracks
    entries = calculate_timecodes(tracks, CROSSFADE)
    # 2 tracks × 2 loops = 4 entries
    assert len(entries) == 4
    # Track 1 starts at 0
    assert entries[0]["start_seconds"] == 0
    # Track 2 starts at 100 - 2 = 98
    assert entries[1]["start_seconds"] == 98.0
    # Loop 2 track 1 starts at 98 + 200 - 2 = 296
    assert entries[2]["start_seconds"] == 296.0


def test_total_duration():
    tracks = _tracks([100.0, 200.0, 150.0])
    entries = calculate_timecodes(tracks, CROSSFADE)
    # 6 tracks total (3×2), 5 crossfades
    # Total = (100+200+150)*2 - 5*2 = 900 - 10 = 890
    last = entries[-1]
    assert last["end_seconds"] == 890.0
```

**Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_timecodes.py -v`
Expected: FAIL (ImportError)

**Step 3: Implement probe_durations and calculate_timecodes**

Add to `video_builder.py`:

```python
import json
import subprocess


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


def calculate_timecodes(tracks: list[Track], crossfade: float) -> list[dict]:
    """Calculate start/end times for all tracks across two loops.

    Returns list of dicts with: track_number, track_name, start_seconds, end_seconds, duration, loop.
    """
    full_playlist = tracks + tracks  # two loops
    entries = []
    current_time = 0.0

    for i, track in enumerate(full_playlist):
        start = current_time
        end = start + track.duration
        if i < len(full_playlist) - 1:
            # This track overlaps with next by crossfade duration
            next_start = end - crossfade
        else:
            next_start = end  # last track plays fully

        entries.append({
            "track_number": track.index,
            "track_name": track.name,
            "start_seconds": start,
            "end_seconds": next_start if i < len(full_playlist) - 1 else end,
            "duration": track.duration,
            "loop": 1 if i < len(tracks) else 2,
        })
        current_time = next_start if i < len(full_playlist) - 1 else end

    return entries
```

**Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_timecodes.py -v`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add video_builder.py tests/test_timecodes.py
git commit -m "feat: duration probing and timecode calculation"
```

---

### Task 4: CSV generation

**Files:**
- Modify: `video_builder.py`
- Create: `tests/test_csv.py`

**Step 1: Write test**

```python
import csv
import os
import tempfile
from video_builder import Track, calculate_timecodes, write_csv

CROSSFADE = 2.0


def test_write_csv():
    tracks = [
        Track(index=1, name="intro", path="/tmp/1.mp3", duration=120.0),
        Track(index=2, name="deep focus", path="/tmp/2.mp3", duration=180.0),
    ]
    entries = calculate_timecodes(tracks, CROSSFADE)
    out = os.path.join(tempfile.mkdtemp(), "timecodes.csv")
    write_csv(entries, out)

    with open(out) as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    assert len(rows) == 4  # 2 tracks × 2 loops
    assert rows[0]["track_name"] == "intro"
    assert rows[0]["start_time"] == "0:00:00"
    assert "track_number" in rows[0]
    assert "end_time" in rows[0]
    assert "duration" in rows[0]
```

**Step 2: Run test, verify fail**

Run: `.venv/bin/python -m pytest tests/test_csv.py -v`

**Step 3: Implement write_csv**

Add to `video_builder.py`:

```python
import csv as csv_module


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
```

**Step 4: Run test, verify pass**

Run: `.venv/bin/python -m pytest tests/test_csv.py -v`

**Step 5: Commit**

```bash
git add video_builder.py tests/test_csv.py
git commit -m "feat: CSV timecode generation"
```

---

### Task 5: FFmpeg audio merge with crossfades

**Files:**
- Modify: `video_builder.py`

This is the core FFmpeg logic. No unit test — will be verified by integration test in Task 8.

**Step 1: Implement build_audio_filtergraph and merge_audio**

Add to `video_builder.py`:

```python
import tempfile


def build_audio_filtergraph(track_count: int, crossfade: float) -> tuple[list[str], str]:
    """Build FFmpeg filtergraph for crossfading all tracks.

    Args:
        track_count: total number of audio inputs (including both loops)
        crossfade: crossfade duration in seconds

    Returns: (filter_lines, final_output_label)
    """
    if track_count == 1:
        return [], "[0:a]"

    filters = []
    prev_label = "[0:a]"

    for i in range(1, track_count):
        input_label = f"[{i}:a]"
        output_label = f"[cf{i}]"
        filters.append(
            f"{prev_label}{input_label}acrossfade=d={crossfade}:c1=tri:c2=tri{output_label}"
        )
        prev_label = output_label

    return filters, prev_label


def merge_audio(tracks: list[Track], crossfade: float, output_dir: str, log_fn=print) -> str:
    """Merge all tracks (both loops) into a single audio file with crossfades.

    Returns path to merged audio file.
    """
    full_playlist = tracks + tracks
    merged_path = os.path.join(output_dir, "_merged_audio.wav")

    if len(full_playlist) == 1:
        # Single track, just copy
        subprocess.run(
            ["ffmpeg", "-y", "-i", full_playlist[0].path, "-c:a", "pcm_s16le", merged_path],
            check=True, capture_output=True
        )
        return merged_path

    # Build input args
    input_args = []
    for track in full_playlist:
        input_args.extend(["-i", track.path])

    # Build filtergraph
    filter_lines, final_label = build_audio_filtergraph(len(full_playlist), crossfade)
    filtergraph = ";".join(filter_lines)

    log_fn(f"Merging {len(full_playlist)} tracks with {crossfade}s crossfades...")

    cmd = [
        "ffmpeg", "-y",
        *input_args,
        "-filter_complex", filtergraph,
        "-map", final_label,
        "-c:a", "pcm_s16le",
        merged_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Audio merge failed: {result.stderr[-500:]}")

    log_fn("Audio merge complete.")
    return merged_path
```

**Step 2: Commit**

```bash
git add video_builder.py
git commit -m "feat: FFmpeg audio merge with crossfades"
```

---

### Task 6: FFmpeg video render with text overlays

**Files:**
- Modify: `video_builder.py`

**Step 1: Implement build_drawtext_filters and render_video**

Add to `video_builder.py`:

```python
def build_drawtext_filters(entries: list[dict], crossfade: float) -> list[str]:
    """Build drawtext + drawbox filter strings for track name overlays.

    Each overlay: 1s fade-in + slide-up, 10s hold, 1s fade-out. Total: 12s.
    Appears at the start of each track (except the very first track of loop 1).
    """
    filters = []

    for i, entry in enumerate(entries):
        if i == 0:
            continue  # Skip first track — video starts with it, no transition

        t_start = entry["start_seconds"]
        t_end = t_start + 12.0
        track_name = entry["track_name"].replace("'", "'\\''").replace(":", "\\:")

        # Alpha expression: fade in 0-1 over 1s, hold 10s, fade out over 1s
        alpha_expr = (
            f"if(lt(t-{t_start},1),(t-{t_start}),"
            f"if(lt(t-{t_start},11),1,"
            f"if(lt(t-{t_start},12),1-(t-{t_start}-11),0)))"
        )

        # Y position: slide from h (bottom) to h*0.78 over first 1s, then stay
        y_expr = (
            f"if(lt(t-{t_start},1),"
            f"h-( (h*0.22) * (t-{t_start}) ),"
            f"h*0.78)"
        )

        # Dark background bar
        box_enable = f"between(t,{t_start},{t_end})"
        filters.append(
            f"drawbox=x=0:y=h*0.74:w=iw:h=h*0.12:color=black@0.5:t=fill:enable='{box_enable}'"
        )

        # Track name text
        filters.append(
            f"drawtext=text='{track_name}'"
            f":fontsize=48:fontcolor=white"
            f":x=(w-text_w)/2:y={y_expr}"
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
    """Render final video: image + audio + text overlays.

    Returns path to rendered MP4.
    """
    video_path = os.path.join(output_path, "video_no_chapters.mp4")

    # Calculate total duration from entries
    last = entries[-1]
    total_duration = last["end_seconds"]

    # Build filter: scale image, then chain drawtext filters
    overlay_filters = build_drawtext_filters(entries, crossfade)
    vf_chain = f"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"
    if overlay_filters:
        vf_chain += "," + ",".join(overlay_filters)

    log_fn("Rendering video with text overlays...")

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-i", audio_path,
        "-vf", vf_chain,
        "-c:v", "libx264", "-tune", "stillimage", "-preset", "medium",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-pix_fmt", "yuv420p",
        video_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Video render failed: {result.stderr[-500:]}")

    log_fn("Video render complete.")
    return video_path
```

**Step 2: Commit**

```bash
git add video_builder.py
git commit -m "feat: video render with text overlays"
```

---

### Task 7: Chapter metadata embedding

**Files:**
- Modify: `video_builder.py`

**Step 1: Implement write_chapters_metadata and embed_chapters**

Add to `video_builder.py`:

```python
def write_chapters_metadata(entries: list[dict], output_dir: str) -> str:
    """Write FFmpeg-format chapter metadata file.

    Returns path to metadata file.
    """
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
    """Re-mux video with chapter metadata.

    Returns path to final video.
    """
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
```

**Step 2: Commit**

```bash
git add video_builder.py
git commit -m "feat: chapter metadata embedding"
```

---

### Task 8: Orchestrate build_video and wire up server.py

**Files:**
- Modify: `video_builder.py` (add `build_video` orchestrator)
- Modify: `server.py` (wire up the tool)

**Step 1: Implement build_video orchestrator**

Add to `video_builder.py`:

```python
def build_video(folder_path: str, output_path: str, log_fn=print) -> dict:
    """Full pipeline: parse → probe → merge audio → render video → chapters → CSV.

    Returns dict with: video_path, csv_path, total_duration, track_count.
    """
    # Validate ffmpeg is available
    for tool in ["ffmpeg", "ffprobe"]:
        result = subprocess.run(["which", tool], capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"{tool} not found. Please install FFmpeg.")

    os.makedirs(output_path, exist_ok=True)
    crossfade = 2.0

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

    # Step 3: Calculate timecodes
    entries = calculate_timecodes(tracks, crossfade)

    # Step 4: Merge audio
    merged_audio = merge_audio(tracks, crossfade, output_path, log_fn)

    # Step 5: Render video with overlays
    video_no_chapters = render_video(image_path, merged_audio, entries, crossfade, output_path, log_fn)

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
```

**Step 2: Wire up server.py**

Replace `server.py` with:

```python
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
```

**Step 3: Commit**

```bash
git add server.py video_builder.py
git commit -m "feat: full pipeline orchestration and MCP tool wiring"
```

---

### Task 9: README

**Files:**
- Create: `README.md`

**Step 1: Write README**

````markdown
# music-video-creator

A Claude Code MCP server that generates music videos from audio tracks and a background image.

## What it does

Given a folder of numbered audio tracks and a background image, this tool creates:

1. **MP4 video** — static background at 1920x1080, all tracks concatenated twice with 2-second crossfade transitions, track name text overlays at each transition, chapter markers
2. **CSV file** — timecodes for every track across both loops

## Prerequisites

- Python 3.10+
- FFmpeg and FFprobe installed (`brew install ffmpeg` on macOS)

## Install

```bash
cd ~/Desktop/music-video-creator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Register with Claude Code

```bash
claude mcp add music-video-creator -- ~/Desktop/music-video-creator/.venv/bin/python ~/Desktop/music-video-creator/server.py
```

## Input folder structure

```
my-mix/
  cover.png              # Background image (jpg or png)
  1-morning light.mp3    # Track 1
  2-deep focus.mp3       # Track 2
  3-flow state.mp3       # Track 3
  ...
```

Tracks must be named with a numeric prefix: `{number}-{name}.mp3`

## Usage

In Claude Code, say:

> Create a music video from the tracks in ~/Music/my-mix and save the output to ~/Movies/my-mix-output

Claude will call `create_music_video` with those paths and produce `video.mp4` + `timecodes.csv` in the output directory.
````

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install and usage instructions"
```

---

### Task 10: Integration test with real files

**Step 1: Create a small test folder with short audio samples**

Use ffmpeg to generate 3 short test tones (5 seconds each):

```bash
mkdir -p /tmp/test-music-video
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5" /tmp/test-music-video/1-test-tone-a.mp3
ffmpeg -y -f lavfi -i "sine=frequency=550:duration=5" /tmp/test-music-video/2-test-tone-b.mp3
ffmpeg -y -f lavfi -i "sine=frequency=660:duration=5" /tmp/test-music-video/3-test-tone-c.mp3
# Create a simple test image
ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:d=1" -frames:v 1 /tmp/test-music-video/background.png
```

**Step 2: Run the tool directly**

```bash
cd ~/Desktop/music-video-creator
.venv/bin/python -c "
from video_builder import build_video
result = build_video('/tmp/test-music-video', '/tmp/test-music-video-output')
print(result)
"
```

Expected: video.mp4 and timecodes.csv created in output directory. Total duration ≈ 3 tracks × 2 loops × 5s - 5 crossfades × 2s = 20s.

**Step 3: Verify outputs**

```bash
ffprobe /tmp/test-music-video-output/video.mp4 2>&1 | grep Duration
cat /tmp/test-music-video-output/timecodes.csv
ffprobe -show_chapters /tmp/test-music-video-output/video.mp4 2>&1 | grep title
```

**Step 4: Register with Claude Code and test**

```bash
claude mcp add music-video-creator -- ~/Desktop/music-video-creator/.venv/bin/python ~/Desktop/music-video-creator/server.py
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: integration tested, ready for use"
```
