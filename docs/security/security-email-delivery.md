# Email OTP và trạng thái giao nhận

Triển khai production ngày 11/10/2026 trên project `wtrycmiojsiliyjxsewz`.

- OTP bảo mật gửi từ `AN KHANG HOME <baomat@phongtroankhang.com>` qua secret riêng `SECURITY_MAIL_FROM`. Người nhận vẫn là email Supabase Auth đã xác minh. Các email nghiệp vụ dùng `MAIL_FROM` như trước.
- Địa chỉ riêng giúp phân biệt mục đích thư; cùng tên miền vẫn dùng chung uy tín tên miền, không bảo đảm Gmail Inbox. Không thay DMARC trong lượt này.
- Webhook Resend `b8de42fc-4d8e-461d-aae6-df510a38dd05` đang enabled, gửi đến Edge Function `resend-security-webhook`. Đăng ký sent, delivered, delivery_delayed, bounced, complained, failed, suppressed. Signing secret lưu trong Supabase `RESEND_SECURITY_WEBHOOK_SECRET`.
- Endpoint xác minh chữ ký Standard Webhooks/Svix trên body gốc và timestamp (±5 phút), giới hạn payload 64 KiB; lỗi lưu dữ liệu trả 503 để Resend retry. Chỉ nhận metadata của sender bảo mật.
- Provider ID được lưu cùng challenge bằng RPC chỉ dành cho service_role. Sự kiện ở schema riêng `management_security`, không lưu nội dung email, OTP hay địa chỉ người nhận. Sự kiện trùng được xử lý idempotent; webhook đến trước khi lưu provider ID vẫn được nối lại. Sự kiện được giữ 30 ngày, dọn khi ghi nhận một lần gửi OTP mới.
- View `management_security.email_delivery_status` cho phép người vận hành kiểm tra trạng thái; không mở quyền truy cập cho frontend. Sự kiện đến sai thứ tự không làm trạng thái delivered/bounced/complained trở lại sent. Sự kiện giao nhận không cấp hoặc thay đổi xác minh MFA.
- `email.delivered` nghĩa là máy chủ nhận đã chấp nhận thư; không xác định Inbox/Spam. `email.complained` là báo cáo complaint do provider nhận được, không phải thông báo tự động mọi lần Gmail xếp thư vào Spam. Các challenge trước khi triển khai có trạng thái unknown.

Kiểm tra: 23 kiểm tra Auth/webhook; SQL dùng fixture trong transaction và rollback để kiểm tra race, replay, thứ tự, quyền RPC/schema; live verifier gửi tới địa chỉ mô phỏng `delivered@resend.dev`, xác nhận acceptance và webhook delivered nối đúng challenge trước khi xóa tài khoản fixture. Không gửi thêm OTP cho tài khoản thật trong kiểm thử.

Chạy tại thư mục gốc:

```powershell
node --test adminpwa/tests/auth-gateway.test.mjs adminpwa/tests/mfa-gateway.test.mjs scripts/resend-security-webhook.test.mjs
node scripts/test-security-email-delivery.mjs
node scripts/deploy-security-email-delivery.mjs
node scripts/verify-management-mfa-email.mjs
```

Bằng chứng: `qa/security-email-delivery-database.json`, `qa/security-email-delivery-deployment.json`, `qa/mfa-email-live-2026-10-09.json`. File cuối giữ tên lịch sử để không đổi các liên kết cũ; xem `verifiedAt` cho thời điểm hiện tại.
