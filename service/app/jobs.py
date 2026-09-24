"""Background job manager for download + trim pipelines."""

import shutil
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import yt_dlp

from .config import settings
from .media import trim
from .youtube import format_to_ytdlp

JobProgressHook = Callable[[dict], None]

STATUS_QUEUED = "queued"
STATUS_RESOLVING = "resolving"
STATUS_DOWNLOADING = "downloading"
STATUS_PROCESSING = "processing"
STATUS_DONE = "done"
STATUS_ERROR = "error"


@dataclass
class Job:
    id: str
    url: str
    format_id: str
    start: float | None
    end: float | None
    status: str = STATUS_QUEUED
    progress: float = 0.0
    message: str = ""
    filename: str | None = None
    error: str | None = None
    workdir: Path = field(default_factory=lambda: settings.work_dir / uuid.uuid4().hex[:8])
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update(self, **kw) -> None:
        with self._lock:
            for key, value in kw.items():
                setattr(self, key, value)


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self, url: str, format_id: str, start: float | None, end: float | None) -> Job:
        if start is not None and end is not None and start >= end:
            raise ValueError("start must be less than end")
        job = Job(
            id=uuid.uuid4().hex[:12],
            url=url,
            format_id=format_id,
            start=start,
            end=end,
        )
        job.workdir.mkdir(parents=True, exist_ok=True)
        with self._lock:
            self._jobs[job.id] = job
        thread = threading.Thread(target=self._run, args=(job,), daemon=True)
        thread.start()
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def _run(self, job: Job) -> None:
        try:
            selector, preferred_ext = format_to_ytdlp(job.format_id)
            job.update(status=STATUS_RESOLVING, progress=2, message="Resolving video…")

            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "outtmpl": str(job.workdir / "download.%(ext)s"),
                "format": selector,
                "merge_output_format": preferred_ext,
                "progress_hooks": [self._make_progress_hook(job)],
                "noprogress": True,
            }
            ffmpeg_dir = settings.ffmpeg_bin_dir()
            if ffmpeg_dir:
                ydl_opts["ffmpeg_location"] = ffmpeg_dir

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(job.url, download=True)

            if job.status == STATUS_ERROR:
                return

            downloaded = Path(ydl.prepare_filename(info))
            if not downloaded.exists():
                candidates = list(job.workdir.glob("download.*"))
                if not candidates:
                    raise RuntimeError("Download finished but output file not found")
                downloaded = candidates[0]

            final_name = self._final_name(job, downloaded.suffix)
            final_path = settings.output_dir / final_name

            if job.start is not None or job.end is not None:
                job.update(status=STATUS_PROCESSING, progress=85, message="Trimming…")
                trimmed_tmp = settings.output_dir / f".{final_name}.tmp{downloaded.suffix}"
                trim(downloaded, trimmed_tmp, job.start, job.end)
                if not trimmed_tmp.exists():
                    raise RuntimeError("FFmpeg produced no output file")
                shutil.move(str(trimmed_tmp), str(final_path))
            else:
                shutil.move(str(downloaded), str(final_path))

            job.update(
                status=STATUS_DONE,
                progress=100,
                message="Done",
                filename=final_path.name,
            )
        except Exception as exc:  # noqa: BLE001 - surface any failure to the client
            job.update(
                status=STATUS_ERROR,
                progress=job.progress,
                message="Failed",
                error=str(exc),
            )
        finally:
            shutil.rmtree(job.workdir, ignore_errors=True)

    def _final_name(self, job: Job, suffix: str) -> str:
        ext = "mp4" if job.format_id.startswith("video") else "m4a"
        if suffix in (".mp4", ".m4a", ".webm", ".mkv"):
            ext = suffix.lstrip(".")
        stem = f"clip-{job.id}"
        if job.start is not None or job.end is not None:
            start = int(job.start or 0)
            end = int(job.end or 0)
            stem = f"{stem}-{start}-{end}"
        return f"{stem}.{ext}"

    def _make_progress_hook(self, job: Job):
        def hook(d: dict) -> None:
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes") or 0
                pct = (downloaded / total * 100) if total else 5
                job.update(
                    status=STATUS_DOWNLOADING,
                    progress=max(5.0, min(80.0, pct)),
                    message=f"Downloading… {pct:.0f}%",
                )
            elif d.get("status") == "finished":
                job.update(status=STATUS_DOWNLOADING, progress=82, message="Finalizing…")

        return hook