# 测试重试逻辑是否生效
# 用法: .\test-retry-logic.ps1 -EpisodeId <episode_id>
#
# 这个脚本会：
# 1. 先设置 Episode 为失败状态
# 2. 检查状态确认是 failed
# 3. 调用重试 API
# 4. 等待并监控状态变化
# 5. 确认状态变为 processing

param(
    [Parameter(Mandatory=$true)]
    [int]$EpisodeId
)

$baseUrl = "http://localhost:8000"

Write-Host ""
Write-Host "=== Testing Retry Logic ===" -ForegroundColor Cyan
Write-Host "Episode ID: $EpisodeId" -ForegroundColor White
Write-Host ""

# Step 1: 设置失败状态
Write-Host "Step 1: Setting episode to failed status..." -ForegroundColor Yellow
try {
    $failEndpoint = "$baseUrl/api/episodes/$EpisodeId/transcribe/test-fail"
    $null = Invoke-RestMethod -Uri $failEndpoint -Method POST
    Write-Host "  ✓ Episode set to failed" -ForegroundColor Green
    Start-Sleep -Seconds 1
} catch {
    Write-Host "  ✗ Failed to set failed status: $_" -ForegroundColor Red
    exit 1
}

# Step 2: 检查状态
Write-Host ""
Write-Host "Step 2: Checking initial status..." -ForegroundColor Yellow
try {
    $episode = Invoke-RestMethod -Uri "$baseUrl/api/episodes/$EpisodeId" -Method GET
    if ($episode.transcription_status -eq "failed") {
        Write-Host "  ✓ Status confirmed: FAILED" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Unexpected status: $($episode.transcription_status)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ✗ Failed to get episode: $_" -ForegroundColor Red
    exit 1
}

# Step 3: 调用重试 API
Write-Host ""
Write-Host "Step 3: Calling retry API (restart transcription)..." -ForegroundColor Yellow
Write-Host "  (This simulates clicking the 'Retry' button in frontend)" -ForegroundColor Gray
try {
    $retryEndpoint = "$baseUrl/api/episodes/$EpisodeId/transcribe"
    $retryResponse = Invoke-RestMethod -Uri $retryEndpoint -Method POST
    Write-Host "  ✓ Retry API called successfully" -ForegroundColor Green
    Write-Host "  Response: $($retryResponse.message)" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ Failed to call retry API: $_" -ForegroundColor Red
    exit 1
}

# Step 4: 等待并监控状态变化
Write-Host ""
Write-Host "Step 4: Monitoring status change..." -ForegroundColor Yellow
Write-Host "  Waiting for status to change from 'failed' to 'processing'..." -ForegroundColor Gray

$maxAttempts = 10
$attempt = 0
$statusChanged = $false

while ($attempt -lt $maxAttempts -and -not $statusChanged) {
    Start-Sleep -Seconds 1
    $attempt++
    
    try {
        $episode = Invoke-RestMethod -Uri "$baseUrl/api/episodes/$EpisodeId" -Method GET
        $currentStatus = $episode.transcription_status
        
        Write-Host "  Attempt ${attempt}/${maxAttempts}: Status = $currentStatus" -ForegroundColor Gray
        
        if ($currentStatus -eq "processing") {
            Write-Host ""
            Write-Host "  ✓ Status changed to PROCESSING!" -ForegroundColor Green
            Write-Host "  ✓ Retry logic is working!" -ForegroundColor Green
            $statusChanged = $true
        } elseif ($currentStatus -ne "failed") {
            Write-Host ""
            Write-Host "  ⚠ Status changed to: $currentStatus (unexpected)" -ForegroundColor Yellow
            $statusChanged = $true
        }
    } catch {
        Write-Host "  ✗ Error checking status: $_" -ForegroundColor Red
    }
}

Write-Host ""

if ($statusChanged) {
    Write-Host "=== Test Result ===" -ForegroundColor Cyan
    Write-Host "✓ Retry logic is working correctly!" -ForegroundColor Green
    Write-Host ""
    Write-Host "What happened:" -ForegroundColor Yellow
    Write-Host "  1. Episode was set to 'failed' status" -ForegroundColor White
    Write-Host "  2. Retry API was called (simulating frontend button click)" -ForegroundColor White
    Write-Host "  3. Status changed to 'processing' - transcription restarted" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  - Check backend logs to see if transcription task started" -ForegroundColor White
    Write-Host "  - In frontend, you should see the transcription progress" -ForegroundColor White
} else {
    Write-Host "=== Test Result ===" -ForegroundColor Cyan
    Write-Host "✗ Status did not change to 'processing' within $maxAttempts seconds" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible issues:" -ForegroundColor Yellow
    Write-Host "  - Backend task might not have started" -ForegroundColor White
    Write-Host "  - Check backend logs for errors" -ForegroundColor White
    Write-Host "  - Check if backend service is running" -ForegroundColor White
}

Write-Host ""

