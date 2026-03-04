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
