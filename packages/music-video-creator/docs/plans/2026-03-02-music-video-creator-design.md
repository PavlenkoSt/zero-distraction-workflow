# Music Video Creator MCP — Design

## Goal
Python MCP server that generates music videos from a folder of audio tracks + a background image. Exposes a single `create_music_video` tool for Claude Code.

## Tool Interface
- `create_music_video(folder_path, output_path)`
- Input folder: one image (jpg/png), numbered audio tracks (`1-name.mp3`, `2-name.mp3`)
- Output: MP4 video + CSV timecode file

## Architecture

Two modules:
- `server.py` — MCP server (stdio transport), parameter validation, calls video_builder
- `video_builder.py` — FFmpeg orchestration, all rendering logic

## FFmpeg Pipeline (multi-step)

### Step 1: Probe durations
Run `ffprobe` on each track to get exact durations in seconds.

### Step 2: Concatenate audio with crossfades
Build a filtergraph chaining `acrossfade=d=2:c1=tri:c2=tri` between consecutive tracks.
The full playlist is: all tracks × 2 (two loops), with 2s crossfade at every boundary including loop1-last → loop2-first.

For N unique tracks (2N total inputs):
- Chain: [track1][track2] acrossfade → [cf1], [cf1][track3] acrossfade → [cf2], ...
- Total transitions: 2N - 1
- Total duration: sum(all 2N durations) - (2N-1) * 2s

Output: temporary WAV file.

### Step 3: Build video with overlays
- Input: background image (loop, scaled to 1920x1080) + merged audio
- For each track transition, two drawtext/drawbox filters with `enable='between(t,start,end)'`:
  - Dark semi-transparent bar (drawbox)
  - White text centered horizontally, lower-third vertically
  - Animation via alpha/y expressions: 1s slide-up+fade-in, 10s hold, 1s fade-out
- Output: MP4 (libx264 + aac)

### Step 4: Embed chapter metadata
Generate FFmpeg-format metadata file with chapter markers.
Re-mux the MP4 with `-i metadata.txt -map_metadata 1`.

### Step 5: Generate CSV
Write timecode CSV with columns: track_number, track_name, start_time, end_time, duration.
Both loops as separate rows. Format: HH:MM:SS.

## Crossfade Timing Math

Track start times (accounting for 2s crossfades):
```
track[0].start = 0
track[i].start = track[i-1].start + track[i-1].duration - 2
```

Track overlay appears at transition point (track start time) for 12s total (1s in + 10s hold + 1s out).

## Text Overlay Animation

Using drawtext filter expressions:
- `alpha`: `if(lt(t-START,1),(t-START),if(lt(t-START,11),1,if(lt(t-START,12),1-(t-START-11),0)))`
- `y`: slides from `h` to `h*0.75` during first second, stays at `h*0.75`
- Background: drawbox at same position with `color=black@0.5`

## Error Handling
- No image found → error with message
- No audio tracks found → error with message
- FFmpeg/FFprobe not installed → error with message
- Unsupported formats → error listing supported extensions

## Project Structure
```
music-video-creator/
  server.py
  video_builder.py
  requirements.txt
  README.md
  docs/plans/
```

## Registration
```
claude mcp add music-video-creator -- /path/to/venv/bin/python /path/to/server.py
```
