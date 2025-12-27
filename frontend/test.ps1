# Frontend 测试运行脚本（修复中文乱码问题）
# Purpose: 运行前端测试并确保输出使用 UTF-8 编码
#
# 使用方法：
#   1. 控制台输出（推荐）：直接运行 npm run test，中文显示正常
#   2. 保存到文件：在 PowerShell 中运行以下命令：
#      $OutputEncoding = [System.Text.Encoding]::UTF8
#      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
#      chcp 65001 | Out-Null
#      npm run test -- --run 2>&1 | Out-File -FilePath output.txt -Encoding utf8
#
# 注意：由于 Node.js 在 Windows 上默认使用 GBK 编码输出，
# 保存到文件时需要在运行命令前设置编码环境变量，否则会出现乱码

# 设置 UTF-8 编码以正确显示中文
chcp 65001 | Out-Null
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# 设置所有文件操作的默认编码为 UTF-8
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'

# 设置环境变量
$env:NODE_OPTIONS = "--no-warnings"
$env:PYTHONIOENCODING = "utf-8"

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $ScriptDir

# 运行测试
# 获取通过 npm 传递的参数（npm 会将 -- 后面的参数作为 $args 传递）
# 如果直接运行脚本，$args 会包含命令行参数
# 如果通过 npm run test -- args 运行，参数会通过环境变量或直接传递
$testArgs = $args

# 检测 stdout 是否被重定向到文件
$isRedirected = [Console]::IsOutputRedirected

# 运行 vitest
# 注意：由于 Node.js 在 Windows 上默认使用 GBK 编码输出，
# 当输出被重定向到文件时，需要使用支持 UTF-8 的文本编辑器打开
# 或者使用 PowerShell 的 Out-File -Encoding utf8 命令
if ($testArgs.Count -gt 0) {
    & npx vitest @testArgs
} else {
    & npx vitest
}

$exitCode = $LASTEXITCODE

# 恢复目录
Pop-Location

# 退出并返回 vitest 的退出码
exit $exitCode

