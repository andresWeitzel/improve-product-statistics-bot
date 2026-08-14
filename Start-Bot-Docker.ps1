#Requires -Version 5.1
<#
.SYNOPSIS
  Build the bot image and start the controllable Docker container.

.DESCRIPTION
  IMPORTANT: Open Docker Desktop yourself and wait until "Engine running".
  This script does NOT start Docker Desktop (that can leave hung processes).

  Then run from the repo root:
    .\Start-Bot-Docker.ps1
  Or double-click:
    Start-Bot-Docker.bat

  After this, Start/Stop the container "improve-product-statistics-bot" from Docker Desktop.
  UI: http://localhost:9008

.PARAMETER SkipStart
  Do not run "docker compose up -d" (container not started).

.PARAMETER Clean
  Stop/remove leftover compose containers for this project before build/start.
#>
param(
  [switch]$SkipStart,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

$ContainerName = "improve-product-statistics-bot"
$ImageName = "improve-product-statistics-bot:local"
$ServiceName = "improve-product-statistics-bot"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-DockerCli {
  return ($null -ne (Get-Command docker -ErrorAction SilentlyContinue))
}

function Test-DockerEngine {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  docker info 1>$null 2>$null
  $ok = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $prev
  return $ok
}

function Assert-DockerEngineReady {
  if (-not (Test-DockerCli)) {
    throw "docker CLI not found. Install Docker Desktop, open it, wait for Engine running, then re-run this script."
  }

  if (Test-DockerEngine) {
    Write-Host "Docker engine is ready."
    return
  }

  $msg = "Docker engine is NOT ready.`n`n" +
    "Do this manually (this script will NOT start Docker Desktop):`n" +
    "  1. Quit Docker Desktop completely if it is stuck (system tray > Quit)`n" +
    "  2. Open Docker Desktop from the Start menu`n" +
    "  3. Wait until it says Engine running`n" +
    "  4. Re-run: Start-Bot-Docker.bat`n`n" +
    "Auto-starting Docker Desktop.exe from a script can leave hung processes on Windows."
  throw $msg
}

function Clear-ProjectContainers {
  Write-Step "Cleaning leftover compose containers for this project"
  docker compose down --remove-orphans
}

function Start-BotContainer {
  param(
    [switch]$ForceRecreate
  )
  Write-Step "Starting container $ContainerName (Start/Stop from Docker Desktop)"
  if ($ForceRecreate) {
    docker compose up -d --force-recreate --no-deps $ServiceName
  } else {
    docker compose up -d $ServiceName
  }
  if ($LASTEXITCODE -ne 0) { throw "docker compose up -d failed" }

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    $status = docker inspect -f "{{.State.Running}}" $ContainerName 2>$null
    if ($status -eq "true") {
      Write-Host "Container is running: $ContainerName"
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "Container $ContainerName did not reach Running state. Check Docker Desktop."
}

Write-Host "Improve Product Statistics Bot - Docker up"
Write-Host "Repo: $RepoRoot"
Write-Host "Note: Open Docker Desktop first. This script will not start it."

Assert-DockerEngineReady

if ($Clean) {
  Clear-ProjectContainers
}

Write-Step "Building image $ImageName"
docker compose build $ServiceName
if ($LASTEXITCODE -ne 0) { throw "docker compose build failed" }

if (-not $SkipStart) {
  # After a rebuild, recreate the container so it uses the new image.
  Start-BotContainer -ForceRecreate
}

Write-Step "Done"
Write-Host ""
Write-Host "What you have now:"
Write-Host "  IMAGE     : $ImageName"
Write-Host "  CONTAINER : $ContainerName  (control Start/Stop in Docker Desktop)"
Write-Host "  UI        : http://localhost:9008"
Write-Host "  HEALTH    : http://localhost:9008/health"
Write-Host "  MAIL      : loaded from .env (midnight AR report if MAIL_ENABLED=true)"
Write-Host ""

$envPath = Join-Path $RepoRoot ".env"
if (-not (Test-Path $envPath)) {
  Write-Host "WARNING: No .env found. Copy .env.example to .env and set MAIL_* for Gmail." -ForegroundColor Yellow
} else {
  $mailOn = Select-String -Path $envPath -Pattern '^\s*MAIL_ENABLED\s*=\s*true' -Quiet
  if ($mailOn) {
    Write-Host "MAIL_ENABLED=true detected — daily report scheduled at 00:00 AR inside the container." -ForegroundColor Green
  } else {
    Write-Host "MAIL_ENABLED is not true in .env — bot runs, but no midnight email." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "On re-run (app updates):"
Write-Host "  - No need to delete the container by hand"
Write-Host "  - Build replaces the IMAGE; up --force-recreate refreshes the CONTAINER"
Write-Host ""
Write-Host "How control works:"
Write-Host "  - Docker Desktop > container '$ContainerName' > Start / Stop"
Write-Host "  - Start  = bot online (FB visits + midnight mail)"
Write-Host "  - Stop   = bot offline"
Write-Host "  - restart: unless-stopped → if Docker Desktop is running, container comes back after reboot"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Open http://localhost:9008"
Write-Host "  2. App code change: run the .bat again (build + recreate)"
Write-Host "  3. Stuck state: .\Start-Bot-Docker.ps1 -Clean"
Write-Host "  4. Manual mail test (host): npm run report:send"
