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
