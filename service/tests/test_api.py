from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert "ffmpeg" in body


def test_job_not_found():
    res = client.get("/api/jobs/nope")
    assert res.status_code == 404


def test_resolve_bad_url():
    res = client.post("/api/resolve", json={"url": "not-a-url"})
    assert res.status_code == 400


def test_download_invalid_range():
    res = client.post(
        "/api/downloads",
        json={"url": "x", "format_id": "video:best", "start": 10, "end": 5},
    )
    assert res.status_code == 400


def test_download_accepts_camelcase_format_id():
    res = client.post(
        "/api/downloads",
        json={"url": "x", "formatId": "video:best"},
    )
    assert res.status_code == 202


def test_cancel_unknown_job():
    res = client.post("/api/jobs/nope/cancel")
    assert res.status_code == 404