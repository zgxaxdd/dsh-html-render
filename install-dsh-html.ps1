# install-dsh-html.ps1 -- Idempotent installer for the dsh-html inline HTML renderer
#
# Injects a page-level client script into the DSH web frontend (dist/index.html),
# syncs the renderer (dsh-html-client.js) and the KaTeX formula engine into
# dist\dsh-html\, and verifies the deployment over HTTP.
#
# Usage:
#   .\install-dsh-html.ps1                          # apply: install / repair (idempotent)
#   .\install-dsh-html.ps1 -Check                   # report install status only, no writes
#   .\install-dsh-html.ps1 -Uninstall               # restore index.html and remove dist\dsh-html
#   .\install-dsh-html.ps1 -Force                   # force re-sync even when hashes match
#   .\install-dsh-html.ps1 -Dist "C:\path\to\dist"  # explicit dist (auto-detect covers npx installs)
#
# Idempotent: safe to re-run. Backs up index.html once (index.html.bak), copies
# files only when missing or changed, and injects the script tag only when absent.
# Exit codes: 0 = installed / checked-OK, 1 = error, 2 = check found problems.

param(
    [string]$Dist,
    [switch]$Check,
    [switch]$Uninstall,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Write-Host '[dsh-html] installer start'

# --- 1. locate the dsh-web-frontend dist -------------------------------------
function Find-Dist {
    if ($script:Dist) { return @([System.IO.Path]::GetFullPath($script:Dist)) }
    $npmCache = $env:npm_config_cache
    if (-not $npmCache) { $npmCache = Join-Path $env:LOCALAPPDATA 'npm-cache' }
    $npxRoot = Join-Path $npmCache '_npx'
    $found = @()
    if (Test-Path $npxRoot) {
        $found = @(Get-ChildItem -Path $npxRoot -Directory -ErrorAction SilentlyContinue |
            ForEach-Object {
                $p = Join-Path $_.FullName 'node_modules\@deepseek-ai\dsh-web-frontend\dist'
                if (Test-Path $p) { $p }
            })
    }
    return $found
}

$targets = @(Find-Dist)
if ($targets.Count -eq 0) {
    Write-Error 'Could not auto-locate the dsh-web-frontend dist. Pass -Dist "C:\path\to\dist" explicitly (for source builds: the web dist output directory).'
    exit 1
}
if ($targets.Count -gt 1) {
    Write-Host "[INFO] multiple dists found; using the first: $($targets[0])"
    Write-Host '[INFO] (run the installer again with -Dist for each additional dist.)'
}
$dist = $targets[0]
$indexPath = Join-Path $dist 'index.html'
$clientDir = Join-Path $dist 'dsh-html'
$clientDst = Join-Path $clientDir 'client.js'
$clientSrc = Join-Path $PSScriptRoot 'dsh-html-client.js'
$katexSrcDir = Join-Path $PSScriptRoot 'vendor\katex'
$katexDstDir = Join-Path $clientDir 'katex'
$bakPath = "$indexPath.bak"
$marker = '<script src="/dsh-html/client.js" defer></script>'

Write-Host "[INFO] dist = $dist"
if (-not (Test-Path $indexPath)) { Write-Error "index.html not found at $indexPath"; exit 1 }

$html = [System.IO.File]::ReadAllText($indexPath)
$injected = $html.Contains($marker) -or $html -match '/dsh-html/client\.js'

function Test-FileState([string]$src, [string]$dst) {
    if (-not (Test-Path $dst)) { return 'missing' }
    if (-not (Test-Path $src)) { return 'no-src' }
    $a = (Get-FileHash $src -Algorithm SHA256).Hash
    $b = (Get-FileHash $dst -Algorithm SHA256).Hash
    if ($a -ne $b) { return 'stale' }
    return 'ok'
}

# --- uninstall ----------------------------------------------------------------
if ($Uninstall) {
    if ($injected) {
        if (Test-Path $bakPath) {
            Copy-Item $bakPath $indexPath -Force
            Write-Host "[OK] index.html restored from backup -> $indexPath"
        } else {
            $clean = $html.Replace($marker, '').Replace("$marker`n", '')
            [System.IO.File]::WriteAllText($indexPath, $clean, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host '[OK] injected script tag removed (no backup existed; line-level restore).'
        }
    } else {
        Write-Host '[SKIP] index.html carries no injection; nothing to restore.'
    }
    if (Test-Path $clientDir) {
        Remove-Item $clientDir -Recurse -Force
        Write-Host "[OK] removed $clientDir"
    } else {
        Write-Host '[SKIP] dist\dsh-html not present.'
    }
    Write-Host '[dsh-html] uninstall complete. Hard-refresh the DSH web GUI (Ctrl+F5).'
    exit 0
}

# --- check --------------------------------------------------------------------
if ($Check) {
    $problems = 0
    $st = Test-FileState $clientSrc $clientDst
    if ($st -ne 'ok') { $problems++ }
    Write-Host ("[{0}] client.js      : {1}" -f ($(if ($st -eq 'ok') {'OK'} else {'ISSUE'}), $st))
    $ksrc = Join-Path $katexSrcDir 'katex.min.js'
    $kdst = Join-Path $katexDstDir 'katex.min.js'
    $st = Test-FileState $ksrc $kdst
    if ($st -ne 'ok') { $problems++ }
    Write-Host ("[{0}] katex engine   : {1}" -f ($(if ($st -eq 'ok') {'OK'} else {'ISSUE'}), $st))
    if (-not (Test-Path (Join-Path $katexDstDir 'fonts'))) { $problems++; Write-Host '[ISSUE] katex fonts  : missing' } else { Write-Host '[OK] katex fonts    : present' }
    if ($injected) { Write-Host '[OK] index.html     : script tag injected' } else { $problems++; Write-Host '[ISSUE] index.html   : injection missing' }
    $bak = if (Test-Path $bakPath) { 'present' } else { 'absent (uninstall will strip the tag instead)' }
    Write-Host "[INFO] backup        : $bak"
    try {
        $port = if ($env:DSH_WEB_PORT) { $env:DSH_WEB_PORT } else { '3080' }
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/dsh-html/client.js" -UseBasicParsing -TimeoutSec 5
        if ($resp.Content -match 'version:\s*(\d+)') {
            Write-Host ("[OK] HTTP            : 200, served renderer version {0}" -f $Matches[1])
        } else { Write-Host '[WARN] HTTP          : 200 but version marker not found' }
    } catch {
        Write-Host "[WARN] HTTP          : probe skipped ($($_.Exception.Message))"
    }
    if ($problems -gt 0) { Write-Host "[dsh-html] check: $problems issue(s). Run without switches to repair."; exit 2 }
    Write-Host '[dsh-html] check: fully installed.'
    exit 0
}

# --- apply (install / repair) ---------------------------------------------------
if (-not (Test-Path $clientSrc)) { Write-Error "renderer truth-source not found at $clientSrc"; exit 1 }

if (-not (Test-Path $bakPath)) {
    Copy-Item $indexPath $bakPath
    Write-Host "[OK] backup created -> $bakPath"
} else {
    Write-Host '[SKIP] backup already exists'
}

$st = Test-FileState $clientSrc $clientDst
if ($Force -or $st -ne 'ok') {
    New-Item -ItemType Directory -Path $clientDir -Force | Out-Null
    Copy-Item $clientSrc $clientDst -Force
    Write-Host "[OK] client.js synced -> $clientDst"
} else {
    Write-Host '[SKIP] client.js already up to date'
}

$ksrc = Join-Path $katexSrcDir 'katex.min.js'
$kdst = Join-Path $katexDstDir 'katex.min.js'
if (Test-Path $katexSrcDir) {
    $st = Test-FileState $ksrc $kdst
    if ($Force -or $st -ne 'ok') {
        Copy-Item $katexSrcDir $katexDstDir -Recurse -Force
        Write-Host "[OK] katex vendor synced -> $katexDstDir"
    } else {
        Write-Host '[SKIP] katex vendor already up to date'
    }
} else {
    Write-Host '[WARN] vendor\katex not found next to installer; LaTeX formulas will not render.'
}

if ($injected) {
    Write-Host '[SKIP] index.html already injected'
} else {
    if (-not $html.Contains('</body>')) { Write-Error "No '</body>' found in $indexPath"; exit 1 }
    $new = $html.Replace('</body>', "$marker`n</body>")
    [System.IO.File]::WriteAllText($indexPath, $new, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host '[OK] script tag injected before </body>'
}

try {
    $port = if ($env:DSH_WEB_PORT) { $env:DSH_WEB_PORT } else { '3080' }
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/dsh-html/client.js" -UseBasicParsing -TimeoutSec 5
    $v = if ($resp.Content -match 'version:\s*(\d+)') { " (renderer v$($Matches[1]))" } else { '' }
    Write-Host "[OK] HTTP 200 verified: http://127.0.0.1:$port/dsh-html/client.js ($($resp.RawContentLength) bytes)$v"
} catch {
    Write-Host "[WARN] HTTP probe skipped ($($_.Exception.Message))"
}

Write-Host '[dsh-html] install complete. Hard-refresh the DSH web GUI (Ctrl+F5) to activate.'
exit 0
