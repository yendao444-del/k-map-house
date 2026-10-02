param(
  [string]$ProjectRef = 'wtrycmiojsiliyjxsewz'
)

$ErrorActionPreference = 'Stop'

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw 'Thiếu SUPABASE_ACCESS_TOKEN. Tạo Personal Access Token tại Supabase Dashboard → Account → Access Tokens rồi chạy lại.'
}

Write-Host 'Đăng nhập Supabase CLI...' -ForegroundColor Cyan
npx supabase login --token $env:SUPABASE_ACCESS_TOKEN

Write-Host "Kiểm tra quyền project $ProjectRef..." -ForegroundColor Cyan
npx supabase projects list --output json | Out-Null

Write-Host 'Link project...' -ForegroundColor Cyan
npx supabase link --project-ref $ProjectRef

if ($env:SUPABASE_DB_PASSWORD) {
  Write-Host 'Đẩy migration lên database...' -ForegroundColor Cyan
  npx supabase db push --password $env:SUPABASE_DB_PASSWORD
} else {
  Write-Warning 'Chưa có SUPABASE_DB_PASSWORD, bỏ qua db push. Có thể chạy migration trong SQL Editor hoặc đặt biến này rồi chạy lại.'
}

Write-Host 'Deploy Edge Function...' -ForegroundColor Cyan
npx supabase functions deploy send-email-notification --no-verify-jwt

Write-Host 'Hoàn tất deploy function. Tiếp theo cần đặt RESEND_API_KEY và MAIL_FROM trên function.' -ForegroundColor Green
Write-Host 'Ví dụ: npx supabase secrets set RESEND_API_KEY=... MAIL_FROM="DBY HOME <no-reply@your-domain.com>"'
