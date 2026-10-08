# QA: Lưu và gửi xác nhận hợp đồng

Môi trường QA dùng dữ liệu trong bộ nhớ, không gọi Supabase và không gửi Gmail thật.

## Đã kiểm tra

- Luồng thành công: `Bắt đầu lưu → Đã lưu phiên bản 1 → Tạo link phiên bản 1 → Gửi Gmail mô phỏng → Ghi nhận đã gửi phiên bản 1`.
- Sửa nội dung sau khi gửi tạo đúng phiên bản 2 và dùng phiên bản 2 để tạo link, gửi và ghi nhận.
- Sau khi gửi, nút gửi lại cùng phiên bản bị khóa.
- Lưu thất bại dừng toàn bộ luồng: chỉ có `Bắt đầu lưu → Lưu thất bại`, không tạo link và không gửi Gmail.
- Khi Gmail mất kết nối, nút gửi bị khóa nhưng `Lưu bản nháp` vẫn hoạt động.
- Khung Gmail chỉ hiển thị người nhận, mô tả, địa chỉ gửi; cảnh báo và thao tác kết nối chỉ xuất hiện khi dịch vụ lỗi hoặc chưa đăng nhập.

## Lệnh xác minh

- `node --test scripts/contract-email-delivery.test.cjs` — 9/9 đạt.
- `npm run build` — typecheck Node/Web và Electron build đạt.

Ảnh kiểm tra nằm trong thư mục này: `panel.png`, `panel-full.png`, `success.png`.
