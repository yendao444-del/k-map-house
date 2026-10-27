# Đổi Google Authenticator — đề xuất chờ duyệt

Ngày: 12/10/2026.

Nguồn giao diện: `reference.png`, ảnh người dùng gửi trong yêu cầu bổ sung chức năng đổi Authenticator. `demo.png` là ảnh đề xuất, chưa phải chức năng đã triển khai.

## Giao diện

Giữ modal Bảo mật tài khoản và bốn tab hiện tại. Thêm nút nhỏ “Đổi Google Authenticator” cạnh “Xác minh lại Google Authenticator”. Luồng mở ngay trong tab Bảo mật với ba bước: Xác minh hiện tại → Thiết lập mới → Hoàn tất.

## Điều kiện an toàn cần triển khai

- Xác minh một mã mới từ Authenticator hiện tại trước khi cho phép bắt đầu đổi; phiên đăng nhập đã xác minh trước đó không thay thế bước này.
- Quyền đổi phải do backend xác nhận, gắn với tài khoản và phiên hiện tại, hết hạn ngắn và chỉ dùng một lần. Áp dụng xác minh email theo chính sách rủi ro; không tin trạng thái do frontend gửi.
- Tạo factor mới song song với factor cũ. Chỉ xóa factor cũ sau khi backend xác nhận factor mới thuộc đúng tài khoản và đã được xác minh bằng mã mới.
- Hủy, hết hạn, sai mã hoặc lỗi mạng không được làm mất factor cũ. Dọn factor mới chưa xác minh và hỗ trợ tiếp tục an toàn nếu phản hồi bị mất.
- Không dùng luồng recovery reset cho thao tác đổi thông thường. Mất thiết bị phải đi qua luồng khôi phục riêng.
- Kiểm tra tác động của trigger xóa factor hiện tại tới phiên đăng nhập và thiết bị tin cậy; thông báo đăng nhập lại nếu cần.
- Ghi audit cho thao tác đổi. Cấp bộ mã khôi phục mới, vô hiệu bộ cũ và yêu cầu người dùng lưu trước khi hoàn tất; không ghi mã, secret hoặc QR vào log.
- Khóa thao tác đồng thời và kiểm tra lại trạng thái khi gửi lại request để tránh xóa factor sai hoặc đổi nhiều lần.

## Kiểm chứng sau khi duyệt ảnh

Kiểm tra sai mã cũ, sai mã mới, hủy, hết hạn, lỗi mạng và gửi lặp đều giữ phương thức xác thực hợp lệ. Kiểm tra thành công chỉ còn factor mới, bộ recovery cũ hết hiệu lực, audit và chính sách phiên đúng. Chạy các kiểm tra của dự án và so sánh giao diện với ảnh được duyệt trong `design-qa.md`.

Chưa sửa giao diện, backend hoặc triển khai production trong giai đoạn demo này.
