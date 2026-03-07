# YouTube Shorts Generation & Publishing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate portrait YouTube Shorts (10s each) from image + tracks + thematic text with typing animation, and publish them with companion metadata files.

**Architecture:** New `shorts_builder.py` module in `music-video-creator` handles video generation using FFmpeg (same patterns as `video_builder.py`). Pre-generated `hooks.json` provides 200 hook lines matched to tracks by keyword overlap. The existing `publish_shorts` tool in `youtube-mcp` is extended to read companion `.txt` files for metadata.

**Tech Stack:** Python + FFmpeg (video generation), TypeScript (youtube-mcp publish tool)

---

### Task 1: Generate hooks.json

**Files:**
- Create: `packages/music-video-creator/hooks.json`

**Step 1: Generate 200 hook lines**

Write a JSON file with 200 short, punchy hook lines suited for Zero Distraction Lab YouTube Shorts. These are ambient/lofi/focus-themed — meditative, evocative, minimal. Each line should be 3-8 words, no hashtags, no emojis.

```json
[
  "Let silence do the work",
  "Your focus starts here",
  ...
]
```

**Step 2: Commit**

```bash
git add packages/music-video-creator/hooks.json
git commit -m "feat: add 200 pre-generated hook lines for shorts"
```

---

### Task 2: Hook matching module

**Files:**
- Create: `packages/music-video-creator/hook_matcher.py`
- Create: `packages/music-video-creator/tests/test_hook_matcher.py`

**Step 1: Write the failing tests**

```python
# tests/test_hook_matcher.py
from hook_matcher import load_hooks, match_hooks_to_tracks
from video_builder import Track


def test_load_hooks_returns_list():
    hooks = load_hooks()
    assert isinstance(hooks, list)
    assert len(hooks) == 200
    assert all(isinstance(h, str) for h in hooks)


def test_match_hooks_returns_unique_hooks_per_track():
    hooks = ["Deep focus begins now", "Rain washes everything away", "Drift into the silence",
             "Let the night carry you", "Morning light awaits"]
    tracks = [
        Track(index=1, name="midnight rain", path="/tmp/1.mp3"),
        Track(index=2, name="morning drift", path="/tmp/2.mp3"),
        Track(index=3, name="deep silence", path="/tmp/3.mp3"),
    ]
    result = match_hooks_to_tracks(hooks, tracks, "lofi ambient focus")
    assert len(result) == 3
    # Each track gets a unique hook
    hook_texts = [r["hook"] for r in result]
    assert len(set(hook_texts)) == 3
    # Each result has track and hook
    for r in result:
        assert "track" in r
        assert "hook" in r


def test_match_hooks_with_more_tracks_than_hooks():
    hooks = ["Focus now", "Drift away"]
    tracks = [
        Track(index=1, name="a", path="/tmp/1.mp3"),
        Track(index=2, name="b", path="/tmp/2.mp3"),
        Track(index=3, name="c", path="/tmp/3.mp3"),
    ]
    result = match_hooks_to_tracks(hooks, tracks, "focus")
    assert len(result) == 3
    # All tracks get a hook even if pool is smaller (hooks can repeat as last resort)
    assert all(r["hook"] for r in result)
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/music-video-creator && python -m pytest tests/test_hook_matcher.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'hook_matcher'`

**Step 3: Implement hook_matcher.py**

```python
"""Hook matching: load pre-generated hooks and match to tracks by keyword overlap."""

import json
import os
from video_builder import Track


def load_hooks() -> list[str]:
    """Load hooks from hooks.json in the same directory as this module."""
    hooks_path = os.path.join(os.path.dirname(__file__), "hooks.json")
    with open(hooks_path) as f:
        return json.load(f)


def _score(hook: str, track_name: str, thematic_text: str) -> int:
    """Score a hook against a track name + thematic text by keyword overlap."""
    hook_words = set(hook.lower().split())
    target_words = set(track_name.lower().replace("-", " ").split())
    target_words.update(thematic_text.lower().split())
    return len(hook_words & target_words)


def match_hooks_to_tracks(
    hooks: list[str],
    tracks: list[Track],
    thematic_text: str,
) -> list[dict]:
    """Match best unique hook to each track.

    Returns list of {"track": Track, "hook": str} sorted by track index.
    """
    used: set[int] = set()
    results = []

    for track in tracks:
        scored = []
        for i, hook in enumerate(hooks):
            score = _score(hook, track.name, thematic_text)
            scored.append((score, i, hook))
        scored.sort(key=lambda x: (-x[0], x[1]))

        # Pick first unused hook
        chosen_hook = None
        for score, idx, hook in scored:
            if idx not in used:
                chosen_hook = hook
                used.add(idx)
                break

        # Fallback if all hooks used (more tracks than hooks)
        if chosen_hook is None:
            chosen_hook = scored[0][2]

        results.append({"track": track, "hook": chosen_hook})

    return results
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/music-video-creator && python -m pytest tests/test_hook_matcher.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/music-video-creator/hook_matcher.py packages/music-video-creator/tests/test_hook_matcher.py
git commit -m "feat: add hook matcher module for shorts"
```

---

### Task 3: Shorts video renderer

**Files:**
- Create: `packages/music-video-creator/shorts_builder.py`
- Create: `packages/music-video-creator/tests/test_shorts_builder.py`

**Step 1: Write the failing tests**

```python
# tests/test_shorts_builder.py
from shorts_builder import build_typing_filter, build_metadata_text, slugify_track_name


def test_slugify_track_name():
    assert slugify_track_name("Midnight Rain") == "midnight-rain"
    assert slugify_track_name("deep   focus") == "deep-focus"


def test_build_typing_filter_returns_drawtext():
    result = build_typing_filter("Let silence work", duration=10.0)
    assert "drawtext=" in result
    # Should contain enable expressions for character-by-character reveal
    assert "enable=" in result


def test_build_metadata_text():
    text = build_metadata_text(
        track_name="Midnight Rain",
        hook="Let silence do the work",
        thematic_text="lofi ambient focus",
    )
    assert "Title:" in text
    assert "Description:" in text
    assert "Tags:" in text
    assert "Let silence do the work" in text
    assert "#shorts" not in text
    assert "@ZeroDistractionLab" in text
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/music-video-creator && python -m pytest tests/test_shorts_builder.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Implement shorts_builder.py**

```python
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


def build_typing_filter(text: str, duration: float) -> str:
    """Build FFmpeg drawtext filter for character-by-character typing animation.

    Characters appear evenly across the first 60% of duration, then hold.
    White text, centered vertically and horizontally.
    """
    # Typing occupies first 60% of duration
    typing_duration = duration * 0.6
    char_count = len(text)
    if char_count == 0:
        return ""

    char_interval = typing_duration / char_count

    # Build drawtext filters — one per character
    filters = []
    for i, char in enumerate(text):
        if char == " ":
            continue  # spaces handled by x positioning

        appear_time = i * char_interval

        # Calculate the substring up to this character for x centering
        # We show the full text but control alpha per character
        # Simpler approach: use a single drawtext with text length expression

    # Simpler approach: single drawtext, reveal via textlen trick
    # Use drawtext with expansion=normal and enable based on time
    # Show progressively more characters using text substring

    # Build a chain of drawtext filters, each showing one more character
    escaped_text = text.replace("'", "'\\''").replace(":", "\\:").replace("%", "%%")
    filters = []

    for i in range(1, char_count + 1):
        partial = text[:i]
        escaped_partial = partial.replace("'", "'\\''").replace(":", "\\:").replace("%", "%%")
        t_start = (i - 1) * char_interval
        t_end = i * char_interval if i < char_count else duration

        filters.append(
            f"drawtext=text='{escaped_partial}'"
            f":fontsize=52:fontcolor=white:fontfile=/System/Library/Fonts/Helvetica.ttc"
            f":x=(w-text_w)/2:y=(h-text_h)/2"
            f":enable='between(t,{t_start:.3f},{t_end:.3f})'"
        )

    # Final hold: show complete text for remaining duration
    escaped_full = text.replace("'", "'\\''").replace(":", "\\:").replace("%", "%%")
    filters.append(
        f"drawtext=text='{escaped_full}'"
        f":fontsize=52:fontcolor=white:fontfile=/System/Library/Fonts/Helvetica.ttc"
        f":x=(w-text_w)/2:y=(h-text_h)/2"
        f":enable='gte(t,{typing_duration:.3f})'"
    )

    return ",".join(filters)


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
    """Render a single 10s portrait short video.

    Returns path to the output .mp4 file.
    """
    slug = slugify_track_name(track.name)
    filename = f"{track.index}-{slug}.mp4"
    video_path = os.path.join(output_path, filename)

    typing_filter = build_typing_filter(hook, SHORTS_DURATION)

    # Video filter: scale image to fill 1080x1920 portrait
    vf = (
        f"scale={SHORTS_WIDTH}:{SHORTS_HEIGHT}:force_original_aspect_ratio=increase,"
        f"crop={SHORTS_WIDTH}:{SHORTS_HEIGHT},"
        f"setsar=1"
    )
    if typing_filter:
        vf += "," + typing_filter

    log_fn(f"Rendering short: {filename} — \"{hook}\"")

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-i", track.path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-r", "30", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
        "-t", str(SHORTS_DURATION),
        "-movflags", "+faststart",
        video_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Short render failed for {filename}: {result.stderr[-500:]}")

    log_fn(f"Rendered: {filename}")
    return video_path


def build_shorts(folder_path: str, output_path: str, thematic_text: str, log_fn=print) -> dict:
    """Full pipeline: parse folder -> match hooks -> render shorts -> write metadata.

    Returns dict with: output_path, count, files list.
    """
    for tool in ["ffmpeg", "ffprobe"]:
        result = subprocess.run(["which", tool], capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"{tool} not found. Please install FFmpeg.")

    os.makedirs(output_path, exist_ok=True)

    # Step 1: Parse inputs
    log_fn("Parsing input folder...")
    image_path, tracks = parse_folder(folder_path)
    log_fn(f"Found image: {os.path.basename(image_path)}")
    log_fn(f"Found {len(tracks)} tracks")

    # Step 2: Load and match hooks
    log_fn("Matching hooks to tracks...")
    hooks = load_hooks()
    matched = match_hooks_to_tracks(hooks, tracks, thematic_text)

    # Step 3: Render each short + write metadata
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
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/music-video-creator && python -m pytest tests/test_shorts_builder.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/music-video-creator/shorts_builder.py packages/music-video-creator/tests/test_shorts_builder.py
git commit -m "feat: add shorts video renderer with typing animation"
```

---

### Task 4: Register create_shorts MCP tool

**Files:**
- Modify: `packages/music-video-creator/server.py`

**Step 1: Add the create_shorts tool to server.py**

Add after the existing `create_music_video` tool:

```python
from shorts_builder import build_shorts

@mcp.tool()
def create_shorts(folder_path: str, output_path: str, thematic_text: str) -> str:
    """Generate YouTube Shorts from audio tracks and a background image.

    Takes a folder containing numbered audio tracks (1-name.mp3, 2-name.mp3, etc.)
    and one background image (jpg/png). Produces portrait videos (1080x1920, 10s each) with:
    - Full-screen background image
    - Track audio (first 10 seconds)
    - Typing text animation with a matched hook line
    Also generates companion .txt files with title, description, and tags.

    Args:
        folder_path: Path to folder with audio tracks and background image
        output_path: Directory where shorts and metadata files will be saved
        thematic_text: Theme description for hook matching (e.g. "lofi ambient focus music")
    """
    logs = []

    def log(msg: str):
        logs.append(msg)

    try:
        result = build_shorts(folder_path, output_path, thematic_text, log_fn=log)
        summary = "\n".join(logs)
        return f"{summary}\n\nGenerated {result['count']} shorts in {result['output_path']}"
    except Exception as e:
        summary = "\n".join(logs) if logs else ""
        return f"Error: {e}\n\nProgress before failure:\n{summary}"
```

**Step 2: Verify the server imports work**

Run: `cd packages/music-video-creator && python -c "from server import mcp; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add packages/music-video-creator/server.py
git commit -m "feat: register create_shorts MCP tool"
```

---

### Task 5: Update publish_shorts to read companion .txt files

**Files:**
- Modify: `packages/youtube-mcp/src/tools/publish-shorts.ts`

**Step 1: Add .txt file parsing function**

Add before the `registerPublishShortsTool` function in `publish-shorts.ts`:

```typescript
interface ParsedMetadata {
  title: string;
  description: string;
  tags: string[];
}

function parseMetadataFile(txtPath: string): ParsedMetadata | null {
  if (!fs.existsSync(txtPath)) return null;

  const content = fs.readFileSync(txtPath, "utf-8");
  const lines = content.split("\n");

  let title = "";
  let description = "";
  let tags: string[] = [];

  let inDescription = false;
  const descriptionLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("Title: ")) {
      title = line.slice(7).trim();
      inDescription = false;
    } else if (line.startsWith("Description: ")) {
      descriptionLines.push(line.slice(13).trim());
      inDescription = true;
    } else if (line.startsWith("Tags: ")) {
      tags = line.slice(6).split(",").map((t) => t.trim()).filter(Boolean);
      inDescription = false;
    } else if (inDescription) {
      descriptionLines.push(line);
    }
  }

  description = descriptionLines.join("\n").trim();

  if (!title) return null;
  return { title, description, tags };
}
```

**Step 2: Modify the upload loop to use parsed metadata**

In the upload loop inside `registerPublishShortsTool`, replace the metadata generation line:

```typescript
// Before:
const metadata = generateShortsMetadata(short.keyword);

// After:
const txtPath = short.filePath.replace(/\.mp4$/i, ".txt");
const parsed = parseMetadataFile(txtPath);
const metadata = parsed
  ? { ...parsed, categoryId: "10" }
  : generateShortsMetadata(short.keyword);
```

**Step 3: Build to verify TypeScript compiles**

Run: `cd packages/youtube-mcp && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/youtube-mcp/src/tools/publish-shorts.ts
git commit -m "feat: publish_shorts reads companion .txt metadata files"
```

---

### Task 6: Integration test — generate and verify shorts

**Step 1: Create a test folder with a real image and short audio clips**

Use the existing test patterns to create a minimal integration test or manually test with a real folder.

Run: `cd packages/music-video-creator && python -c "from shorts_builder import build_shorts; print('Import OK')"`
Expected: `Import OK`

**Step 2: Run all existing tests to ensure nothing is broken**

Run: `cd packages/music-video-creator && python -m pytest tests/ -v`
Expected: All tests PASS

**Step 3: Commit any test additions**

```bash
git commit -m "test: verify shorts integration"
```
