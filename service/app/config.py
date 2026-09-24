import os
import shutil
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_FFMPEG_CANDIDATES = [
    # WinGet (Gyan.FFmpeg)
    Path(os.environ.get("LOCALAPPDATA", ""))
    / "Microsoft" / "WinGet" / "Packages",
    # Chocolatey
    Path(r"C:\ProgramData\chocolatey\bin"),
    # Common manual installs
    Path(r"C:\ffmpeg\bin"),
]


def _find_ffmpeg(preferred: str) -> tuple[str, str | None]:
    """Return (ffmpeg_binary, bin_dir_for_ytdlp_or_None)."""
    candidates = [preferred] if preferred else []
    on_path = shutil.which("ffmpeg")
    if on_path:
        candidates.append(on_path)
    else:
        for root in _FFMPEG_CANDIDATES:
            if not root.exists():
                continue
            for ffmpeg in root.rglob("ffmpeg.exe"):
                candidates.append(str(ffmpeg))
                break
        for root in _FFMPEG_CANDIDATES:
            if not root.exists():
                continue
            for ffmpeg in root.rglob("ffmpeg.exe"):
                candidates.append(str(ffmpeg))
                break

    for candidate in candidates:
        exe = Path(candidate)
        if exe.is_file() and exe.exists():
            return str(exe), str(exe.parent)
    return preferred, None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CLIP_", env_file=".env", extra="ignore"
    )

    service_host: str = "127.0.0.1"
    service_port: int = 8787
    work_dir: Path = Path("data/work")
    output_dir: Path = Path("data/output")
    ffmpeg_binary: str = "ffmpeg"

    def resolved_ffmpeg(self) -> str:
        binary, _ = _find_ffmpeg(self.ffmpeg_binary)
        return binary

    def ffmpeg_bin_dir(self) -> str | None:
        _, bin_dir = _find_ffmpeg(self.ffmpeg_binary)
        return bin_dir


settings = Settings()
settings.work_dir.mkdir(parents=True, exist_ok=True)
settings.output_dir.mkdir(parents=True, exist_ok=True)