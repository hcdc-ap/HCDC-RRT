# Đặt webhook cho bot RRT kèm secret_token, rồi lưu secret vào Supabase.
# Chạy trong PowerShell tại thư mục gốc repo (đã `supabase link`). Token bot nhập ẩn, không lưu vào file.
#   powershell -File tools/telegram-set-webhook.ps1
# Thứ tự: setWebhook (có secret) trước, đặt biến TELEGRAM_WEBHOOK_SECRET sau — hàm chỉ kiểm tra khi biến có mặt.
$ErrorActionPreference = 'Stop'
$ref = 'sxzjbygiowpscyhiffqc'
$sec = Read-Host 'Dán token bot RRT (@rrt_alert_bot, KHÔNG phải bot LIMS)' -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$me = Invoke-RestMethod "https://api.telegram.org/bot$token/getMe"
if ($me.result.username -ne 'rrt_alert_bot') { throw "Token thuộc bot @$($me.result.username), không phải @rrt_alert_bot. Dừng." }
$url = "https://$ref.supabase.co/functions/v1/telegram-bot-handler"
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$body = @{ url = $url; secret_token = $secret; allowed_updates = @('message', 'callback_query') } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType 'application/json' -Body $body
if (-not $r.ok) { throw 'setWebhook thất bại' }
supabase secrets set "TELEGRAM_WEBHOOK_SECRET=$secret" --project-ref $ref
$info = Invoke-RestMethod "https://api.telegram.org/bot$token/getWebhookInfo"
"Webhook: $($info.result.url) | lỗi gần nhất: $($info.result.last_error_message)"
