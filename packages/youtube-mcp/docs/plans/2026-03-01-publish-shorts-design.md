# Publish Shorts Tool — Design

## Goal

Add a `publish_shorts` MCP tool that batch-uploads YouTube Shorts from a folder. Shorts promote long mixes on the Zero Distraction Lab channel.

## Input

```
{
  directory: string    // folder with numbered .mp4 shorts
  mixUrl: string       // YouTube URL of the full mix being promoted
}
```

## File Discovery

- Scan directory for `.mp4` files matching pattern: `{number}-{keyword}.mp4`
- Sort by number ascending
- Extract keyword from filename: `1-deep-focus.mp4` → `"deep focus"`

## Metadata (per short)

**Title:** Keyword, capitalized — e.g. `"Deep focus"`

**Description:**
```
{Hook line from keyword theme}

Full mix on the channel:
{mixUrl}

Subscribe @ZeroDistractionLab for more ambient focus music.

#lofi #ambient #focusmusic #deepwork #shorts
```

**Tags:** BASE_TAGS + keyword-specific tags
**Category:** 10 (Music)

## Upload

- Each short uploaded as private draft via YouTube API
- No thumbnail (YouTube auto-generates)
- Sequential upload with progress logging
- Continue on individual failure, report all results at end

## New Files

- `src/tools/publish-shorts.ts` — tool registration and upload orchestration
- `src/metadata/shorts-templates.ts` — short-form metadata generator

## Modified Files

- `src/index.ts` — register `publish_shorts` tool
