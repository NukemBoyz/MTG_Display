# Downloads Python's official "embeddable package" and unpacks it into
# .\python. Nothing is installed: no registry keys, no PATH changes, no
# admin rights. Deleting this folder removes every trace.

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Say($msg, $colour = "Gray") { Write-Host "  $msg" -ForegroundColor $colour }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   MTG Display - one time setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Already done?
if (Test-Path ".\python\python.exe") {
    Say "Python is already set up here. Nothing to do." "Green"
    Write-Host ""
    Say "Start the scoreboard with:  2_START_MTG.bat" "White"
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 0
}

$zipPath = $null

# Did the user already drop an embeddable zip in this folder?
$existing = Get-ChildItem -Filter "python-3*-embed-amd64.zip" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
if ($existing) {
    Say "Found a Python zip you already downloaded:" "Green"
    Say "   $($existing.Name)"
    $zipPath = $existing.FullName
}

# Otherwise download one.
if (-not $zipPath) {
    Say "Downloading Python (about 10 MB) from python.org ..." "Yellow"
    Write-Host ""

    try {
        [Net.ServicePointManager]::SecurityProtocol =
            [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11
    } catch { }

    # Several versions, tried in order, so one bad link cannot block setup.
    $versions = @("3.12.10", "3.12.8", "3.12.7", "3.12.4",
                  "3.11.9", "3.13.2", "3.13.1")

    $target = Join-Path $PSScriptRoot "python-embed.zip"
    $prev = $ProgressPreference
    $ProgressPreference = "SilentlyContinue"

    foreach ($v in $versions) {
        $url = "https://www.python.org/ftp/python/$v/python-$v-embed-amd64.zip"
        Say "trying $v ..."
        try {
            Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 90
            if ((Get-Item $target).Length -gt 4MB) {
                Say "got Python $v" "Green"
                $zipPath = $target
                break
            }
            Remove-Item $target -Force -ErrorAction SilentlyContinue
        } catch {
            Remove-Item $target -Force -ErrorAction SilentlyContinue
        }
    }
    $ProgressPreference = $prev
}

if (-not $zipPath) {
    Write-Host ""
    Write-Host "  Could not download Python automatically." -ForegroundColor Red
    Write-Host ""
    Say "Do it by hand instead - it is still only one file:" "White"
    Write-Host ""
    Say "  1. Open  https://www.python.org/downloads/windows/"
    Say "  2. Under any Python 3.11, 3.12 or 3.13 release, find"
    Say "     'Windows embeddable package (64-bit)'"
    Say "  3. Save that .zip into THIS folder:"
    Say "     $PSScriptRoot"
    Say "  4. Run 1_SETUP.bat again - it will pick the zip up."
    Write-Host ""
    Say "If your workplace or ISP blocks python.org, that is the" "DarkGray"
    Say "likely cause of the failure above." "DarkGray"
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

# Unpack
Write-Host ""
Say "Unpacking into .\python ..." "Yellow"
try {
    if (Test-Path ".\python") { Remove-Item ".\python" -Recurse -Force }
    Expand-Archive -LiteralPath $zipPath -DestinationPath ".\python" -Force
} catch {
    Write-Host ""
    Write-Host "  Could not unpack the zip." -ForegroundColor Red
    Say "Windows may have blocked it. Right-click the .zip, choose"
    Say "Properties, tick 'Unblock' if you see it, then try again."
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

if (-not (Test-Path ".\python\python.exe")) {
    Write-Host ""
    Write-Host "  The zip unpacked but python.exe is not in it." -ForegroundColor Red
    Say "Make sure you grabbed the 'embeddable package (64-bit)',"
    Say "not the installer and not the source tarball."
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

# Prove it actually runs on this machine
try {
    $ver = (& ".\python\python.exe" --version 2>&1) -join " "
    Say "working: $ver" "Green"
} catch {
    Write-Host ""
    Write-Host "  python.exe unpacked but will not run." -ForegroundColor Red
    Say "This usually means the Microsoft Visual C++ Redistributable"
    Say "is missing. Install it from:"
    Say "  https://aka.ms/vs/17/release/vc_redist.x64.exe"
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

# Tidy up the downloaded archive (keep a zip the user supplied themselves)
if ($zipPath -eq (Join-Path $PSScriptRoot "python-embed.zip")) {
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
}

# Desktop shortcut so it feels like a normal program
try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $lnk = Join-Path $desktop "MTG Display.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($lnk)
    $sc.TargetPath = Join-Path $PSScriptRoot "2_START_MTG.bat"
    $sc.WorkingDirectory = $PSScriptRoot
    $sc.Description = "MTG Display scoreboard"
    $sc.IconLocation = Join-Path $PSScriptRoot "Icons\MTG_Cards.ico"
    $sc.Save()
    Say "Desktop shortcut created: MTG Display" "Green"
} catch {
    Say "(could not create a desktop shortcut - not a problem)" "DarkGray"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   READY" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Say "Start the scoreboard with either:" "White"
Write-Host ""
Say "   the 'MTG Display' icon on your Desktop" "White"
Say "   or  2_START_MTG.bat  in this folder" "White"
Write-Host ""
Say "Nothing was installed. This whole folder is self-contained -" "DarkGray"
Say "copy it to a USB stick or another PC and it works there too." "DarkGray"
Write-Host ""
Read-Host "Press Enter to close"
exit 0
