# Phase 08 — Đăng nhập demo thật và subdomain thanh toán

Chốt và triển khai ngày 07/10/2026.

## Phạm vi người dùng chọn

- Đăng nhập email/mật khẩu thật qua Supabase Auth.
- Dùng tài khoản demo trước, chưa nối khách thuê thật trong Electron.
- Website người thuê đặt tại `https://pay.phongtroankhang.com`.

## Đã triển khai

- Form mobile đồng bộ xanh đậm/emerald/Inter, hiện/ẩn mật khẩu, trạng thái đang đăng nhập và lỗi mật khẩu.
- Phiên được khôi phục khi tải lại; tự làm mới token Supabase và đăng xuất thu hồi phiên website.
- Hai tài khoản đã cấp: phòng 101 (khách đang thuê), phòng 102 (khách mới).
- Mỗi tài khoản được gắn với đúng hợp đồng demo trên backend; query `?tenant=` không chọn được khách khác. Menu không còn công tắc đổi khách demo.
- Phòng 102 không hiển thị lịch sử trước; 101 chỉ hiển thị lịch sử fixture của hợp đồng hiện tại.
- Cloudflare DNS `pay` → `ankhanghome-payment.pages.dev`; custom domain/HTTPS active. Domain chính và `www` chuyển hướng tạm thời sang `pay`, giữ path/query. Sau này domain chính có thể dùng site home riêng.
- `start.bat` cũng có đăng nhập Supabase thật và API Gemini thông qua backend local; cần internet. Prototype có khung điện thoại vẫn là fixture để review UI.

## Phân quyền và phiên

- Không tạo khách thuê/hợp đồng/hóa đơn thật. Không tạo quyền quản trị cho tài khoản demo.
- Tài khoản Auth demo có `role=anon` và `app_metadata.portal_role=webmobile_demo_tenant` do server cấp. Đây là Supabase Auth có danh tính thật nhưng dùng quyền database công khai vốn đã bị giới hạn, tránh cấp role `authenticated` dành cho nhân viên Electron.
- Trigger Supabase mặc định tạo hồ sơ staff lúc tạo Auth user; script xóa đúng hai hồ sơ demo mới tạo và không sửa tài khoản staff có sẵn hay trigger/policy staff.
- Enrollment riêng trong `webmobile_demo_accounts`; token chỉ nằm trong bảng service-only `webmobile_auth_sessions`, RLS và không cấp quyền anon/authenticated. BFF kiểm tra Supabase user + enrollment trước khi xử lý nghiệp vụ.
- Browser chỉ giữ UUID phiên trong cookie `__Host-…`, HttpOnly, Secure, SameSite=Lax; không nhận access/refresh token hoặc service key. Localhost dùng cookie HttpOnly riêng không có prefix HTTPS.
- Backend chặn chưa đăng nhập, sửa contract ID, lấy phiên người khác và gọi simulation SePay từ website; có giới hạn thử đăng nhập theo IP, refresh lease nguyên tử và thời hạn phiên 7 ngày.

## Kiểm chứng

- 11 tests backend/gateway, typecheck/build/secret scan, kiểm tra 28 file runtime được bảo vệ.
- 20 kiểm tra public: sai mật khẩu, login/logout, reload, refresh Supabase thật, token không có trong JSON, cookie bảo vệ, phòng khác bị chặn, simulation bị chặn, cookie sau logout hết hiệu lực và redirect domain.
- JWT demo dùng trực tiếp không đọc được bảng users/tenants/contracts/invoices/rooms; app_settings trả 401. Không tăng quyền database so với anon.
- Mobile 390×844 và 320×568: không tràn ngang, nút đăng nhập nằm trong viewport. Browser xác minh home 101/102 và menu không có chuyển khách demo.
- Evidence: `qa/public-auth-checks.json`, `qa/public-login-390.png`, `deployment.json`.

## Tài khoản và giới hạn

- Mật khẩu lưu riêng tại `qa/private/demo-login-accounts.md` và JSON cùng thư mục, được gitignore. Không đưa vào public assets/chat hoặc gửi email tự động.
- Quên mật khẩu chưa gửi email: Supabase chưa có SMTP riêng; UI thông báo rõ trạng thái. Cần cấu hình email và recovery flow ở phase kế tiếp trước khi dùng khách thật.
- Hóa đơn, dữ liệu phòng/hợp đồng và đối soát SePay vẫn demo; QR BIDV là tài khoản thật theo cấu hình Electron. Không chuyển tiền khi thử.
- Không mua thêm gói hay tên miền; subdomain và hosting dùng hạ tầng hiện có trong hạn mức miễn phí.
