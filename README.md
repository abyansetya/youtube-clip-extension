# Clip — YouTube Downloader & Segment Clipper

Chromium browser extension + local processing service to download YouTube videos (full or trimmed segments) as MP4 / M4A.

## Monorepo layout

```
extension/   Chrome/Edge/Brave MV3 extension (TypeScript + Vite + CRXJS)
service/     Local/backend processing service (Python + FastAPI + yt-dlp + FFmpeg)
```

## Architecture

```
Browser Extension (popup UI)
        ↓  HTTP
Local/Backend Processing Service
        ↓
yt-dlp (resolve + download)
        ↓
FFmpeg (trim + mux)
        ↓
Final Output File
        ↓
Browser Download (chrome.downloads)
```

## Quick start

### 1. Processing service

Requires Python 3.11+ and FFmpeg. FFmpeg is auto-discovered: from `PATH`, or
from common install locations (WinGet, Chocolatey, `C:\ffmpeg\bin`). Override
with `CLIP_FFMPEG_BINARY`.

```powershell
cd service
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

Service runs on `http://127.0.0.1:8787` (override with `CLIP_SERVICE_HOST` /
`CLIP_SERVICE_PORT`). Health check: `GET /api/health` (reports whether FFmpeg
was found).

### 2. Extension

```powershell
cd extension
npm install
npm run dev       # watch + build to dist/
# or
npm run build     # one-shot build
```

Load `extension/dist/` via `chrome://extensions` → Developer mode → "Load unpacked".

### 3. Use

Open a YouTube video, click the Clip extension icon, pick format/quality and
optional start/end timestamps, then Download. Keep the service running.

## Tests

Service unit tests:

```powershell
cd service
.venv\Scripts\python.exe -m pytest -q
```

End-to-end smoke test (requires the service running; hits a real YouTube video
and verifies full + trimmed downloads via ffprobe):

```powershell
cd service
.venv\Scripts\python.exe tests\e2e_smoke.py
# set CLIP_TEST_URL to use a different video
```