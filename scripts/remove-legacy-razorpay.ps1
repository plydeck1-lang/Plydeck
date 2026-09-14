$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$legacyPaths = @(
  "app\api\checkout",
  "app\api\payments",
  "lib\razorpay-server.ts",
  ".next"
)

foreach ($relativePath in $legacyPaths) {
  $targetPath = Join-Path $projectRoot $relativePath
  if (Test-Path -LiteralPath $targetPath) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
    Write-Host "Removed $relativePath"
  }
}

Write-Host "Legacy Razorpay files removed. Run: npm.cmd run build"
