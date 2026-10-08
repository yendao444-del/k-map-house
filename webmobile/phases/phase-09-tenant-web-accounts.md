# Phase 09 — Quản lý tài khoản web cho khách thuê

## Trạng thái

Đã triển khai backend và frontend ngày 07/10/2026.

## Luồng đã chốt

- Vị trí đã chốt: **Electron → Cài đặt → Tài khoản**.
- **Tài khoản** là dropdown ở thanh bên Cài đặt; mở xuống hai mục con **Tài khoản hệ thống** (admin/nhân viên Electron) và **Tài khoản khách thuê** (đăng nhập website), có danh sách và quyền riêng.
- Hồ sơ khách thuê vẫn ở **Quản lý cho thuê → Khách thuê**; quản lý tài khoản không còn nằm trong hồ sơ hay menu chính.
- Chỉ quản trị viên được cấp mới, đặt lại mật khẩu, khóa/mở khóa và đăng xuất tất cả phiên.
- Email đăng nhập luôn lấy từ hồ sơ khách thuê trên Electron; client không được tự chọn email, tenant ID, Auth user ID hoặc vai trò.
- Mật khẩu ban đầu/mật khẩu đặt lại chỉ hiện một lần để sao chép. Không có chức năng xem mật khẩu hiện tại.
- Khóa, đặt lại mật khẩu và thu hồi phiên dùng cơ chế tăng phiên nguyên tử trong Supabase để phiên đang dùng không thể tiếp tục sau khi bị thu hồi.
- Tài khoản khách thuê dùng Auth role `anon` và metadata tin cậy `webmobile_tenant`, tách khỏi tài khoản nhân viên Electron.
- Khi đăng nhập, backend lấy đúng hồ sơ khách thuê và hợp đồng `active` của tenant đó. Người thuê mới không thấy lịch sử, giá hoặc điện nước của tenant cũ.
- Tài khoản thật hiện chỉ hiển thị phòng/hợp đồng hiện tại và trạng thái thanh toán trống. OCR, hóa đơn thật và SePay thật vẫn là phase tiếp theo; không cho tài khoản thật chạy vào dữ liệu demo.

## Cách dùng

1. Mở Electron → **Cài đặt → Tài khoản → Tài khoản khách thuê**.
2. Bấm **Cấp tài khoản** và chọn khách từ hồ sơ có sẵn; hoặc bấm **Quản lý** trên tài khoản đã cấp.
3. Bổ sung email hợp lệ và bảo đảm khách đang hoạt động.
4. Bấm **Cấp tài khoản website**, nhập hoặc tạo mật khẩu từ 10–128 ký tự.
5. Sao chép email/mật khẩu và cấp cho khách. Mật khẩu không được gửi tự động trong phase này.
6. Khi cần, dùng **Đặt lại mật khẩu**, **Khóa tài khoản**, **Mở tài khoản** hoặc **Đăng xuất các phiên**.

## Triển khai

- Supabase schema: `webmobile/cloud/tenant-accounts-schema.sql`.
- Supabase Edge Function: `tenant-web-admin`.
- Backend đăng nhập/phiên: `webmobile/cloud/auth.mjs` và `webmobile/cloud/handler.mjs`.
- Website: `https://pay.phongtroankhang.com`.
- Không tạo tài khoản tenant thật trong lúc kiểm thử.

## Kiểm thử

- `npm run typecheck` — đạt.
- `npm run build` trong `webmobile` — đạt; kiểm tra public build không chứa secret — đạt.
- `node --test webmobile/server/auth-backend.test.mjs webmobile/server/tenant-accounts.test.mjs webmobile/server/cloud-backend.test.mjs` — 19 test đạt.
- QA fixture tại `webmobile/qa/tenant-accounts` dùng component Cài đặt thật với dữ liệu giả để kiểm tra dropdown mở/đóng, hai mục con, danh sách riêng và chọn khách để cấp; không ghi Supabase.

## Giới hạn còn lại

- Đổi email đăng nhập cần phase xác minh email.
- Quên mật khẩu hiện hướng dẫn liên hệ chủ nhà; chưa gửi email khôi phục tự động.
- Chưa cấp tự động từ lúc lập hợp đồng; hiện cấp trong mục Tài khoản khách thuê bằng cách chọn hồ sơ đã có.

Luồng tự động sau khi khách xác nhận hợp đồng và phương án test biệt lập cho phòng 999 được ghi trong `phase-10-automatic-tenant-account-lifecycle-and-test-environment.md`.
