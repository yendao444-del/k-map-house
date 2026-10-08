# QA luồng lập hợp đồng

Ngày: 05/10/2026.

## Phạm vi

Kiểm tra component thực tế `ContractsTab` và `NewContractPage` trong harness tại `webmobile/qa/contract`. Repository được thay bằng fixture và localStorage riêng; không dùng dữ liệu khách thật, không ghi database production, không gửi email.

## Kết quả

- Chọn **Lập hợp đồng mới** mở trang chọn phòng, không mở popup.
- Chỉ phòng trống xuất hiện. Khách đang có hợp đồng không được chọn cho hợp đồng mới.
- Chọn phòng mở trang lập hợp đồng với thông tin thuê bên trái, toàn bộ preview bên phải và thao tác cố định phía dưới.
- Tên tiếng Việt, CCCD, ngày cấp, địa chỉ và email lấy từ hồ sơ khách mẫu.
- Giá thuê 4.200.000 đồng, điện đầu kỳ 1234, nước 56 và điều khoản bổ sung hiện đúng trong preview.
- **Lưu bản nháp** báo đã lưu. Quay lại có thẻ bản nháp; **Tiếp tục lập hợp đồng** giữ nguyên dữ liệu.
- **Gửi Gmail xác nhận** bị khóa và có giải thích chờ website. Chưa kích hoạt hợp đồng.
- Không ghi nhận lỗi hoặc cảnh báo console của trang QA.

Ảnh: [Trang lập hợp đồng](contract-page.png).

## Giới hạn

Chưa kiểm tra gửi Gmail, trang khách xác nhận hoặc kích hoạt hợp đồng vì website công khai được người dùng hoãn đến sau. Harness không chứng minh luồng email hoạt động. Kiểm thử SQL riêng đã kiểm tra quyền truy cập, revision và các guard của bảng bản nháp.

## Cập nhật 06/10/2026 — Xác nhận rời hợp đồng

- Thay `window.confirm` khi chuyển tab bằng `ContractLeaveDialog`. Nút quay lại và các liên kết điều hướng bên trong trang hợp đồng dùng cùng component.
- Màu và font lấy từ token thương hiệu hiện tại; nút rõ nghĩa **Rời trang** / **Tiếp tục chỉnh sửa**. Mặc định focus vào tiếp tục chỉnh sửa.
- QA trong harness: tiếp tục giữ giá thuê chưa lưu; Escape đóng hộp; Tab quay vòng trong hộp; rời trang trở lại danh sách hợp đồng. Không lưu thay đổi giả vào database.
- `npm run typecheck`: đạt.
- Ảnh thực tế: [Xác nhận rời hợp đồng](contract-leave-dialog.png).
