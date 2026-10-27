# Sửa lỗi hiển thị bước lưu mã khôi phục trên thiết bị mới

Ngày triển khai: 12/10/2026.

## Nguyên nhân

Trạng thái `email` của phiên điện thoại mới được dùng để vẽ chung wizard ba bước. UI không đọc trường `recovery_acknowledged` trả về từ `security_service`, nên vẫn vẽ bước “Lưu mã khôi phục” dù mã đã được lưu ở cấp tài khoản.

## Thay đổi

- Khi trạng thái là `email`, PWA/Electron gọi `securityState()` và đọc `recovery_acknowledged`.
- Nếu đã `true`, chỉ hiển thị xác minh email cho thiết bị mới; không gọi `recovery_issue` hoặc `recovery_ack`.
- Nếu chưa `true`, quy trình thiết lập lần đầu vẫn bắt buộc lưu mã trước khi cấp quyền.
- Nếu không đọc được trạng thái, giao diện khóa nút tiếp tục và cho phép thử lại; không tự đoán là đã lưu.
- Không thay đổi role, MFA, mã khôi phục hiện có, dữ liệu khách hàng hay auto update.

## Kiểm chứng

- Rollback database test: phiên điện thoại mới giữ `recovery_batch_id` và `recovery_ack_at`, xác minh email xong được authorize; thay đổi IP vẫn giữ acknowledgement.
- UI fixtures ở 390px và 320px: tài khoản cũ bỏ qua wizard mã khôi phục; tài khoản mới vẫn bắt buộc; lỗi tải trạng thái có nút thử lại.
- Typecheck Electron/PWA và build production đạt.
- PWA production đã triển khai, domain `app.phongtroankhang.com` trả đúng asset build mới.
- Electron source đã đồng bộ và build local; chưa phát hành installer mới.
