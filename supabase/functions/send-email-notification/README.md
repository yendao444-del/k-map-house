# Triển khai gửi email

Chạy từ thư mục dự án sau khi đã đăng nhập Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref wtrycmiojsiliyjxsewz
npx supabase db push
npx supabase functions deploy send-email-notification --no-verify-jwt
npx supabase secrets set RESEND_API_KEY=... MAIL_FROM="DBY HOME <no-reply@your-domain.com>"
```

`RESEND_API_KEY` và `MAIL_FROM` phải được đặt trên Edge Function. Không đặt hai giá trị này trong `.env` của Electron hoặc đưa vào renderer.
