from video_builder import Track, calculate_timecodes, format_timecode

FADE = 2.0


def _tracks(durations: list[float]) -> list[Track]:
    return [Track(index=i + 1, name=f"track{i + 1}", path=f"/tmp/{i}.mp3", duration=d) for i, d in enumerate(durations)]


def test_format_timecode():
    assert format_timecode(0) == "0:00:00"
    assert format_timecode(61) == "0:01:01"
    assert format_timecode(3661) == "1:01:01"
    assert format_timecode(7200) == "2:00:00"


def test_single_track_timecodes():
    tracks = _tracks([300.0])  # 5 min
    entries = calculate_timecodes(tracks, FADE)
    # Two loops: loop1 track1, loop2 track1
    assert len(entries) == 2
    assert entries[0]["start_seconds"] == 0
    assert entries[0]["end_seconds"] == 300.0  # no overlap, full duration
    assert entries[1]["start_seconds"] == 300.0


def test_two_track_timecodes():
    tracks = _tracks([100.0, 200.0])  # 2 tracks
    entries = calculate_timecodes(tracks, FADE)
    # 2 tracks x 2 loops = 4 entries
    assert len(entries) == 4
    assert entries[0]["start_seconds"] == 0
    assert entries[0]["end_seconds"] == 100.0
    assert entries[1]["start_seconds"] == 100.0  # no overlap
    assert entries[2]["start_seconds"] == 300.0  # 100 + 200


def test_total_duration():
    tracks = _tracks([100.0, 200.0, 150.0])
    entries = calculate_timecodes(tracks, FADE)
    # 6 tracks total (3x2), no overlap
    # Total = (100+200+150)*2 = 900
    last = entries[-1]
    assert last["end_seconds"] == 900.0
