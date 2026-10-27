# Sửa xác nhận bảo mật khi trả phòng

## Nguyên nhân

Luồng lưu đối chiếu tài sản gọi ghi dữ liệu khi phiên chưa có xác minh gần đây, dẫn tới thông báo `Management MFA/session verification required` thay vì mở bước nhập mật khẩu hiện tại.

## Bản sửa

- Lưu đối chiếu nhận/trả phòng và tạo hóa đơn tất toán sử dụng hộp xác nhận mật khẩu hiện có trước khi ghi.
- Hủy hoặc nhập sai mật khẩu không ghi dữ liệu; dữ liệu đang nhập được giữ nguyên.
- Lỗi được hiển thị trong form. Phiên hết hạn vẫn yêu cầu đăng nhập lại.
- Không đổi vai trò hoặc chính sách phân quyền.

## Kiểm tra và phát hành

- Fixture UI: `qa/checkout-password-ui.json`, gồm hủy, sai/đúng mật khẩu, phiên hết hạn, backend từ chối và hủy tất toán. Không trả phòng thật trên production.
- PWA typecheck/build và quét bundle riêng tư thành công.
- Đã publish website `https://app.phongtroankhang.com` ngày 12/10/2026; build `ca08ac7f61cf3765`. HTML, version và các bundle đối chiếu/tất toán/xác nhận khớp bản build: `qa/checkout-password-production.json`.
- Electron typecheck/build, installer Windows và kiểm tra footprint thành công. Đã đối chiếu ba bundle trong ASAR: `qa/checkout-password-electron.json`.
- Installer cục bộ: `../../dist/DBYHOME-1.0.100-setup.exe`. Chưa phát hành qua kênh tự cập nhật Electron; ứng dụng đang cài cần nhận installer này để có bản sửa.

Người dùng PWA cần nhận bản cập nhật hoặc mở lại website trước khi thử thao tác.
