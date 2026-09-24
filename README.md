# Comot — YouTube Downloader & Segment Clipper

Download YouTube videos — full or trimmed to a time range — as **MP4** or **M4A**.
Comot is a Chromium (Chrome / Edge / Brave) extension paired with a small local
processing service that does the heavy lifting with `yt-dlp` and FFmpeg.

Everything runs on your machine. No accounts, no cloud, no uploads.

## Features

- Download full videos or only a segment (set start/end timestamps).
- MP4 (video) and M4A (audio) output.
- Live per-format resolution and size estimate before downloading.
- Runs entirely locally: the extension talks to a service on `127.0.0.1`.
- Light/dark theme (follows system by default).

## How it works

```
Browser Extension (popup UI)
        ↓ HTTP (http://127.0.0.1:8787)
Local Processing Service (FastAPI)
        ↓
yt-dlp  (resolve formats + download)
        ↓
FFmpeg  (trim + mux)
        ↓
Output file
        ↓
Browser download (chrome.downloads)
```

## Monorepo layout

```
extension/   Chromium MV3 extension (TypeScript + Vite + CRXJS)
service/     Local processing service (Python + FastAPI + yt-dlp + FFmpeg)
```

## Prerequisites

- **Node.js 18+** and **npm** (for the extension).
- **Python 3.11+** (for the service).
- **FFmpeg** — required for merging streams and trimming. On Windows it is
  auto-discovered from `PATH`, WinGet, Chocolatey, or `C:\ffmpeg\bin`.
  On Linux/macOS, install it any way you like and make sure it is on `PATH`:

  ```sh
  # macOS
  brew install ffmpeg

  # Debian/Ubuntu
  sudo apt install ffmpeg

  # Arch
  sudo pacman -S ffmpeg
  ```

## Quick start

### 1. Start the processing service

```powershell
cd service
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

Or use the provided helper script (creates the venv for you):

```powershell
cd service
.\run.ps1
```

On Linux/macOS:

```sh
cd service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

The service listens on `http://127.0.0.1:8787` by default. Verify it is up:

```sh
curl http://127.0.0.1:8787/api/health
# {"ok":true,"ffmpeg":true,"version":"0.1.0"}
```

`ffmpeg: false` means FFmpeg wasn't found — downloads that need to merge or trim
streams will fail. See [Configuration](#configuration) to point it at your binary.

### 2. Build & load the extension

```powershell
cd extension
npm install
npm run dev       # watch mode, rebuilds into dist/
# or
npm run build     # one-shot build
```

Then load it:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `extension/dist/` folder.

### 3. Use it

1. Make sure the service is running.
2. Open any YouTube video.
3. Click the Comot extension icon.
4. Pick a format and quality; the estimated size is shown as you choose.
5. Optionally set start/end timestamps to download only that segment.
6. Click **Download**.

## Configuration

### Extension

Right-click the extension icon → **Options** (or `chrome://extensions` → Details →
Extension options):

| Setting         | Default                | Description                        |
| --------------- | ---------------------- | ---------------------------------- |
| Service URL     | `http://127.0.0.1:8787` | Where the processing service runs. |
| Default format  | `mp4`                  | `mp4` or `m4a`.                    |
| Default quality | `1080`                 | Max height used when no explicit selection is made. |
| Theme           | `system`               | `system`, `light`, or `dark`.      |

### Service

All variables are read from the environment or a `.env` file in `service/` and
are prefixed with `CLIP_`.

| Variable              | Default              | Description                              |
| --------------------- | -------------------- | ---------------------------------------- |
| `CLIP_SERVICE_HOST`   | `127.0.0.1`          | Bind host.                               |
| `CLIP_SERVICE_PORT`   | `8787`               | Bind port.                               |
| `CLIP_WORK_DIR`       | `data/work`          | Temp download directory (relative to `service/`). |
| `CLIP_OUTPUT_DIR`     | `data/output`        | Where finished files are stored.         |
| `CLIP_FFMPEG_BINARY`  | `ffmpeg`             | Path to an FFmpeg binary if not on `PATH`. |

## HTTP API

The service exposes a small JSON API:

| Method | Path                        | Description                              |
| ------ | --------------------------- | ---------------------------------------- |
| `GET`  | `/api/health`               | Liveness + whether FFmpeg is available.  |
| `POST` | `/api/resolve`              | Resolve a URL; returns available formats. |
| `POST` | `/api/downloads`            | Start a download job; returns a `jobId`. |
| `GET`  | `/api/jobs/{id}`            | Poll job status and progress.            |
| `POST` | `/api/jobs/{id}/cancel`     | Cancel a running job.                    |
| `GET`  | `/api/jobs/{id}/file`       | Download the finished file.              |

Interactive docs are available at `http://127.0.0.1:8787/docs` (FastAPI Swagger UI).

## Development

### Running the tests

Service unit tests:

```powershell
cd service
.venv\Scripts\python.exe -m pytest -q
```

End-to-end smoke test (requires the service to be running; downloads a real
YouTube video and verifies the output with ffprobe):

```powershell
cd service
.venv\Scripts\python.exe tests\e2e_smoke.py
# set CLIP_TEST_URL to target a different video
```

Extension type-check:

```powershell
cd extension
npm run typecheck
```

### Contributing

1. Fork the repo and create a feature branch.
2. Make your change; keep it focused.
3. Run the relevant tests / type-check above.
4. Open a pull request describing what you changed and why.

## License

Add a license (e.g. MIT) before publishing — a LICENSE file is not yet included.