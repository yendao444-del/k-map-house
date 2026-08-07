# Kế hoạch bảo mật SePay và mã QR

## Mục tiêu

Ngăn việc thay đổi tài khoản nhận tiền, làm lộ API token SePay hoặc lợi dụng renderer Electron để gọi API trái phép. Mã QR chỉ được tạo từ cấu hình tài khoản nhận tiền đã được kiểm soát và mọi giao dịch SePay phải chống ghi nhận trùng.

## Hiện trạng đã xác nhận

- QR hóa đơn đang được tạo ở renderer từ `bank_id`, `account_no` và mã chuyển khoản.
- `getAppSettings()` hiện trả toàn bộ cấu hình, trong đó có `sepay_api_token`, xuống renderer.
- `updateAppSettings()` cập nhật trực tiếp bảng `app_settings` qua Supabase.
- Chưa tìm thấy migration/policy `app_settings` trong repository. Phải kiểm tra trực tiếp trên Supabase trước khi kết luận RLS đã an toàn.
- Luồng SePay hiện chủ động pull lịch sử giao dịch, chưa có webhook công khai.
- Cơ chế ghi nhận thanh toán đã có kiểm tra mã giao dịch/tham chiếu để hạn chế giao dịch trùng.
- QR hiện cho phép khách tự nhập số tiền; mã chuyển khoản vẫn phải giữ nguyên để đối soát.

## Thứ tự triển khai

### P0 - Khóa rủi ro dữ liệu ngay

- [ ] Kiểm tra bảng `app_settings`, RLS, grants và các policy đang chạy trên Supabase.
- [ ] Xác nhận tài khoản nhân viên không thể cập nhật `bank_id`, `account_no`, `account_name` hoặc token.
- [ ] Xác nhận tài khoản nhân viên không thể tự sửa role của chính mình trong `public.users`.
- [ ] Tách dữ liệu cấu hình hiển thị khỏi secret SePay; không trả token trong query dùng cho renderer.
- [ ] Rotate token SePay sau khi token không còn được dùng ở renderer.
- [ ] Kiểm tra thủ công bằng hai tài khoản: admin và nhân viên.

### P1 - Đưa token ra khỏi renderer Electron

- [ ] Main process giữ token trong nơi lưu trữ phù hợp với môi trường desktop, ưu tiên OS secure storage hoặc secret ngoài renderer.
- [ ] Tạo IPC nghiệp vụ hẹp, ví dụ `fetchSePayTransactions()`, không nhận URL, token hoặc request tùy ý từ renderer.
- [ ] IPC chỉ trả dữ liệu giao dịch cần hiển thị; tuyệt đối không trả token.
- [ ] Kiểm tra sender, kiểu dữ liệu đầu vào và trạng thái đăng nhập trước khi thực hiện IPC.
- [ ] Không dùng IPC tổng quát kiểu `request(url, params)`.
- [ ] Nếu chuyển sang cloud/đa thiết bị, dùng Edge Function và secret server-side thay cho token trong client.

### P2 - RLS và audit log

- [ ] RLS phải giới hạn quyền theo role thực tế, không chỉ kiểm tra `authenticated`.
- [ ] Policy `UPDATE` phải có cả `USING` và `WITH CHECK`, đồng thời phải có policy `SELECT` phù hợp.
- [ ] Chỉ admin được sửa thông tin tài khoản nhận tiền.
- [ ] Người dùng thường chỉ đọc được các trường cấu hình cần hiển thị.
- [ ] Không cho phép sửa cột `role` nếu người thực hiện không phải admin.
- [ ] Tạo trigger audit khi `bank_id`, `account_no` hoặc `account_name` thay đổi.
- [ ] Audit log phải append-only đối với app user; không ghi API token vào audit log.
- [ ] Lưu người thay đổi, thời gian, giá trị cũ/mới đã che dữ liệu nhạy cảm và lý do thay đổi nếu có.

### P3 - Hardening Electron và CSP

- [ ] Đặt tường minh `sandbox: true` cho BrowserWindow chính và các cửa sổ phụ nếu tương thích.
- [ ] Đặt tường minh `nodeIntegration: false`.
- [ ] Đặt tường minh `contextIsolation: true`.
- [ ] Preload chỉ expose các API cần thiết qua `contextBridge`.
- [ ] Production CSP phải bỏ `unsafe-eval`.
- [ ] Thu hẹp `img-src *` thành các nguồn cần thiết, gồm `self`, `data:`, `blob:` và `https://qr.sepay.vn` nếu còn dùng ảnh QR từ domain này.
- [ ] Rà soát các cửa sổ tạo HTML tạm để in/lưu ảnh; không tải nội dung không tin cậy và không expose Node API.

### P4 - Đối soát SePay

- [ ] Mã chuyển khoản phải khớp duy nhất một hóa đơn.
- [ ] Chuyển đủ: tự động ghi nhận `paid`.
- [ ] Chuyển thiếu: tự động ghi nhận đúng số tiền thực nhận, trạng thái `partial`, giữ số còn phải thu.
- [ ] Chuyển dư, sai mã, khớp nhiều hóa đơn hoặc giao dịch bất thường: không tự chốt, đưa vào danh sách duyệt thủ công.
- [ ] Dùng `reference_number`/transaction id làm idempotency key.
- [ ] Ghi log nguồn giao dịch, mã tham chiếu, số tiền thực nhận và thời điểm ghi nhận.
- [ ] Nếu sau này mở webhook: bắt buộc xác thực chữ ký HMAC, kiểm tra timestamp/replay và idempotency.

## Điều kiện nghiệm thu

- Nhân viên không thể đổi tài khoản nhận tiền bằng UI hoặc gọi trực tiếp Supabase REST.
- Tài khoản ngân hàng hiển thị trên QR khớp với tài khoản đã được admin xác nhận.
- Token SePay không xuất hiện trong state React, DevTools hoặc response cấu hình gửi cho renderer.
- XSS trong renderer không thể gọi API SePay tùy ý hoặc truy cập Node/Electron.
- Một giao dịch SePay chỉ tạo tối đa một payment record dù đồng bộ nhiều lần hoặc mở nhiều cửa sổ.
- Giao dịch chuyển thiếu được cộng dồn chính xác; giao dịch chuyển dư không tự động làm hóa đơn thành đã thu.
- Khi tài khoản nhận tiền thay đổi, admin nhận được cảnh báo và có audit record.
- Kiểm thử production build riêng, không chỉ kiểm tra trong môi trường dev.

## Rủi ro chưa được coi là đã xử lý

- Chưa thể kết luận RLS `app_settings` an toàn nếu chưa kiểm tra policy thực tế trên Supabase.
- Ẩn nút hoặc giới hạn màn hình trong React không phải biện pháp phân quyền.
- HTTPS tới `qr.sepay.vn` bảo vệ đường truyền, nhưng không bảo vệ trường hợp cấu hình tài khoản đã bị đổi từ database hoặc renderer.
- Dòng nhắc khách kiểm tra tên chủ tài khoản chỉ là lớp phòng vệ UX, không thay thế RLS, bảo vệ token và hardening Electron.

## Quyết định kiến trúc

Ưu tiên xử lý P0 và P1 trong cùng đợt: khóa quyền sửa dữ liệu ở database đồng thời tách token khỏi renderer. Không triển khai RLS đơn lẻ trên bảng hiện tại nếu việc đó vẫn để token nằm trong dữ liệu mà renderer có thể đọc. Sau khi kiểm tra admin/nhân viên đạt yêu cầu mới triển khai P2-P4 và phát hành production.
