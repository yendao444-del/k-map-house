# Email tự động trên Supabase — AN KHANG HOME

Đã bật production `wtrycmiojsiliyjxsewz` ngày 08/10/2026. Người gửi:
`AN KHANG HOME <thongbao@phongtroankhang.com>`, thông qua Resend.

## Đang hoạt động

- Domain `phongtroankhang.com` đã được Resend xác minh. Cloudflare có TXT DKIM,
  CNAME `rsend` và `send` ở chế độ DNS only, cùng TXT DMARC `p=none` theo hướng dẫn Resend.
- API key `ankhang-production` chỉ có Sending access cho domain này. Khóa nằm
  trong Supabase Edge Function Secret `RESEND_API_KEY`; file chuyển tạm đã được xóa.
- Supabase Cron gọi worker mỗi 2 phút. Bearer nội bộ được lấy từ Vault, không ghi
  giá trị khóa trong lệnh cron. Các endpoint kiểm tra xác thực riêng.
- Nhắc hóa đơn đến hạn từ 08:00 giờ Việt Nam; nhắc lại sau mỗi 7 ngày nếu vẫn còn
  nợ. Nợ hóa đơn lâu chưa thanh toán dùng mẫu riêng sau 30 ngày. Nợ cũ lưu ở phòng
  cũng được nhắc riêng và không bị bỏ qua khi phòng có thêm hóa đơn chưa thanh toán.
- Nhắc phòng đến hạn trả và hợp đồng còn tối đa 7 ngày. Hóa đơn mới chỉ gửi cho
  tài khoản đã bật loại thông báo đó.
- SePay được đọc từ máy chủ mỗi 2 phút. Chỉ giao dịch mới sau lúc kích hoạt, đúng
  tài khoản ngân hàng, đúng một mã hóa đơn và đúng số tiền còn lại mới tự ghi nhận.
  Hóa đơn đã chốt nợ tháng trước vẫn được thanh toán qua luồng này.
- Tiền thiếu, dư, mã không khớp hoặc khớp nhiều hóa đơn vẫn chờ đối soát; không tự
  sửa dữ liệu tài chính. Webhook SePay đã có endpoint được bảo vệ; polling đang
  hoạt động nên không phụ thuộc việc đăng ký webhook trên dashboard SePay.
- Người nhận là tài khoản hệ thống đang hoạt động và đã bật nhận thông báo tương
  ứng. Tự động này không mở rộng người nhận sang khách thuê.
- Tài khoản quản trị đang đăng nhập bằng `zicky.iluv@gmail.com` nhưng địa chỉ
  nhận thông báo đã được đặt riêng thành `phongtroankhang.com@gmail.com`; hai
  địa chỉ này không còn bị dùng lẫn. Các thư đã gửi trước khi đổi cấu hình vẫn
  giữ người nhận cũ trong lịch sử.
- Mỗi giao dịch SePay khớp từ sau mốc triển khai tạo hai bản độc lập: bản đầy đủ
  cho tài khoản hệ thống đã bật `sepay_matched`, và bản đầy đủ cho email/tài khoản
  web của người thuê. Nếu người thuê chưa có email hợp lệ thì hệ thống ghi nhận
  trạng thái chờ cấu hình, không gửi nhầm vào Gmail của chủ nhà. Bản người thuê
  và bản chủ nhà có hàng đợi, lease, retry và idempotency riêng.
- Electron không cần mở. Bản mã Electron mới dùng transport máy chủ; bản cũ không
  được nhận lại các hàng đợi máy chủ thất bại để gửi qua Gmail local.
- Giới hạn bảo thủ 90 lượt xử lý email/ngày, 5 lần thử, lease 5 phút. Retry dùng
  cùng idempotency key của Resend. Lượt có kết quả chưa rõ quá 23 giờ dừng gửi lại
  để kiểm tra lịch sử provider trước.

## Bằng chứng kiểm tra

- `database-test.json`: 32 kiểm tra SQL trong project test riêng. Schema và toàn
  bộ dữ liệu giả được rollback; không gửi mail từ kiểm tra database.
- 58 kiểm tra worker, SePay, sandbox, MIME/Gmail và khởi động đã đạt.
- `npm run build` đạt (TypeScript main/renderer và các bundle Electron).
- `production-deployment.json`: chỉ hai migration email và ba Edge Function
  được triển khai; số hàng hóa đơn, khoản thu, phòng, hợp đồng không đổi trong
  lượt triển khai.
- `production-activation.json`: bật tự động, worker chạy HTTP 200, SePay không
  có lỗi. Lượt kích hoạt không có hóa đơn đến hạn hoặc giao dịch mới để xử lý.
- `provider-test.json`, `resend-delivered.jpg`: thư dữ liệu giả tới địa chỉ mô
  phỏng chính thức `delivered@resend.dev` được Resend báo Delivered, đúng sender
  của domain và có CID attachment. Kiểm tra này không xác nhận hộp thư Gmail thật
  sẽ luôn đưa thư vào Inbox.
- Cron thực tế đã chạy thành công và nhận HTTP 200; xem `server-health.json`.
- `tenant-receipt-database-test.json`, `tenant-receipt-deployment.json`: 36
  kiểm tra SQL dữ liệu giả, hàng đợi riêng cho người thuê, chống replay và cron
  production HTTP 200 (xem `tenant-receipt-cron.json`). Không gửi lại lịch sử cũ.
  Bộ hồi quy hiện có thêm kiểm tra cùng một khoản thu tạo hai bản độc lập và
  tắt thông báo tài khoản hệ thống không tắt bản người thuê. 46 kiểm tra worker,
  mẫu email, SePay và sandbox đạt trong lượt triển khai này.
- `production-reliability-deployment.json`: migration bảo vệ hàng đợi đã được
  áp dụng ngày 10/10/2026. Hàng đợi mail người thuê được tự mở lại khi địa chỉ
  email hợp lệ được bổ sung; hàng đợi mail kỳ thanh toán dừng retry sau 23 giờ;
  lịch sử quản trị gộp mọi loại thư. Hai Edge Function đã được deploy, dữ liệu
  nghiệp vụ không đổi và worker không bị gọi trong lượt triển khai.
- `scheduler-access.json`: Vault không cho role ứng dụng đọc; schema `net`,
  `cron`, `vault` đều bị API từ chối (HTTP 406/PGRST106). Bảng extension thuộc
  `supabase_admin` giữ grant SQL do nền tảng quản lý; kiểm tra này xác nhận ranh
  giới API, không tuyên bố đã xóa các grant nội bộ đó. Không expose các schema này.

## Lệnh kiểm tra/triển khai

Chạy tại thư mục gốc repo:

```powershell
node scripts/server-email-database.test.mjs
node --test scripts/server-email-worker.test.mjs scripts/sepay-email.test.cjs scripts/email-notification-testing.test.cjs scripts/gmail-encoding.test.cjs scripts/startup-safety.test.cjs
npm run build
node webmobile/scripts/deploy-server-email-automation.mjs
node webmobile/scripts/verify-server-email-health.mjs
node scripts/tenant-payment-receipts-database.test.mjs
node webmobile/scripts/deploy-tenant-payment-receipts.mjs
```

Script triển khai kiểm tra đúng project production và bằng chứng SQL test, giữ
nguyên dữ liệu nghiệp vụ, không thay đổi lựa chọn nhận email của từng tài khoản.
Chế độ kiểm thử giao diện vẫn chỉ dùng dữ liệu giả, không gửi mail hoặc sửa dữ
liệu thật. Thư kiểm tra provider là thao tác kỹ thuật riêng, chỉ có bearer máy chủ
và địa chỉ mô phỏng cố định của Resend.
