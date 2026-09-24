"""FFmpeg media processing (trim)."""

import subprocess
from pathlib import Path

from .config import settings


def ffmpeg_available() -> bool:
    try:
        proc = subprocess.run(
            [settings.resolved_ffmpeg(), "-version"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return proc.returncode == 0
    except Exception:  # noqa: BLE001
        return False


def trim(
    input_path: Path,
    output_path: Path,
    start: float | None = None,
    end: float | None = None,
) -> None:
    """Trim a media file to the [start, end] range.

    Fast-seeks (`-ss` before `-i`) so long videos are not decoded from the top,
    then stream-copies. `-copyts` keeps the original timestamps so the muxer
    writes a correct duration (without it, `-c copy` output duration is derived
    from the last packet PTS and can be wrong). Falls back to re-encoding when
    the copy pass fails.
    """
    if start is None and end is None:
        raise ValueError("Nothing to trim")
    if start is not None and end is not None and end <= start:
        raise ValueError("end must be after start")

    duration: float | None = None
    if start is not None and end is not None:
        duration = end - start
    elif end is not None:
        duration = end

    def build(encode: list[str]) -> list[str]:
        args = [settings.resolved_ffmpeg(), "-y"]
        if start is not None:
            args += ["-ss", f"{start:.3f}"]
        args += ["-i", str(input_path)]
        if duration is not None:
            args += ["-t", f"{duration:.3f}"]
        args += encode + [str(output_path)]
        return args

    copy_args = [
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        "-copyts",
    ]
    if _run(build(copy_args)):
        return

    # Fallback: re-encode (accurate trim regardless of keyframes).
    enc = [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
    ]
    if not _run(build(enc)):
        raise RuntimeError("FFmpeg trimming failed (copy and re-encode attempts)")


def _run(args: list[str]) -> bool:
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        return False
    if not args[-1] or not Path(args[-1]).exists():
        return False
    return True