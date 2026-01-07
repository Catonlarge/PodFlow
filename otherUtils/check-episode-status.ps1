# 检查 Episode 状态的 PowerShell 脚本
# 用法: .\check-episode-status.ps1 -EpisodeId <episode_id>

param(
    [Parameter(Mandatory=$true)]
    [int]$EpisodeId
)

$baseUrl = "http://localhost:8000"
$endpoint = "$baseUrl/api/episodes/$EpisodeId"

Write-Host ""
Write-Host "=== Checking Episode Status ===" -ForegroundColor Cyan
Write-Host "Episode ID: $EpisodeId" -ForegroundColor White
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method GET
    
    Write-Host "Current Status:" -ForegroundColor Yellow
    Write-Host "  ID: $($response.id)" -ForegroundColor White
    Write-Host "  Title: $($response.title)" -ForegroundColor White
    Write-Host "  Transcription Status: $($response.transcription_status)" -ForegroundColor $(if ($response.transcription_status -eq "failed") { "Red" } elseif ($response.transcription_status -eq "processing") { "Yellow" } elseif ($response.transcription_status -eq "completed") { "Green" } else { "White" })
    Write-Host "  Transcription Progress: $($response.transcription_progress)%" -ForegroundColor White
    
    if ($response.segments) {
        $segments = $response.segments
        $completed = ($segments | Where-Object { $_.status -eq "completed" }).Count
        $failed = ($segments | Where-Object { $_.status -eq "failed" }).Count
        $processing = ($segments | Where-Object { $_.status -eq "processing" }).Count
        $pending = ($segments | Where-Object { $_.status -eq "pending" }).Count
        
        Write-Host ""
        Write-Host "Segments Status:" -ForegroundColor Yellow
        Write-Host "  Total: $($segments.Count)" -ForegroundColor White
        Write-Host "  Completed: $completed" -ForegroundColor Green
        Write-Host "  Processing: $processing" -ForegroundColor Yellow
        Write-Host "  Failed: $failed" -ForegroundColor Red
        Write-Host "  Pending: $pending" -ForegroundColor Gray
        
        if ($failed -gt 0) {
            Write-Host ""
            Write-Host "Failed Segments:" -ForegroundColor Red
            $segments | Where-Object { $_.status -eq "failed" } | ForEach-Object {
                Write-Host "  - Segment $($_.segment_index): $($_.error_message)" -ForegroundColor Red
            }
        }
    }
    
    Write-Host ""
    
    # 提供建议
    if ($response.transcription_status -eq "failed") {
        Write-Host "Status: FAILED" -ForegroundColor Red
        Write-Host "  -> You can click 'Retry' button in frontend to restart transcription" -ForegroundColor Yellow
    } elseif ($response.transcription_status -eq "processing") {
        Write-Host "Status: PROCESSING" -ForegroundColor Yellow
        Write-Host "  -> Transcription is in progress" -ForegroundColor Yellow
    } elseif ($response.transcription_status -eq "completed") {
        Write-Host "Status: COMPLETED" -ForegroundColor Green
        Write-Host "  -> Transcription finished successfully" -ForegroundColor Green
    }
    
    Write-Host ""
    
} catch {
    Write-Host "Failed to get Episode status!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 404) {
            Write-Host "Episode $EpisodeId does not exist" -ForegroundColor Yellow
        }
    }
}

