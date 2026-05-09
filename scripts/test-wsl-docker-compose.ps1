param(
  [string]$ProjectName = "uno-online-local-test",
  [int]$HttpPort = 18080,
  [int]$HttpsPort = 18443,
  [int]$MumblePort = 16438,
  [int]$MumbleGatewayPort = 16437,
  [string]$ProxyUrl = "",
  [switch]$BuildLocal,
  [switch]$KeepAlive
)

$ErrorActionPreference = "Stop"

function Invoke-WslBash {
  param([Parameter(Mandatory = $true)][string]$Command)

  & wsl.exe bash -lc $Command
  if ($LASTEXITCODE -ne 0) {
    throw "WSL command failed with exit code $LASTEXITCODE"
  }
}

function Assert-WslReady {
  & wsl.exe bash -lc "printf ready" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "WSL cannot run bash from this session. Check that a default Linux distribution is installed, for example: wsl --list --verbose"
  }

  & wsl.exe bash -lc "docker --version >/dev/null && docker compose version >/dev/null"
  if ($LASTEXITCODE -ne 0) {
    throw "Docker is not available inside WSL. Start Docker Desktop with WSL integration enabled, or install Docker Engine in the WSL distro."
  }
}

function Convert-ToWslPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ($Path -match '^([A-Za-z]):\\(.*)$') {
    $drive = $Matches[1].ToLowerInvariant()
    $rest = $Matches[2] -replace '\\', '/'
    return "/mnt/$drive/$rest"
  }

  $converted = & wsl.exe wslpath -a $Path
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to convert path to WSL path: $Path"
  }
  return ($converted | Select-Object -First 1)
}

function Quote-Bash {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + ($Value -replace "'", "'\''") + "'"
}

Assert-WslReady

$repoPath = Resolve-Path (Join-Path $PSScriptRoot "..")
$wslRepoPath = Convert-ToWslPath $repoPath.Path
$quotedRepoPath = Quote-Bash $wslRepoPath
$quotedProjectName = Quote-Bash $ProjectName
$overridePath = Join-Path $repoPath.Path ".docker-compose.local-test.override.yml"
$wslOverridePath = Convert-ToWslPath $overridePath

$envPrefix = @(
  "DEV_MODE=true",
  "JWT_SECRET=uno-online-local-test-secret-at-least-32-chars",
  "DOMAIN=localhost",
  "CADDY_SITE_ADDRESS=:80",
  "HTTP_PORT=$HttpPort",
  "HTTPS_PORT=$HttpsPort",
  "MUMBLE_PORT=$MumblePort",
  "MUMBLE_GATEWAY_PORT=$MumbleGatewayPort"
) -join " "

$proxyEnv = ""
if ($ProxyUrl) {
  $quotedProxyUrl = Quote-Bash $ProxyUrl
  $proxyEnv = "HTTP_PROXY=$quotedProxyUrl HTTPS_PROXY=$quotedProxyUrl http_proxy=$quotedProxyUrl https_proxy=$quotedProxyUrl"
}

$composeFiles = "-f docker-compose.yml"
if ($BuildLocal) {
  @"
services:
  server:
    image: uno-online-local-test-server:latest
    build:
      context: .
      dockerfile: Dockerfile
      target: server
      network: host
      args:
        HTTP_PROXY: ${ProxyUrl}
        HTTPS_PROXY: ${ProxyUrl}
        http_proxy: ${ProxyUrl}
        https_proxy: ${ProxyUrl}
  caddy:
    image: uno-online-local-test-caddy:latest
    build:
      context: .
      dockerfile: Dockerfile
      target: caddy
      network: host
      args:
        HTTP_PROXY: ${ProxyUrl}
        HTTPS_PROXY: ${ProxyUrl}
        http_proxy: ${ProxyUrl}
        https_proxy: ${ProxyUrl}
"@ | Set-Content -Path $overridePath -Encoding utf8
  $composeFiles = "$composeFiles -f $(Quote-Bash $wslOverridePath)"
}

$compose = "cd $quotedRepoPath && $envPrefix $proxyEnv docker compose $composeFiles -p $quotedProjectName"
$healthUrl = "http://localhost:$HttpPort/api/health"
$infoUrl = "http://localhost:$HttpPort/api/server/info"

try {
  Write-Host "Starting docker compose project '$ProjectName' via WSL..."
  $upArgs = "up -d --wait --wait-timeout 120"
  if ($BuildLocal) {
    $upArgs = "$upArgs --build"
  }
  Invoke-WslBash "$compose $upArgs"

  Write-Host "Waiting for $healthUrl ..."
  Invoke-WslBash "for i in {1..60}; do if curl -fsS $(Quote-Bash $healthUrl) >/dev/null; then exit 0; fi; sleep 1; done; curl -fsS $(Quote-Bash $healthUrl)"

  Write-Host "Checking server info..."
  Invoke-WslBash "curl -fsS $(Quote-Bash $infoUrl)"

  Write-Host ""
  Write-Host "Checking Windows host access..."
  Invoke-RestMethod -Uri $healthUrl -TimeoutSec 10 | Out-Null
  $serverInfo = Invoke-RestMethod -Uri $infoUrl -TimeoutSec 10
  $serverInfo | ConvertTo-Json -Compress

  Write-Host ""
  Write-Host "Docker compose smoke test passed."
  Write-Host "URL: http://localhost:$HttpPort"

  if ($KeepAlive) {
    Write-Host "KeepAlive is set; leaving containers running."
    Write-Host "Stop with: wsl bash -lc `"cd $wslRepoPath && docker compose -p $ProjectName down`""
  }
} finally {
  if (-not $KeepAlive) {
    Write-Host "Stopping docker compose project '$ProjectName'..."
    try {
      Invoke-WslBash "$compose down --remove-orphans"
    } catch {
      Write-Warning $_
    }
  }
  if ($BuildLocal -and (Test-Path $overridePath)) {
    Remove-Item -LiteralPath $overridePath -Force
  }
}
