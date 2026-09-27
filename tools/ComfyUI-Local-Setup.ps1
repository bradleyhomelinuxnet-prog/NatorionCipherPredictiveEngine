<#
  ComfyUI local setup — Windows 11, any GPU or none
  Python 3.12 + PyTorch + ComfyUI + ComfyUI-Manager, wired up and ready to go.

  Run in PowerShell (not as Administrator; winget may prompt once):
      Set-ExecutionPolicy -Scope Process Bypass
      .\ComfyUI-Local-Setup.ps1 -Backend directml     # AMD Radeon on Windows
      .\ComfyUI-Local-Setup.ps1 -Backend xpu          # Intel Arc / Core Ultra
      .\ComfyUI-Local-Setup.ps1 -Backend cpu          # no usable GPU (slow: stills only)
      .\ComfyUI-Local-Setup.ps1 -Backend cuda         # NVIDIA (needs the NVIDIA driver)

  Not sure which? Run it with -Backend list: it prints your graphics adapters and stops.

  Written from a cloud session with no Windows and no GPU, so it has NOT been run here.
  Every step is idempotent: run it again after fixing anything it reports. Read it before running.

  Keys (SimpliGen or any other) never go in this file or in a repo. Put them in an environment
  variable or a git-ignored .env file — see the end of this script.
#>

param(
  [ValidateSet("list", "cuda", "directml", "xpu", "cpu")]
  [string]$Backend = "list",
  [string]$Root = "$HOME\AI",              # where ComfyUI lives: C:\Users\<you>\AI\ComfyUI
  [string]$Cuda = "cu128"                   # cuda only: the PyTorch wheel tag (cu126 / cu128 / cu130 …);
                                            # check the current one at pytorch.org → Get Started
)

$ErrorActionPreference = "Stop"
function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

Step "Graphics adapters on this machine"
Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion | Format-Table -AutoSize
if ($Backend -eq "list") {
  Write-Host "Pick a backend from the adapters above and rerun:" -ForegroundColor Yellow
  Write-Host "  NVIDIA          -> -Backend cuda"
  Write-Host "  AMD Radeon      -> -Backend directml   (newer RX 7000/9000: AMD also offers ROCm on Windows; see AMD's PyTorch page)"
  Write-Host "  Intel Arc/Ultra -> -Backend xpu"
  Write-Host "  none of those   -> -Backend cpu        (stills only, minutes per image)"
  exit 0
}
if ($Backend -eq "cuda") {
  try { nvidia-smi | Select-Object -First 12 } catch { throw "nvidia-smi not found. Install the current NVIDIA driver first, or pick another backend." }
}

Step "1/6  Python 3.12"
$havePy = (Get-Command py -ErrorAction SilentlyContinue) -and (py -3.12 --version 2>$null)
if (-not $havePy) {
  winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
  Write-Host "Python installed. Close and reopen PowerShell, then rerun this script with the same -Backend." -ForegroundColor Yellow
  exit 0
}
py -3.12 --version

Step "2/6  Git"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  Write-Host "Git installed. Close and reopen PowerShell, then rerun this script with the same -Backend." -ForegroundColor Yellow
  exit 0
}

Step "3/6  ComfyUI"
New-Item -ItemType Directory -Force -Path $Root | Out-Null
$comfy = Join-Path $Root "ComfyUI"
if (-not (Test-Path (Join-Path $comfy "main.py"))) { git clone https://github.com/comfyanonymous/ComfyUI.git $comfy } else { git -C $comfy pull --ff-only }

Step "4/6  Virtual environment + PyTorch ($Backend)"
$venv = Join-Path $comfy "venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) { py -3.12 -m venv $venv }
$python = Join-Path $venv "Scripts\python.exe"
& $python -m pip install --upgrade pip
switch ($Backend) {
  "cuda"     { & $python -m pip install torch torchvision torchaudio --index-url "https://download.pytorch.org/whl/$Cuda" }
  "xpu"      { & $python -m pip install torch torchvision torchaudio --index-url "https://download.pytorch.org/whl/xpu" }
  "cpu"      { & $python -m pip install torch torchvision torchaudio --index-url "https://download.pytorch.org/whl/cpu" }
  "directml" { & $python -m pip install torch-directml }   # brings the torch build it needs; the rest comes with the requirements
}
& $python -m pip install -r (Join-Path $comfy "requirements.txt")

Step "5/6  ComfyUI-Manager (installs other custom nodes from inside the UI)"
$mgr = Join-Path $comfy "custom_nodes\ComfyUI-Manager"
if (-not (Test-Path $mgr)) { git clone https://github.com/ltdrdata/ComfyUI-Manager.git $mgr } else { git -C $mgr pull --ff-only }
if (Test-Path (Join-Path $mgr "requirements.txt")) { & $python -m pip install -r (Join-Path $mgr "requirements.txt") }

Step "6/6  Verify the backend from inside the venv"
switch ($Backend) {
  "cuda"     { & $python -c "import torch; print('torch', torch.__version__); print('cuda:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE - check the driver and the wheel tag')" }
  "xpu"      { & $python -c "import torch; print('torch', torch.__version__); print('xpu:', hasattr(torch, 'xpu') and torch.xpu.is_available(), torch.xpu.get_device_name(0) if hasattr(torch, 'xpu') and torch.xpu.is_available() else 'NONE - install the Intel graphics driver')" }
  "cpu"      { & $python -c "import torch; print('torch', torch.__version__, '(cpu)')" }
  "directml" { & $python -c "import torch, torch_directml; d = torch_directml.device(); print('torch', torch.__version__); print('directml device:', torch_directml.device_name(0))" }
}

# The launcher: double-click run-comfyui.bat, then open http://127.0.0.1:8188
$flag = switch ($Backend) { "directml" { "--directml" } "cpu" { "--cpu" } default { "" } }
$bat = Join-Path $comfy "run-comfyui.bat"
@"
@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
python main.py --listen 127.0.0.1 --port 8188 $flag
pause
"@ | Set-Content -Path $bat -Encoding ASCII

Write-Host "`nDone. Models go in $comfy\models\checkpoints (and \models\loras, \models\vae ...)." -ForegroundColor Green
Write-Host "Start it with: $bat   then open http://127.0.0.1:8188" -ForegroundColor Green
if ($Backend -eq "cpu") { Write-Host "CPU mode: start with a small SD 1.5 checkpoint at 512x512 and low step counts. Video models are out of reach here." -ForegroundColor Yellow }
if ($Backend -eq "directml") { Write-Host "DirectML: expect slower runs than CUDA and less VRAM headroom; --lowvram is worth trying on 8 GB cards." -ForegroundColor Yellow }

<#
  Keys. Keep them out of files that get committed. For a service key used by a custom node:
      [Environment]::SetEnvironmentVariable("SIMPLIGEN_API_KEY", "<paste the key>", "User")
  (reopen PowerShell afterwards). A key that has been pasted into a chat should be rotated first.
#>
