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
    hook_texts = [r["hook"] for r in result]
    assert len(set(hook_texts)) == 3
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
    assert all(r["hook"] for r in result)
