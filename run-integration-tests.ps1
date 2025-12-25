# PodFlow 集成测试运行脚本
# Purpose: 运行前端和后端的集成测试，并生成测试报告

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PodFlow 集成测试 (Integration Tests)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory (project root)
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Create reports directory
$ReportsDir = Join-Path $ProjectRoot "reports"
if (-not (Test-Path $ReportsDir)) {
    New-Item -ItemType Directory -Path $ReportsDir | Out-Null
    Write-Host "Created reports directory: $ReportsDir" -ForegroundColor Gray
}

# Timestamp for report files
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackendReportPath = Join-Path $ReportsDir "backend_integration_test_$Timestamp.html"
$FrontendReportPath = Join-Path $ReportsDir "frontend_integration_test_$Timestamp.txt"

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
    Write-Host "Error: Frontend dependencies not installed!" -ForegroundColor Red
    Write-Host "Please run: cd frontend; npm install" -ForegroundColor Yellow
    exit 1
}

# Check if pytest-html is installed (for HTML reports)
$BackendDir = Join-Path $ProjectRoot "backend"
$BackendPythonPath = Join-Path $ProjectRoot "backend\venv\Scripts\python.exe"
Push-Location $BackendDir
& $BackendPythonPath -m pip show pytest-html | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing pytest-html for test reports..." -ForegroundColor Yellow
    & $BackendPythonPath -m pip install pytest-html
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: Failed to install pytest-html. Reports will be in console format only." -ForegroundColor Yellow
        $UseHtmlReport = $false
    } else {
        $UseHtmlReport = $true
    }
} else {
    $UseHtmlReport = $true
}
Pop-Location

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "  运行后端集成测试" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host ""
Write-Host "注意: 集成测试可能需要较长时间，请耐心等待..." -ForegroundColor Yellow
Write-Host ""

# Activate virtual environment and run backend integration tests
Push-Location $BackendDir
& $BackendVenvPath
if ($UseHtmlReport) {
    & $BackendPythonPath -m pytest tests/ -m integration -v --html=$BackendReportPath --self-contained-html
} else {
    & $BackendPythonPath -m pytest tests/ -m integration -v
}
$BackendTestResult = $LASTEXITCODE
Pop-Location

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "  运行前端集成测试" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host ""

# Run frontend integration tests (tests/ directory)
$FrontendDir = Join-Path $ProjectRoot "frontend"
Push-Location $FrontendDir
# Run tests and save output to file
$FrontendOutput = npm run test -- src/tests --run --reporter=verbose 2>&1
$FrontendOutput | Out-File -FilePath $FrontendReportPath -Encoding UTF8
$FrontendOutput
$FrontendTestResult = $LASTEXITCODE
Pop-Location

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  测试结果汇总" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($BackendTestResult -eq 0) {
    Write-Host "后端集成测试: " -NoNewline
    Write-Host "通过" -ForegroundColor Green
    if ($UseHtmlReport) {
        Write-Host "  报告位置: $BackendReportPath" -ForegroundColor Gray
    }
} else {
    Write-Host "后端集成测试: " -NoNewline
    Write-Host "失败" -ForegroundColor Red
    if ($UseHtmlReport) {
        Write-Host "  报告位置: $BackendReportPath" -ForegroundColor Gray
    }
}

if ($FrontendTestResult -eq 0) {
    Write-Host "前端集成测试: " -NoNewline
    Write-Host "通过" -ForegroundColor Green
    Write-Host "  报告位置: $FrontendReportPath" -ForegroundColor Gray
} else {
    Write-Host "前端集成测试: " -NoNewline
    Write-Host "失败" -ForegroundColor Red
    Write-Host "  报告位置: $FrontendReportPath" -ForegroundColor Gray
}

Write-Host ""

# Exit with error if any test failed
if (($BackendTestResult -ne 0) -or ($FrontendTestResult -ne 0)) {
    Write-Host "部分测试失败，请查看报告了解详情。" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "所有集成测试通过！" -ForegroundColor Green
    exit 0
}

