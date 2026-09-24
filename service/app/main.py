import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response

from .config import settings
from .jobs import JobManager, STATUS_DONE
from .media import ffmpeg_available
from .schemas import (
    DownloadCreated,
    DownloadRequest,
    JobResponse,
    ResolveRequest,
    ResolveResponse,
)
from .youtube import resolve as resolve_video

app = FastAPI(
    title="Clip Processing Service",
    version="0.1.0",
    description="yt-dlp + FFmpeg processing backend for the Clip extension.",
)

jobs = JobManager()

CORS_ORIGINS = ["chrome-extension://*"]


@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")
    is_extension = origin.startswith("chrome-extension://")

    if request.method == "OPTIONS":
        response = Response(status_code=200)
    else:
        response = await call_next(request)

    if is_extension:
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-methods"] = "GET, POST, OPTIONS"
        response.headers["access-control-allow-headers"] = "Content-Type"
    return response


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "ffmpeg": ffmpeg_available(),
        "version": app.version,
    }


@app.post("/api/resolve", response_model=ResolveResponse)
def resolve(req: ResolveRequest) -> ResolveResponse:
    try:
        return resolve_video(req.url)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/downloads", response_model=DownloadCreated, status_code=202)
def create_download(req: DownloadRequest) -> DownloadCreated:
    try:
        job = jobs.create(req.url, req.format_id, req.start, req.end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DownloadCreated(jobId=job.id)


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
def job_status(job_id: str) -> JobResponse:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(
        jobId=job.id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        filename=job.filename,
        error=job.error,
    )


@app.get("/api/jobs/{job_id}/file")
def job_file(job_id: str) -> FileResponse:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != STATUS_DONE or not job.filename:
        raise HTTPException(status_code=409, detail="File not ready yet")
    path = Path(settings.output_dir) / job.filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Output file missing")
    return FileResponse(path, filename=job.filename)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.service_host,
        port=settings.service_port,
        reload=False,
    )