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
#   .\install-dsh-html.ps1 -All                     # process EVERY detected dist, not just the first
#   .\install-dsh-html.ps1 -Dist "C:\path\to\dist"  # explicit dist (auto-detect covers npx installs)
#
# Idempotent: safe to re-run. Backs up index.html once (index.html.bak), copies
# files only when missing or changed, and injects the script tag only when absent.
# Upgrade-safe: if the dist was re-deployed (index.html replaced, injection gone),
# the backup is refreshed to the NEW pristine file so -Uninstall never downgrades.
# Exit codes: 0 = installed / checked-OK, 1 = error, 2 = check found problems.

param(
    [string]$Dist,
    [switch]$Check,
    [switch]$Uninstall,
    [switch]$Force,
    [switch]$All
)

$ErrorActionPreference = 'Stop'
Write-Host '[dsh-html] installer start'

# --- locate dsh-web-frontend dist candidates ----------------------------------
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
    if ($All) {
        Write-Host "[INFO] $($targets.Count) dists found; -All given: processing all of them."
    } else {
        Write-Host "[INFO] multiple dists found; processing only the first: $($targets[0])  (use -All for every dist)"
        $targets = @($targets[0])
    }
}

function Test-FileState([string]$src, [string]$dst) {
    if (-not (Test-Path $dst)) { return 'missing' }
    if (-not (Test-Path $src)) { return 'no-src' }
    $a = (Get-FileHash $src -Algorithm SHA256).Hash
    $b = (Get-FileHash $dst -Algorithm SHA256).Hash
    if ($a -ne $b) { return 'stale' }
    return 'ok'
}

function Invoke-Target([string]$dist) {
    $indexPath = Join-Path $dist 'index.html'
    $clientDir = Join-Path $dist 'dsh-html'
    $clientDst = Join-Path $clientDir 'client.js'
    $clientSrc = Join-Path $PSScriptRoot 'dsh-html-client.js'
    $katexSrcDir = Join-Path $PSScriptRoot 'vendor\katex'
    $katexDstDir = Join-Path $clientDir 'katex'
    $bakPath = "$indexPath.bak"
    # 缓存击穿：注入标签带 client 版本号（?v=N），升级后浏览器强制拉新
    $clientVer = '0'
    if (Test-Path $clientSrc) {
        $cs = [System.IO.File]::ReadAllText($clientSrc)
        if ($cs -match 'dsh-html-renderer version:\s*(\d+)') { $clientVer = $Matches[1] }
    }
    $marker = "<script src=""/dsh-html/client.js?v=$clientVer"" defer></script>"
    $markerRe = '<script src="/dsh-html/client\.js(?:\?v=\d+)?" defer></script>'

    Write-Host "[INFO] dist = $dist"
    if (-not (Test-Path $indexPath)) { Write-Host "[ISSUE] index.html not found at $indexPath"; return 1 }

    $html = [System.IO.File]::ReadAllText($indexPath)
    $injected = ($html -match $markerRe) -or ($html -match '/dsh-html/client\.js')

    # --- uninstall ------------------------------------------------------------
    if ($Uninstall) {
        if ($injected) {
            if (Test-Path $bakPath) {
                Copy-Item $bakPath $indexPath -Force
                Write-Host "[OK] index.html restored from backup -> $indexPath"
            } else {
                $clean = [regex]::Replace($html, $markerRe, '')
                $tmp = "$indexPath.tmp"
                [System.IO.File]::WriteAllText($tmp, $clean, (New-Object System.Text.UTF8Encoding($false)))
                Move-Item $tmp $indexPath -Force   # E4：原子替换
                Write-Host '[OK] injected script tag removed (no backup existed; line-level restore).'
            }
        } else {
            Write-Host '[SKIP] index.html carries no injection; nothing to restore.'
            # E5：若备份来自升级前的旧版 index.html（与当前不一致），丢弃防降级
            if ((Test-Path $bakPath) -and ((Get-FileHash $indexPath -Algorithm SHA256).Hash -ne (Get-FileHash $bakPath -Algorithm SHA256).Hash)) {
                Remove-Item $bakPath -Force
                Write-Host '[OK] stale backup (from a pre-upgrade version) discarded.'
            }
        }
        if (Test-Path $clientDir) {
            Remove-Item $clientDir -Recurse -Force
            Write-Host "[OK] removed $clientDir"
        } else {
            Write-Host '[SKIP] dist\dsh-html not present.'
        }
        Write-Host '[dsh-html] uninstall complete. Hard-refresh the DSH web GUI (Ctrl+F5).'
        return 0
    }

    # --- check ----------------------------------------------------------------
    if ($Check) {
        $problems = 0
        $st = Test-FileState $clientSrc $clientDst
        if ($st -ne 'ok') { $problems++ }
        Write-Host ("[{0}] client.js      : {1}" -f ($(if ($st -eq 'ok') {'OK'} else {'ISSUE'}), $st))
        $kdst = Join-Path $katexDstDir 'katex.min.js'
        $st = Test-FileState (Join-Path $katexSrcDir 'katex.min.js') $kdst
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
        if ($problems -gt 0) { Write-Host "[dsh-html] check: $problems issue(s). Run without switches to repair."; return 2 }
        Write-Host '[dsh-html] check: fully installed.'
        return 0
    }

    # --- apply (install / repair) ----------------------------------------------
    if (-not (Test-Path $clientSrc)) { Write-Host "[ISSUE] renderer truth-source not found at $clientSrc"; return 1 }

    # Upgrade-safe backup: if the dist was re-deployed (index.html replaced by a
    # new pristine file without our injection) and it differs from the stored
    # backup, refresh the backup so a later -Uninstall never downgrades.
    if ((Test-Path $bakPath) -and (-not $injected)) {
        $curHash = (Get-FileHash $indexPath -Algorithm SHA256).Hash
        $bakHash = (Get-FileHash $bakPath -Algorithm SHA256).Hash
        if ($curHash -ne $bakHash) {
            Copy-Item $indexPath $bakPath -Force
            Write-Host '[OK] backup refreshed (dist was re-deployed; new pristine index.html saved)'
        }
    }

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
        if ($html.Contains($marker)) {
            Write-Host '[SKIP] index.html already injected (current version)'
        } elseif ($html -match $markerRe) {
            # 已注入但版本落后：替换标签为新版本号（缓存击穿升级）
            $new = [regex]::Replace($html, $markerRe, $marker)
            $tmp = "$indexPath.tmp"
            [System.IO.File]::WriteAllText($tmp, $new, (New-Object System.Text.UTF8Encoding($false)))
            Move-Item $tmp $indexPath -Force        # E4：原子替换
            Write-Host "[OK] injection tag upgraded (cache-bust v$clientVer)"
        } else {
            Write-Host '[WARN] index.html references /dsh-html/client.js but no standard tag found — leaving as-is'
        }
    } else {
        # E3：定位【最后一个】</body>（大小写不敏感）再注入，避免误伤内联 JS 字符串
        $idx = $html.LastIndexOf('</body>', [System.StringComparison]::OrdinalIgnoreCase)
        if ($idx -lt 0) { Write-Host "[ISSUE] No '</body>' found in $indexPath"; return 1 }
        $new = $html.Substring(0, $idx) + $marker + "`n" + $html.Substring($idx)
        $tmp = "$indexPath.tmp"
        [System.IO.File]::WriteAllText($tmp, $new, (New-Object System.Text.UTF8Encoding($false)))
        Move-Item $tmp $indexPath -Force        # E4：原子替换
        Write-Host "[OK] script tag injected before the last </body> (cache-bust v$clientVer)"
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
    return 0
}

$final = 0
foreach ($t in $targets) {
    try {
        $rc = Invoke-Target $t
    } catch {
        Write-Host "[ISSUE] $t failed: $($_.Exception.Message)"
        $rc = 1
    }
    if ($rc -ne 0) { $final = $rc }
}
exit $final
