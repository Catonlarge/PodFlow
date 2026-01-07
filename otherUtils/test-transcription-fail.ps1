# 测试转录失败场景的 PowerShell 脚本
# 用法: .\test-transcription-fail.ps1 -EpisodeId <episode_id> [-ErrorType <error_type>]
#
# 注意: 参数名和值之间必须用空格，不能用等号！
#
# 例子:
#   .\test-transcription-fail.ps1 -EpisodeId 1
#   .\test-transcription-fail.ps1 -EpisodeId 1 -ErrorType network

param(
    [Parameter(Mandatory=$true)]
    [int]$EpisodeId,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("network", "model", "file", "memory")]
    [string]$ErrorType = "model"
)

$baseUrl = "http://localhost:8000"
$endpoint = "$baseUrl/api/episodes/$EpisodeId/transcribe/test-fail?error_type=$ErrorType"

Write-Host ""
Write-Host "=== Test Transcription Failure ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Episode ID: $EpisodeId" -ForegroundColor White
Write-Host "Error Type: $ErrorType" -ForegroundColor White
Write-Host ""
Write-Host "Calling test endpoint..." -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -ContentType "application/json"
    
    Write-Host "Success!" -ForegroundColor Green
    Write-Host ""
    
    $errorMessages = @{
        "network" = "网络问题，请检查网络连接后重试"
        "model" = "模型处理失败，请重试"
        "file" = "音频处理失败，请重试"
        "memory" = "内存不足，请稍后重试"
    }
    
    Write-Host "Expected error message:" -ForegroundColor Cyan
    Write-Host "  $($errorMessages[$ErrorType])" -ForegroundColor White
    Write-Host ""
    
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Open the frontend page and find Episode ID $EpisodeId" -ForegroundColor White
    Write-Host "  2. You should see a friendly error message and a blue 'Retry' button" -ForegroundColor White
    Write-Host "  3. Click the 'Retry' button to restart transcription" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host "Failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        
        if ($statusCode -eq 404) {
            Write-Host "Tip: Episode $EpisodeId does not exist" -ForegroundColor Yellow
            Write-Host "  Please check:" -ForegroundColor Yellow
            Write-Host "  - Is the Episode ID correct?" -ForegroundColor Yellow
            Write-Host "  - Have you uploaded an audio file?" -ForegroundColor Yellow
        } elseif ($statusCode -eq 500) {
            Write-Host "Tip: Server error" -ForegroundColor Yellow
            Write-Host "  Please check:" -ForegroundColor Yellow
            Write-Host "  - Is the backend service running on port 8000?" -ForegroundColor Yellow
            Write-Host "  - Check backend logs for error messages" -ForegroundColor Yellow
        } else {
            Write-Host "HTTP Status Code: $statusCode" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Tip: Cannot connect to server" -ForegroundColor Yellow
        Write-Host "  Please confirm backend service is running: http://localhost:8000" -ForegroundColor Yellow
    }
    
    Write-Host ""
}
