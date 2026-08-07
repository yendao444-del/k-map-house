# Security Audit - 2026-08-07

> Historical audit snapshot. Current verified status is in `SECURITY-REVIEW-2026-08-07.md`.

## Phạm vi và kết luận

- Project đã kiểm tra: `k-map-house` (`wtrycmiojsiliyjxsewz`).
- Phương pháp: đọc schema, RLS policy, grants, security advisor của Supabase và rà soát luồng Electron/renderer trong repository.
- Không có migration, policy, dữ liệu hay token nào bị thay đổi trong đợt audit.
- Trạng thái phát hành: **BLOCKED**. Không phát hành bản production mới cho đến khi hoàn thành P0.

## P0 - Khóa khẩn cấp

### SEC-001: Bất kỳ tài khoản đăng nhập nào cũng có thể đổi QR và đọc token SePay

Mức độ: Critical

Sự thật đã xác minh:

- `public.app_settings` có RLS nhưng policy đọc cho `authenticated` dùng điều kiện `true`.
- Policy còn lại áp dụng `ALL` cho `authenticated`, với cả `USING true` và `WITH CHECK true`.
- Bảng hiện có một cấu hình chứa đồng thời token SePay và cấu hình tài khoản ngân hàng.

Ảnh hưởng:

- Nhân viên đăng nhập có thể đọc token SePay.
- Nhân viên có thể đổi `bank_id`, `account_no`, `account_name`, xóa hoặc thay cấu hình thanh toán.
- QR của hóa đơn mới có thể bị chuyển hướng sang tài khoản khác.

Yêu cầu triển khai:

- [ ] Xóa policy `Authenticated users can update settings` hiện tại.
- [ ] Chỉ admin active được sửa cấu hình tài khoản nhận tiền.
- [ ] Tách token SePay khỏi `app_settings` được renderer đọc.
- [ ] Chỉ trả các trường công khai cần hiển thị cho UI.
- [ ] Rotate token SePay sau khi migration hoàn thành.

### SEC-002: Dữ liệu nghiệp vụ công khai cho anonymous

Mức độ: Critical

Sự thật đã xác minh:

- Có 12 bảng có policy `anon_all` với `ALL`, `USING true`, `WITH CHECK true`.
- Các bảng gồm: `asset_snapshots`, `asset_templates`, `cash_transactions`, `contracts`, `invoices`, `move_in_receipts`, `room_asset_adjustments`, `room_assets`, `room_vehicles`, `rooms`, `service_zones`, `tenants`.
- Có 12 policy `authenticated_all` toàn quyền tương tự.

Ảnh hưởng:

- Bất kỳ ai có Supabase URL và anon key của ứng dụng có thể đọc, tạo, sửa, xóa dữ liệu phòng trọ, hóa đơn, hợp đồng, khách thuê và giao dịch.
- Bật RLS nhưng dùng policy `true` không tạo ra bảo vệ thực tế.

Yêu cầu triển khai:

- [ ] Loại bỏ toàn bộ `anon_all` khỏi dữ liệu nghiệp vụ.
- [ ] Thay `authenticated_all` bằng policy tối thiểu theo vai trò và nghiệp vụ.
- [ ] Kiểm thử thực tế đăng nhập admin, nhân viên và anonymous trước khi phát hành.
- [ ] Không bật/tắt RLS hàng loạt trên production khi chưa có policy thay thế đã kiểm thử.

### SEC-003: API quản trị Supabase dùng service role đang expose qua renderer

Mức độ: Critical

Sự thật đã xác minh:

- Electron main process dùng `SUPABASE_SERVICE_ROLE_KEY` để gọi Supabase Admin API.
- Preload expose các hành động tạo user, reset password, xóa user và update user cho renderer.
- Các handler hiện không xác thực session/role admin ở main process trước khi dùng service role.

Ảnh hưởng:

- Ẩn nút quản trị trong React không đủ an toàn.
- Một renderer bị XSS hoặc DevTools có thể gọi IPC quản trị nếu không có lớp kiểm tra quyền ở main process.

Yêu cầu triển khai:

- [ ] Main process xác thực caller/session và role admin cho từng IPC quản trị.
- [ ] Không expose handler quản trị tổng quát nhận `updates` tự do từ renderer.
- [ ] Giới hạn dữ liệu đầu vào theo schema của từng nghiệp vụ.
- [ ] Rotate service role key sau khi hoàn tất hardening và kiểm tra cách đóng gói `.env`.

## P1 - Secrets và luồng SePay

### SEC-004: Token SePay đang đi qua renderer

Mức độ: High

Sự thật đã xác minh:

- `sepay_api_token` nằm trong `app_settings` và được React sử dụng.
- IPC `sepay:fetchTransactions` nhận token do renderer truyền vào.

Yêu cầu triển khai:

- [ ] Renderer chỉ gọi IPC nghiệp vụ hẹp, không truyền token, URL hoặc request tùy ý.
- [ ] Chọn một nơi lưu secret: Supabase Vault + Edge Function cho kiến trúc đa thiết bị, hoặc Electron `safeStorage` cho triển khai một máy.
- [ ] Không trả token từ IPC hay query Supabase.
- [ ] Xác thực số giao dịch, mã tham chiếu và chống trùng ở server/main process.

Ghi chú kiến trúc:

- Project hiện chưa có Edge Function. Nếu chọn Vault + Edge Function, phải tạo endpoint có JWT/role check trước khi chuyển luồng SePay.
- QR có thể để khách tự nhập số tiền, nhưng mã chuyển khoản phải bất biến và khớp duy nhất một hóa đơn.

## P2 - Database security và audit

### SEC-005: Chưa có audit log và migration history

Mức độ: High

Sự thật đã xác minh:

- Không có `audit_logs` hoặc `app_settings_audit`.
- Supabase không có migration history cho project này.

Yêu cầu triển khai:

- [ ] Tạo migration đầu tiên cho toàn bộ thay đổi bảo mật, không sửa tay production không lưu lịch sử.
- [ ] Tạo audit append-only cho thay đổi ngân hàng, tài khoản, token reference và policy quản trị.
- [ ] Audit ghi actor, thời gian, giá trị cũ/mới đã che secret; không ghi token thô.
- [ ] Cảnh báo admin khi tài khoản nhận tiền thay đổi.

### SEC-006: SECURITY DEFINER function có thể bị gọi công khai

Mức độ: High

Sự thật đã xác minh:

- `public.handle_auth_user_created()` và `public.handle_auth_user_login()` là `SECURITY DEFINER`.
- Cả anon và authenticated đang có quyền EXECUTE.

Yêu cầu triển khai:

- [ ] Rà soát function body và trigger dependencies trước khi sửa.
- [ ] Thu hồi EXECUTE khỏi anon/authenticated nếu function chỉ dành cho trigger nội bộ.
- [ ] Đặt `search_path` an toàn và chỉ cấp quyền tối thiểu nếu bắt buộc giữ `SECURITY DEFINER`.

### SEC-007: Users policy có điểm tốt nhưng vẫn lộ danh sách người dùng

Mức độ: Medium

Sự thật đã xác minh:

- Policy self-update giữ nguyên `role` và `status`, nên chưa thấy đường leo quyền trực tiếp bằng cập nhật hồ sơ cá nhân.
- Mọi authenticated user hiện đọc được toàn bộ bảng `users`.

Yêu cầu triển khai:

- [ ] Chỉ trả user profile của chính mình cho nhân viên; danh sách toàn bộ user chỉ dành cho admin.
- [ ] Giữ kiểm tra `WITH CHECK` bảo toàn role/status cho self-update.

## P3 - Electron và UI surface

### SEC-008: Electron hardening chưa đạt

Mức độ: High

Sự thật đã xác minh:

- Các BrowserWindow đang dùng `sandbox: false`.
- `nodeIntegration` và `contextIsolation` không được set tường minh trên cửa sổ chính.
- CSP có `unsafe-eval`, `unsafe-inline` và `img-src *`.

Yêu cầu triển khai:

- [ ] Set tường minh `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`.
- [ ] Rà soát preload và chỉ expose API cần thiết qua `contextBridge`.
- [ ] Bỏ `unsafe-eval` ở production.
- [ ] Thu hẹp `img-src` về `self`, `data:`, `blob:` và domain QR thực tế cần dùng.
- [ ] Kiểm thử in hóa đơn, lưu ảnh, Zalo và update sau khi bật sandbox.

### SEC-009: Xác nhận cuối cùng trên UI thanh toán

Mức độ: Low

Yêu cầu triển khai:

- [ ] Hiển thị rõ ngân hàng, số tài khoản và tên chủ tài khoản đã xác minh.
- [ ] Nhắc khách kiểm tra tên chủ tài khoản do ứng dụng ngân hàng hiển thị trước khi xác nhận.
- [ ] Đây chỉ là lớp UX, không thay thế RLS hoặc bảo vệ secret.

## P4 - Các cảnh báo bổ sung

### SEC-010: Leaked password protection đang tắt

Mức độ: Medium

- [ ] Bật leaked password protection trong Supabase Auth.
- [ ] Quy định đổi mật khẩu và thu hồi session khi rotate secret hoặc nghi ngờ lộ tài khoản.

## Trình tự thực hiện an toàn

1. Tạo backup và branch/staging database; xác định đầy đủ luồng nào đang chạy anonymous trước khi xóa `anon_all`.
2. Tạo migration P0 thay thế policy bằng quyền tối thiểu, kiểm thử bằng anonymous, nhân viên và admin.
3. Khóa `app_settings`, tách token SePay khỏi renderer, harden IPC service role.
4. Rotate SePay token và Supabase service role key.
5. Tạo audit trigger/log, sau đó harden Electron/CSP.
6. Chạy lại Supabase security advisor, kiểm thử ứng dụng production build và cập nhật checklist này thành achieved.

## Điều kiện hoàn thành P0

- Anonymous không thể SELECT/INSERT/UPDATE/DELETE dữ liệu nghiệp vụ.
- Nhân viên không thể đọc token hoặc đổi cấu hình ngân hàng.
- Admin hợp lệ vẫn vận hành được nghiệp vụ cần thiết.
- Renderer không có API gọi service role hoặc SePay token.
- Không còn policy `anon_all` hay `authenticated_all` có `true` toàn phần trên dữ liệu nghiệp vụ.
