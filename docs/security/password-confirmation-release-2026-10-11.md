# Xác nhận mật khẩu cho thao tác nhạy cảm

Ngày triển khai: 11/10/2026.

- Đăng nhập vẫn dùng mật khẩu và Authenticator; phiên quản trị vẫn tối đa 6 giờ.
- Đọc trạng thái/lịch sử SePay dùng phiên đã được cấp quyền, không hỏi xác minh lại trong 5 phút.
- Ghi nhận SePay và lưu tài khoản nhận tiền/token mở hộp mật khẩu ngay tại thao tác nếu chưa có xác nhận mật khẩu trong 5 phút.
- Admin đổi mật khẩu tài khoản khác phải nhập mật khẩu của mình; không dùng mật khẩu của người được đổi.
- Tự đổi mật khẩu nhập mật khẩu hiện tại và mật khẩu mới. Server dùng Auth endpoint của chính phiên hiện tại, giữ AAL2 và chính sách mật khẩu của Supabase; không dùng admin endpoint vốn sẽ thu hồi cả phiên đang thao tác.
- Server chỉ chấp nhận xác nhận từ gateway tin cậy sau khi Auth xác minh identity thật. Browser không được ghi proof. Có rate limit 5 lần/5 phút theo user và IP, ràng buộc proof với session/IP/agent.
- Password confirmation không tạo quyền mới và không bỏ qua các kiểm tra AAL2, phiên sống, email, recovery acknowledgement hoặc thiết bị bị thu hồi.

Bằng chứng kiểm thử và production ở `qa/password-confirmation-*.json`; so sánh mẫu giao diện ở `../design/sepay-password-confirmation/design-qa.md`.

PWA đã triển khai trên app.phongtroankhang.com. Electron đã build local; installer hiện hành chưa chứa UI mới cho tới khi phát hành bản Electron tiếp theo.
