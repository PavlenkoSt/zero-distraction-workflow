# YouTube Shorts Generation & Publishing — Design

## Goal

Add ability to generate portrait YouTube Shorts (10s each) from a folder of tracks + image + thematic text, and publish them to YouTube with companion metadata files.

## Pre-generated Hook Pool

- `packages/music-video-creator/hooks.json` — 200 short punchy hook lines for Zero Distraction Lab (lofi/ambient/focus)
- Generated once, committed to repo, no runtime API dependency
- Matched to tracks at runtime via keyword overlap

## Part 1: Generate Shorts (music-video-creator)

### New MCP tool: `create_shorts`

**Input:**
- `folder_path` — folder with 1 image + N audio tracks (e.g. `1-midnight-rain.mp3`)
- `output_path` — directory for output files
- `thematic_text` — theme description for hook matching (e.g. "lofi ambient focus music for deep work")

**Pipeline:**
1. Parse folder — reuse `parse_folder()` from `video_builder.py`
2. Probe durations — reuse `probe_duration()`
3. Load hooks from `hooks.json`
4. Match best hook per track — score hooks against track name + thematic text via keyword overlap, assign unique hooks
5. Per track: render 10s portrait video (1080x1920)
   - Full-screen image (scaled/cropped to fill portrait)
   - First 10 seconds of the track (best quality audio)
   - Typing text animation at vertical center — hook text, characters appear one by one
6. Per track: write companion `.txt` file

**Output per track:**
- `{number}-{trackname}.mp4` — 10s portrait video
- `{number}-{trackname}.txt`:
  ```
  Title: Deep Focus Ambient Flow #lofi #ambient #focusmusic
  Description: Your mind deserves silence. Let this ambient wave carry you into deep focus.

  Subscribe @ZeroDistractionLab for more ambient focus music.
  Tags: lofi, ambient, focus music, deep focus, coding music
  ```

### New files
- `packages/music-video-creator/shorts_builder.py` — generation pipeline
- `packages/music-video-creator/hooks.json` — 200 pre-generated hooks

### Modified files
- `packages/music-video-creator/server.py` — register `create_shorts` tool

## Part 2: Publish Shorts (youtube-mcp)

### Modified tool: `publish_shorts`

**Change:** For each `.mp4`, check for companion `.txt` file with same base name. If found, parse Title/Description/Tags from it. If not found, fall back to existing filename-based metadata generation.

### Modified files
- `packages/youtube-mcp/src/tools/publish-shorts.ts` — add `.txt` detection and parsing
