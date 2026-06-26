Write-Host "=== Email Tracker Worker — Deploy ===" -ForegroundColor Cyan

# 1. Проверка Node.js
try { node --version | Out-Null; Write-Host "✓ Node.js" -ForegroundColor Green }
catch { Write-Host "✗ Node.js не найден. Скачайте: https://nodejs.org" -ForegroundColor Red; exit 1 }

# 2. Данные Cloudflare
$email = Read-Host -Prompt "Cloudflare Email"
$apiKey = Read-Host -Prompt "Cloudflare Global API Key (Dashboard > API Tokens)"
$accountId = Read-Host -Prompt "Cloudflare Account ID (Dashboard > Workers > справа)"

# 3. Создание KV Namespace
Write-Host "`nСоздаю KV Namespace..." -ForegroundColor Yellow
$headers = @{ "X-Auth-Email" = $email; "X-Auth-Key" = $apiKey; "Content-Type" = "application/json" }

try {
  $kvResp = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/storage/kv/namespaces" `
    -Method Post -Headers $headers -Body '{"title":"email-tracker-kv"}'
  if (-not $kvResp.success) { throw ($kvResp.errors[0].message) }
  $kvId = $kvResp.result.id
  Write-Host "✓ KV создан: $kvId" -ForegroundColor Green
} catch {
  Write-Host "✗ Ошибка KV: $_" -ForegroundColor Red; exit 1
}

# 4. Обновляем wrangler.toml
$toml = Get-Content "$PSScriptRoot\wrangler.toml" -Raw
$toml = $toml -replace 'id = ".*"', "id = `"$kvId`""
Set-Content "$PSScriptRoot\wrangler.toml" $toml
Write-Host "✓ wrangler.toml обновлён" -ForegroundColor Green

# 5. Деплой
Write-Host "`nДеплою Worker..." -ForegroundColor Yellow
npx wrangler@latest deploy

Write-Host "`n=== Готово! ===" -ForegroundColor Cyan
Write-Host "Скопируйте URL в настройки расширения (Tracker Server URL)" -ForegroundColor Yellow
Write-Host "Нажмите любую клавишу для выхода..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
