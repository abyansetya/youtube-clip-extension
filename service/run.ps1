# Starts the Clip processing service.
# Usage: .\run.ps1   (or .\run.ps1 -Port 9000)
param(
    [int]$Port = 8787,
    [switch]$Reload
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".venv")) {
    Write-Host "Creating venv and installing requirements..." -ForegroundColor Cyan
    py -m venv .venv
    & .\.venv\Scripts\python.exe -m pip install --disable-pip-version-check -q -r requirements.txt
}

$env:CLIP_SERVICE_PORT = "$Port"
$args = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port")
if ($Reload) { $args += "--reload" }

Write-Host "Starting Clip service on http://127.0.0.1:$Port" -ForegroundColor Cyan
& .\.venv\Scripts\python.exe @args