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

    Re-encodes the segment with H.264/AAC. Stream-copy trims were rejected
    because they preserve non-zero source timestamps, which produce files most
    media players refuse to open. Re-encoding resets timestamps and always
    yields a clean, playable MP4; the cost is CPU time, which is acceptable for
    MVP reliability.
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

    args = [settings.resolved_ffmpeg(), "-y"]
    if start is not None:
        args += ["-ss", f"{start:.3f}"]
    args += ["-i", str(input_path)]
    if duration is not None:
        args += ["-t", f"{duration:.3f}"]
    args += [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-avoid_negative_ts", "make_zero",
        str(output_path),
    ]

    if not _run(args):
        raise RuntimeError("FFmpeg trimming failed")


def _run(args: list[str]) -> bool:
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        return False
    if not args[-1] or not Path(args[-1]).exists():
        return False
    return True