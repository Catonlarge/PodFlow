# PodFlow One-Click Launcher (Final Fix - Use GET)

# 1. Set Project Root Directory
$ProjectRoot = Get-Location
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  PodFlow Launcher is Starting..."
Write-Host "  Project Root: $ProjectRoot"
Write-Host "========================================================" -ForegroundColor Cyan

# 2. Define Paths
$BackendDir = "$ProjectRoot\backend"
$PythonExe = "$BackendDir\venv\Scripts\python.exe"

# 3. Verify Python Environment
if (!(Test-Path $PythonExe)) {
    Write-Host "[ERROR] Virtual environment Python not found at: $PythonExe" -ForegroundColor Red
    Write-Host "Please ensure 'venv' exists in the backend directory." -ForegroundColor Yellow
    Pause
    exit
}

# 4. Check Frontend Build
$IndexHtml = "$ProjectRoot\frontend\dist\index.html"
if (!(Test-Path $IndexHtml)) {
    Write-Host "[WARNING] Frontend build missing at: $IndexHtml" -ForegroundColor Yellow
}

# 5. Launch Browser (Smart Health Check)
# Modified: Uses GET instead of HEAD to avoid 405 errors
Write-Host "Waiting for AI Models to load before opening browser..." -ForegroundColor Yellow

Start-Job -ScriptBlock {
    $TargetUrl = "http://127.0.0.1:8000/health"
    $AppUrl = "http://127.0.0.1:8000"
    $MaxRetries = 60  # Wait up to 60 seconds
    
    while ($MaxRetries -gt 0) {
        try {
            # FIX: Changed -Method Head to -Method Get
            $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -Method Get -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                # Backend is ready! Open browser now.
                Start-Process $AppUrl
                break
            }
        }
        catch {
            # Backend not ready yet, wait 1 second and retry
            Start-Sleep -Seconds 1
            $MaxRetries--
        }
    }
} | Out-Null

# 6. Execute Backend
Write-Host "Loading AI Models & Starting FastAPI..." -ForegroundColor Green

# Step A: Add 'backend' to PYTHONPATH
$env:PYTHONPATH = $BackendDir

# Step B: Set location to 'backend' root
Set-Location $BackendDir

# Step C: Run Uvicorn directly as a module
& $PythonExe "-m" "uvicorn" "app.main:app" "--host" "127.0.0.1" "--port" "8000" "--reload"

Pause