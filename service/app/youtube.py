"""YouTube stream resolution via yt-dlp."""

import re

import yt_dlp

from .schemas import ResolveResponse, ResolvedFormat

VIDEO_EXTS = {"mp4", "m4v", "webm"}
AUDIO_EXTS = {"m4a", "aac", "mp4"}

_RESOLVE_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
}


def _codec_safe(vcodec: str | None) -> str | None:
    if not vcodec or vcodec == "none":
        return None
    return re.split(r"[/.]+", vcodec)[0]


def resolve(url: str) -> ResolveResponse:
    with yt_dlp.YoutubeDL(_RESOLVE_OPTS) as ydl:
        info = ydl.extract_info(url, download=False)

    video_id = info.get("id") or ""
    title = info.get("title") or video_id
    duration = float(info.get("duration") or 0)

    # Highest height per distinct mp4-compatible video stream.
    videos: dict[int, ResolvedFormat] = {}
    audio_found = False
    best_height = 0

    for f in info.get("formats", []):
        ext = (f.get("ext") or "").lower()
        vcodec = f.get("vcodec")
        acodec = f.get("acodec")
        height = f.get("height")
        codec = _codec_safe(vcodec)

        if vcodec and vcodec != "none" and height:
            best_height = max(best_height, int(height))
            if ext == "mp4" and codec:
                h = int(height)
                if h not in videos:
                    videos[h] = ResolvedFormat(
                        id=f"video:{h}",
                        kind="video",
                        label=f"{h}p",
                        container="mp4",
                        height=h,
                        codec=codec,
                    )

        if acodec and acodec != "none":
            if ext in AUDIO_EXTS or "audio only" in (f.get("format_note") or "").lower():
                audio_found = True

    formats: list[ResolvedFormat] = []

    if videos:
        formats.append(
            ResolvedFormat(
                id="video:best",
                kind="video",
                label=f"Best (up to {best_height}p)",
                container="mp4",
                height=best_height,
                note="Let yt-dlp pick the best mp4 combination",
            )
        )
        for h in sorted(videos, reverse=True):
            formats.append(videos[h])

    if audio_found:
        formats.append(
            ResolvedFormat(
                id="audio:best-audio",
                kind="audio",
                label="Best audio",
                container="m4a",
                note="m4a/AAC via yt-dlp",
            )
        )

    if not formats:
        return ResolveResponse(
            videoId=video_id,
            title=title,
            duration=duration,
            formats=[],
            error="No downloadable formats found for this video",
        )

    return ResolveResponse(
        videoId=video_id, title=title, duration=duration, formats=formats
    )


def format_to_ytdlp(format_id: str) -> str:
    """Map a format id to a yt-dlp -f selector and preferred extension."""
    if format_id == "video:best":
        return "bv*+ba/b", "mp4"
    if format_id.startswith("video:"):
        height = format_id.split(":", 1)[1]
        if height.isdigit():
            return (
                f"bv*[ext=mp4][height<={height}]+ba[ext=m4a]/b[ext=mp4][height<={height}]",
                "mp4",
            )
    if format_id == "audio:best-audio":
        return "ba[ext=m4a]/ba", "m4a"
    raise ValueError(f"Unknown format id: {format_id}")