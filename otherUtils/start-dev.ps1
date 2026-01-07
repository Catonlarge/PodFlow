# PodFlow Development Environment Startup Script
# Purpose: Start both backend and frontend services

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PodFlow Development Environment Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory (project root)
# Get script directory (root/otherUtils)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Get Project Root (Go up one level)
$ProjectRoot = Split-Path -Parent $ScriptDir

# Check if backend virtual environment exists
$BackendVenvPath = Join-Path $ProjectRoot "backend\venv\Scripts\Activate.ps1"
if (-not (Test-Path $BackendVenvPath)) {
    Write-Host "Error: Backend virtual environment not found!" -ForegroundColor Red
    Write-Host "Please run: cd backend; python -m venv venv; .\venv\Scripts\Activate.ps1; pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

# Check if frontend node_modules exists
$FrontendNodeModulesPath = Join-Path $ProjectRoot "frontend\node_modules"
if (-not (Test-Path $FrontendNodeModulesPath)) {
    Write-Host "Warning: Frontend dependencies not installed!" -ForegroundColor Yellow
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location (Join-Path $ProjectRoot "frontend")
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Frontend dependency installation failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "Frontend dependencies installed successfully!" -ForegroundColor Green
    Write-Host ""
}

# Check if ports are in use
function Test-Port {
    param([int]$Port)
    $connection = Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
    return $connection
}

$BackendPort = 8000
$FrontendPort = 5173

if (Test-Port -Port $BackendPort) {
    Write-Host "Warning: Port $BackendPort is already in use! Backend service may already be running." -ForegroundColor Yellow
    Write-Host "If backend service is already running, you can skip starting it." -ForegroundColor Yellow
    Write-Host ""
}

if (Test-Port -Port $FrontendPort) {
    Write-Host "Warning: Port $FrontendPort is already in use! Frontend service may already be running." -ForegroundColor Yellow
    Write-Host "If frontend service is already running, you can skip starting it." -ForegroundColor Yellow
    Write-Host ""
}

# Start backend service
Write-Host "Starting backend service..." -ForegroundColor Green
$BackendPythonPath = Join-Path $ProjectRoot "backend\venv\Scripts\python.exe"
$BackendDir = Join-Path $ProjectRoot "backend"
$BackendCommand = "`& `"$BackendPythonPath`" -m uvicorn app.main:app --reload --host 127.0.0.1 --port $BackendPort"
$BackendArgs = "-NoExit", "-Command", $BackendCommand

Start-Process powershell.exe -ArgumentList $BackendArgs -WorkingDirectory $BackendDir -WindowStyle Normal

Write-Host "Backend service starting..." -ForegroundColor Green
Start-Sleep -Seconds 2

# Start frontend service
Write-Host "Starting frontend service..." -ForegroundColor Green
$FrontendDir = Join-Path $ProjectRoot "frontend"
$FrontendArgs = "-NoExit", "-Command", "npm run dev"

Start-Process powershell.exe -ArgumentList $FrontendArgs -WorkingDirectory $FrontendDir -WindowStyle Normal

Write-Host "Frontend service starting..." -ForegroundColor Green
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Startup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend service: http://localhost:$BackendPort" -ForegroundColor Cyan
Write-Host "Frontend service: http://localhost:$FrontendPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tips:" -ForegroundColor Yellow
Write-Host "  - Two service windows have been opened, do not close them" -ForegroundColor Yellow
Write-Host "  - Close the window to stop the corresponding service" -ForegroundColor Yellow
Write-Host "  - Visit the frontend address in your browser to view the application" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit (services will continue running)..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
