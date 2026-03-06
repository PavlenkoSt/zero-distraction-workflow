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

        chosen_hook = None
        for score, idx, hook in scored:
            if idx not in used:
                chosen_hook = hook
                used.add(idx)
                break

        if chosen_hook is None:
            chosen_hook = scored[0][2]

        results.append({"track": track, "hook": chosen_hook})

    return results
