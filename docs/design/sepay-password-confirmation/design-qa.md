# Kiểm tra giao diện xác nhận mật khẩu — 11/10/2026

## Mẫu đã chọn

- Mẫu: `demo.png` trong cùng thư mục.
- Triển khai giữ modal trắng bo góc, header xanh nhạt, biểu tượng đồng bộ và khiên, ô mật khẩu có nút hiện/ẩn, chú thích giữ phiên hai bước, hai nút Hủy và Xác nhận và tiếp tục.
- Tiêu đề SePay được giữ; phụ đề nêu thao tác thực tế (ghi vào hóa đơn hoặc sổ ngân hàng). Modal dùng kích thước và màu của ứng dụng hiện có; co lại cho màn hình điện thoại.
- Mật khẩu sai hiện lỗi ngay dưới ô nhập; xóa ô sau khi gửi, không lưu local/session storage.
- Mật khẩu đúng được xác nhận ở server. Trong cửa sổ 5 phút của cùng phiên, UI hỏi server trước để tránh hỏi lại khi xử lý liên tiếp.
- Modal admin đổi mật khẩu tài khoản khác thêm ô mật khẩu của admin đang thao tác. Form tự đổi mật khẩu dùng mật khẩu hiện tại, mật khẩu mới và xác nhận; không yêu cầu mã email/Authenticator mới trong phiên đã được cấp quyền.

## Bằng chứng

- Desktop 1440×900: `../../security/qa/password-confirmation-1440.png`.
- Mobile 390×844: `../../security/qa/password-confirmation-390.png`.
- Mobile 320×568: `../../security/qa/password-confirmation-320.png`.
- Admin đổi mật khẩu: `../../security/qa/admin-password-confirmation-1440.png`.
- Tự đổi mật khẩu: `../../security/qa/own-password-confirmation-1440.png`.
- UI test: `../../security/qa/password-confirmation-ui-2026-10-11.json`.

Kiểm tra bằng dữ liệu giả lập: ô nhập được focus; mật khẩu mặc định che; lỗi sai mật khẩu; xóa trường nhạy cảm; xác nhận thành công; hủy không chạy mutation; modal SePay nằm gọn trong ba viewport và không tràn ngang. Form hồ sơ giữ vùng cuộn hiện có.

## Kiểm tra bảo mật và triển khai

- 153 test PWA đạt; 3 test chính sách bridge SePay đạt.
- Typecheck và production build PWA/Electron đạt.
- Database test dùng fixture trong transaction rollback: giới hạn 5 lần/5 phút theo tài khoản và IP, proof hết hạn, ràng buộc phiên/IP/agent, AAL1, tài khoản inactive, email, recovery và phiên hết hạn.
- Real Auth/Edge test bằng tài khoản staff tạm: sai mật khẩu bị chặn; đúng mật khẩu được chấp nhận; không tự ghi proof qua RPC; đổi mật khẩu giữ nguyên session AAL2 và refresh token; mật khẩu cũ bị từ chối; tài khoản tạm được xóa.
- Đã áp dụng migration `20261011153000_management_password_confirmation.sql`.
- Edge: `admin-pwa-auth` v9, `admin-sepay-bridge` v21, `admin-pwa-sepay` v10.
- PWA production build `0dd6603eeab0372f`, entry `/assets/index-kSU54t3a.js`; domain thật trả bản khớp build local. Request xác nhận mật khẩu ẩn danh trả 401.
- Không ghi payment thật, không thay đổi dữ liệu khách hàng hoặc gửi email thật. Phân quyền, cấu hình Auth và cơ chế auto update giữ nguyên.
- Electron đã build local; chưa phát hành installer mới.
