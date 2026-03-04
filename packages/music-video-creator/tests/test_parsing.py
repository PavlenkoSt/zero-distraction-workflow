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


def test_parse_unnumbered_tracks_alphabetically():
    d = _make_folder(["cover.png", "Zebra Song.mp3", "Alpha Beat.mp3", "Middle Ground.flac"])
    _, tracks = parse_folder(d)
    assert len(tracks) == 3
    assert [t.name for t in tracks] == ["Alpha Beat", "Middle Ground", "Zebra Song"]
    assert [t.index for t in tracks] == [1, 2, 3]


def test_parse_mixed_numbered_and_unnumbered():
    d = _make_folder(["cover.png", "2-second.mp3", "1-first.mp3", "Outro.mp3", "Bonus.mp3"])
    _, tracks = parse_folder(d)
    # Numbered first (by number), then unnumbered (alphabetically)
    assert [t.name for t in tracks] == ["first", "second", "Bonus", "Outro"]
    assert [t.index for t in tracks] == [1, 2, 3, 4]
