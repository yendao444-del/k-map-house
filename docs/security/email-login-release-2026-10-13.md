# Đăng nhập bằng email dự phòng

Ngày triển khai: 13/10/2026.

## Cách sử dụng

Sau khi nhập tài khoản và mật khẩu, tại màn hình **Xác minh đăng nhập**, chọn **Thử phương thức khác** rồi chọn **Gửi mã qua email đã xác minh**. Nhập mã email để hoàn tất phiên. Có thể chuyển lại Google Authenticator hoặc đi vào luồng mã khôi phục.

Email chỉ khả dụng nếu tài khoản đang hoạt động, đã có Authenticator được xác minh, đã xác nhận lưu mã khôi phục và đã chứng minh quyền sở hữu email đăng nhập hiện tại bằng OTP từ trước. `email_confirmed_at` do quản trị viên cấp tài khoản không tự đáp ứng điều kiện này. Không dùng email thông báo hoặc email do trình duyệt tự truyền lên.

## Kiểm soát phía server

- Mã email có hiệu lực 5 phút; mỗi mã chỉ dùng một lần, tối đa 5 lần thử. Gửi lại có thời gian chờ 60 giây; giới hạn chung theo tài khoản và IP vẫn áp dụng.
- Bằng chứng gắn với user, phiên Auth, IP, trình duyệt và email hiện tại. Backend từ chối phiên hết hạn, đã thu hồi, tài khoản bị khóa, email bị đổi hoặc luồng đang khôi phục thiết bị.
- Phiên đăng nhập vẫn chịu thời hạn 6 giờ và hạn không hoạt động của cấu hình hiện hành. Các thao tác ghi sau khoảng xác minh gần đây vẫn cần xác nhận mật khẩu hiện tại.
- Không giả mạo AAL2 hoặc TOTP trong Supabase. Email là bằng chứng yếu tố thứ hai do ứng dụng kiểm tra phía server; JWT AAL1 không có bằng chứng này vẫn bị chặn.
- Quyền admin/user và các chính sách dữ liệu nghiệp vụ giữ nguyên. Thay Authenticator và tạo lại mã khôi phục tiếp tục yêu cầu xác minh Authenticator.

## Kiểm tra

- 25 kiểm thử gateway/mật khẩu pass; gửi đến đúng email Auth, chống payload giả, rate limit, lỗi nhà cung cấp, giữ thời hạn phiên khi đọc trạng thái, xác nhận mật khẩu sau email và luồng TOTP cũ.
- Fixture database chạy trong transaction rollback: mã sai/hết hạn/dùng lại, sai IP/trình duyệt/phiên, email chưa xác minh, chưa lưu recovery, session revoked/expired, tài khoản inactive, đọc sau 10 phút và xác nhận mật khẩu trước khi ghi. Các kiểm thử cũ về mật khẩu, thiết bị tin cậy và thay Authenticator cũng pass. Không lưu tài khoản thử hoặc nghiệp vụ giả trên production.
- Giao diện 320/390/1440 px: email login không cần TOTP; mã sai bị chặn; countdown gửi lại; chuyển Authenticator; hủy; email chưa đủ điều kiện; gửi thất bại. Không tràn ngang.
- PWA typecheck/build/quét bundle private-key pass. Website đã nhận build `b55e4679cac99a35`, gateway `admin-pwa-auth` version 16. HTML, version, service worker và bundle JS production khớp bản build.
- Bằng chứng: `qa/email-login-database.json`, `qa/email-login-ui.json`, `qa/email-login-deployment.json`, `qa/email-login-production.json`.
- Electron typecheck/build, đóng gói Windows và kiểm tra footprint đã pass. Bundle đăng nhập trong ASAR khớp bản build: `qa/email-login-electron.json`. Installer mới ở `../../dist/DBYHOME-1.0.100-setup.exe`; chưa publish qua kênh tự cập nhật Electron.

Các bài kiểm tra email dùng fixture; chưa gửi OTP thật tới hộp thư của người dùng trong lượt này. PWA đang mở cần nhận bản cập nhật để thấy nút mới.
