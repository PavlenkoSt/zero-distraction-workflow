from shorts_builder import build_typing_filter, build_metadata_text, slugify_track_name


def test_slugify_track_name():
    assert slugify_track_name("Midnight Rain") == "midnight-rain"
    assert slugify_track_name("deep   focus") == "deep-focus"


def test_build_typing_filter_returns_drawtext():
    result = build_typing_filter("Let silence work", duration=10.0)
    assert "drawtext=" in result
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
