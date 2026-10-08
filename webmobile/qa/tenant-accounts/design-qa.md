# QA — Cài đặt / Tài khoản

Ngày kiểm tra: 07/10/2026.

## Hướng đã được duyệt

Theo ảnh Cài đặt / Tài khoản người dùng cung cấp (`codex-clipboard-5e016887-d8bd-46f6-b1a9-533b7d093bf9.png`), giữ khung Cài đặt, thanh điều hướng bên trái, màu xanh nhận diện, kiểu chữ và bảng tài khoản hiện tại. Theo yêu cầu cuối, mục **Tài khoản** trở thành dropdown, mở xuống **Tài khoản hệ thống** và **Tài khoản khách thuê**.

## Kết quả

- Mục Tài khoản trong Cài đặt mở/thu gọn danh sách hai mục con, có mũi tên và `aria-expanded`/`aria-controls`.
- Mục hệ thống giữ danh sách admin/nhân viên, các bộ lọc, chỉ số và thao tác sẵn có.
- Mục khách thuê hiển thị tên khách/phòng, email, trạng thái, đăng nhập gần nhất và nút Quản lý.
- Nút Cấp tài khoản hiển thị khách đang hoạt động chưa có tài khoản, lấy email từ hồ sơ.
- Các thao tác cấp mật khẩu, đặt lại, khóa/mở và thu hồi phiên vẫn dùng backend admin đã triển khai.
- Khi chuyển mục con, vùng nội dung trước được tháo khỏi giao diện để xóa thông tin mật khẩu đang hiện. Các nút điều hướng hỗ trợ bàn phím Tab/Enter.
- Các đường truy cập tài khoản ở menu chính/menu cho thuê/hồ sơ khách đã được gỡ. Quản lý hồ sơ khách vẫn ở Quản lý cho thuê / Khách thuê.

## Evidence

- `settings-system.png`: dropdown mở, mục admin/nhân viên.
- `settings-tenants.png`: dropdown mở, mục khách thuê trong cùng khung Cài đặt.
- Kiểm tra trực tiếp trình duyệt qua fixture `http://127.0.0.1:5194/`, dùng component SettingsTab thật và mock dữ liệu để không ghi Supabase.
- Đã kiểm tra dropdown mở/đóng, chuyển hai mục con và luồng Cấp tài khoản → Chọn khách → thông tin tài khoản chưa cấp.
- Build Electron/typecheck đạt; kiểm thử backend vẫn giữ quyền riêng cho người thuê.

## Giới hạn

Ảnh QA dùng dữ liệu giả. Không tạo/đổi tài khoản thật để thử. Khôi phục mật khẩu qua email và hóa đơn/SePay thật trên website vẫn thuộc phase tiếp theo.
