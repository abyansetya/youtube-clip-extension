from app.youtube import format_to_ytdlp

import pytest


def test_video_best():
    selector, ext = format_to_ytdlp("video:best")
    assert "bv" in selector
    assert ext == "mp4"


def test_video_height():
    selector, ext = format_to_ytdlp("video:1080")
    assert "height<=1080" in selector
    assert ext == "mp4"


def test_audio():
    selector, ext = format_to_ytdlp("audio:best-audio")
    assert "ba" in selector
    assert ext == "m4a"


def test_unknown():
    with pytest.raises(ValueError):
        format_to_ytdlp("video:abc")