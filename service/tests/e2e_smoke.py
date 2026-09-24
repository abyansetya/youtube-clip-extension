"""End-to-end smoke test for the Clip processing service.

Expects the service already running on CLIP_BASE (default http://127.0.0.1:8787).

Exercises: /api/health, /api/resolve, /api/downloads (full + trimmed),
/api/jobs/{id} polling, /api/jobs/{id}/file download, and ffprobe duration
verification of a trimmed output.
"""

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

BASE = os.environ.get("CLIP_BASE", "http://127.0.0.1:8787")
VIDEO_URL = os.environ.get("CLIP_TEST_URL", "https://www.youtube.com/watch?v=jNQXAC9IVRw")


def req(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"content-type": "application/json"} if body else {},
    )
    with urllib.request.urlopen(request) as resp:
        raw = resp.read()
        parsed = json.loads(raw) if raw else None
        return resp.status, parsed


def fetch(path: str) -> bytes:
    try:
        with urllib.request.urlopen(BASE + path) as resp:
            return resp.read()
    except Exception as exc:  # noqa: BLE001
        print(f"  (fetch {path} failed: {exc})")
        return b""


def wait_job(job_id: str) -> dict:
    while True:
        _, job = req("GET", f"/api/jobs/{job_id}")
        msg = job.get("message") or ""
        print(f"  [{job['status']}] {msg} progress={job['progress']:.0f}%")
        if job["status"] in ("done", "error"):
            return job
        time.sleep(1)


def main() -> int:
    failures = 0

    def check(name: str, ok: bool, detail: str = "") -> None:
        nonlocal failures
        print(f"  {'PASS' if ok else 'FAIL'}: {name}" + (f" — {detail}" if detail else ""))
        if not ok:
            failures += 1

    print(f"== health ==")
    status, health = req("GET", "/api/health")
    check("health 200", status == 200 and health.get("ok"))
    check("ffmpeg available", bool(health.get("ffmpeg")))

    print(f"\n== resolve {VIDEO_URL} ==")
    status, resolved = req("POST", "/api/resolve", {"url": VIDEO_URL})
    check("resolve 200", status == 200, f"videoId={resolved.get('videoId')}")
    check("has formats", bool(resolved.get("formats")), str([f["id"] for f in resolved.get("formats", [])]))

    print(f"\n== full download ==")
    status, created = req(
        "POST", "/api/downloads",
        {"url": VIDEO_URL, "format_id": "video:best"},
    )
    check("created", status == 202 and created.get("jobId"))
    job = wait_job(created["jobId"])
    check("full done", job["status"] == "done", job.get("error") or "")
    full_bytes = fetch(f"/api/jobs/{created['jobId']}/file")
    check("file non-empty", len(full_bytes) > 0, f"{len(full_bytes)} bytes")

    print(f"\n== trimmed download (3s-8s) ==")
    status, created = req(
        "POST", "/api/downloads",
        {"url": VIDEO_URL, "format_id": "video:best", "start": 3, "end": 8},
    )
    job = wait_job(created["jobId"])
    check("trim done", job["status"] == "done", job.get("error") or "")
    trim_bytes = fetch(f"/api/jobs/{created['jobId']}/file")
    check("trim file non-empty", len(trim_bytes) > 0, f"{len(trim_bytes)} bytes")

    ffprobe = shutil.which("ffprobe")
    ffmpeg = shutil.which("ffmpeg")
    if ffprobe:
        tmp = "data/_e2e_trim.mp4"
        with open(tmp, "wb") as fh:
            fh.write(trim_bytes)
        out = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", tmp],
            capture_output=True, text=True,
        )
        duration = float(out.stdout.strip() or 0)
        check("trim ~5s", 4.0 <= duration <= 6.5, f"duration={duration:.2f}s")
        if ffmpeg:
            dec = subprocess.run(
                [ffmpeg, "-v", "error", "-i", tmp, "-f", "null", "-"],
                capture_output=True, text=True,
            )
            check("trim fully decodable", dec.returncode == 0, dec.stderr.strip()[:120])
        os.remove(tmp)
    else:
        print("  SKIP: ffprobe not found")

    print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILURE(S)'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())