# Content Studio installer and updater for Windows.
#   Setup  (Setup.cmd in the channel folder):  install.ps1 -Folder "<channel folder>" -Mode setup
#   Update (Update Content Studio.cmd):         install.ps1 -Folder "<channel folder>" -Mode update
# Installs Node.js and Python with winget when missing, downloads the latest Content Studio into
# <channel folder>\tools\content-studio, installs its packages, and starts it. Only the app's own
# files are replaced: playlists, videos, brand and everything else in the channel folder stay as
# they are; packages (node_modules) are kept and topped up. A backup of the old app is kept in
# %LOCALAPPDATA%\ContentStudio\backups (the last three).
param(
  [Parameter(Mandatory = $true)][string]$Folder,
  [ValidateSet('setup', 'update')][string]$Mode = 'setup',
  [string]$Repo = 'skillovert/content-studio',
  [string]$Branch = 'main'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest is many times faster without its own bar
$Folder = (Resolve-Path $Folder).Path.TrimEnd('\')
$App = Join-Path $Folder 'tools\content-studio'
$Work = Join-Path $env:LOCALAPPDATA 'ContentStudio'
$steps = if ($Mode -eq 'setup') { 8 } else { 6 }
$n = 0

function Step($text) {
  $script:n++
  Write-Host ''
  Write-Host ("[{0}/{1}] {2}" -f $script:n, $steps, $text) -ForegroundColor Cyan
}
function Ok($text) { Write-Host "      $text" -ForegroundColor Green }
function Note($text) { Write-Host "      $text" }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Python-Works {
  # the Microsoft Store "python" stub exists but prints nothing useful
  try { return ((& python --version 2>&1) -match '^Python 3\.(1[0-9]|[2-9][0-9])') } catch { return $false }
}
function Winget-Install($id, $name) {
  if (-not (Has 'winget')) { throw "$name is missing and winget is not available. Install $name by hand, then run this again." }
  Note "Installing $name (Windows may ask for permission)..."
  winget install -e --id $id --accept-source-agreements --accept-package-agreements --silent | Out-Host
  Refresh-Path
}

Write-Host ''
Write-Host ("Content Studio {0}" -f $(if ($Mode -eq 'setup') { 'setup' } else { 'update' })) -ForegroundColor White
Write-Host "Channel folder: $Folder"

try {
  if ($Mode -eq 'setup') {
    Step 'Node.js'
    if (-not (Has 'node')) { Winget-Install 'OpenJS.NodeJS.LTS' 'Node.js' }
    if (-not (Has 'node')) { throw 'Node.js did not install. Install the LTS from nodejs.org, then run this again.' }
    Ok ("Node.js " + (& node --version))

    Step 'Python'
    if (-not (Python-Works)) { Winget-Install 'Python.Python.3.12' 'Python' }
    if (Python-Works) { Ok (& python --version 2>&1) } else { Note 'Python is not ready yet. Plan PDFs and synthetic voices need it; run Setup again after a restart.' }
  }

  Step 'Downloading the latest Content Studio'
  New-Item -ItemType Directory -Force -Path $Work | Out-Null
  $zip = Join-Path $Work 'content-studio.zip'
  $unz = Join-Path $Work 'download'
  Invoke-WebRequest -Uri "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $zip -UseBasicParsing
  if (Test-Path $unz) { Remove-Item -Recurse -Force $unz }
  Expand-Archive -Path $zip -DestinationPath $unz -Force
  $src = (Get-ChildItem $unz -Directory | Select-Object -First 1).FullName
  $ver = (Get-Content (Join-Path $src 'package.json') -Raw | ConvertFrom-Json).version
  Ok "Version $ver"

  Step 'Closing Content Studio if it is open'
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'content-studio.server.index\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Ok 'Done'

  Step 'Installing the app files'
  if (Test-Path (Join-Path $App 'package.json')) {
    $old = (Get-Content (Join-Path $App 'package.json') -Raw | ConvertFrom-Json).version
    $bk = Join-Path $Work ("backups\content-studio-{0}-{1}" -f $old, (Get-Date -Format 'yyyyMMdd-HHmmss'))
    robocopy $App $bk /E /XD node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
    Get-ChildItem (Join-Path $Work 'backups') -Directory | Sort-Object CreationTime -Descending | Select-Object -Skip 3 | Remove-Item -Recurse -Force
    Note "Backup of version $old kept in $bk"
  }
  New-Item -ItemType Directory -Force -Path $App | Out-Null
  # mirror the new files; packages and files made on this PC (brand copies, theme fonts) stay
  robocopy $src $App /MIR /XD node_modules (Join-Path $App 'engine\public\brand') (Join-Path $App 'engine\public\fonts\themes') /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copying the app files failed (robocopy $LASTEXITCODE)." }
  Ok "Installed in $App"

  Step 'Installing packages (the first time takes a few minutes, about 1 GB)'
  Push-Location $App
  & npm install --omit=dev --no-audit --no-fund | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed for the app.' }
  Pop-Location
  if (-not (Test-Path (Join-Path $Folder 'studio'))) {
    Push-Location (Join-Path $App 'engine')
    & npm install --no-audit --no-fund | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed for the renderer (engine).' }
    Pop-Location
  }
  if (Python-Works) {
    & python -m pip install --user --quiet --disable-pip-version-check reportlab edge-tts numpy | Out-Host
  }
  Ok 'Packages ready'

  if ($Mode -eq 'setup') {
    Step 'Shortcuts'
    $ws = New-Object -ComObject WScript.Shell
    $target = Join-Path $App 'Content Studio.cmd'
    foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))) {
      $lnk = $ws.CreateShortcut((Join-Path $dir 'Content Studio.lnk'))
      $lnk.TargetPath = $target
      $lnk.WorkingDirectory = $App
      $lnk.WindowStyle = 7 # minimized
      $lnk.Save()
    }
    Ok 'On the desktop, and it starts with Windows'
  }

  Step 'Starting Content Studio'
  Start-Process -FilePath (Join-Path $App 'Content Studio.cmd') -WorkingDirectory $App -WindowStyle Minimized
  Ok 'It opens in your browser at http://127.0.0.1:4330'
  Write-Host ''
  Write-Host 'All done. You can close this window.' -ForegroundColor Green
  if ($Mode -eq 'setup') { Write-Host 'Back in Claude, say "done" in the setup thread.' }
}
catch {
  Write-Host ''
  Write-Host ('Stopped: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Nothing in your channel folder was changed. Copy this message into the setup thread in Claude for help.'
  exit 1
}
