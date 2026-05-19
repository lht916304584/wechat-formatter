$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$HostName = "127.0.0.1"
$Port = if ($env:PORT) { [int]$env:PORT } else { 4173 }

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".md"   = "text/markdown; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".txt"  = "text/plain; charset=utf-8"
}

function Get-SafeFilePath {
  param([string]$RawUrl)

  $pathOnly = ($RawUrl -split "\?")[0]
  $decoded = [Uri]::UnescapeDataString($pathOnly)
  if ([string]::IsNullOrWhiteSpace($decoded) -or $decoded -eq "/") {
    $decoded = "/index.html"
  }

  $relative = $decoded.TrimStart("/", "\")
  $full = [IO.Path]::GetFullPath((Join-Path $Root $relative))
  if (-not $full.StartsWith($Root.Path, [StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  return $full
}

function Write-Response {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [byte[]]$Bytes,
    [string]$ContentType
  )

  $Response.StatusCode = $StatusCode
  $Response.ContentType = $ContentType
  $Response.Headers["Cache-Control"] = "no-store"
  $Response.ContentLength64 = $Bytes.Length
  $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  $Response.OutputStream.Close()
}

$listener = $null
$started = $false
for ($i = 0; $i -lt 20 -and -not $started; $i++) {
  $listener = [System.Net.HttpListener]::new()
  $prefix = "http://$HostName`:$Port/"
  $listener.Prefixes.Add($prefix)
  try {
    $listener.Start()
    $started = $true
  } catch {
    $listener.Close()
    $Port++
  }
}

if (-not $started) {
  throw "Unable to start local server. Please check port usage."
}

$Url = "http://$HostName`:$Port/index.html"
Write-Host ""
Write-Host "[ZgEdit] Local server started"
Write-Host "[ZgEdit] URL: $Url"
Write-Host "[ZgEdit] Close this window to stop the server"
Write-Host ""
Start-Process $Url

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = Get-SafeFilePath $context.Request.RawUrl

    if ($null -eq $requestPath) {
      $bytes = [Text.Encoding]::UTF8.GetBytes("Forbidden")
      Write-Response $context.Response 403 $bytes "text/plain; charset=utf-8"
      continue
    }

    if (-not (Test-Path -LiteralPath $requestPath -PathType Leaf)) {
      $bytes = [Text.Encoding]::UTF8.GetBytes("Not found")
      Write-Response $context.Response 404 $bytes "text/plain; charset=utf-8"
      continue
    }

    $ext = [IO.Path]::GetExtension($requestPath).ToLowerInvariant()
    $contentType = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { "application/octet-stream" }
    $bytes = [IO.File]::ReadAllBytes($requestPath)
    Write-Response $context.Response 200 $bytes $contentType
  }
} finally {
  if ($listener) {
    $listener.Stop()
    $listener.Close()
  }
}
