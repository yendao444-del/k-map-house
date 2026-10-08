# Phase 01 — Hồ sơ khách thuê trên Electron

## Đã chốt ngày 05/10/2026

- Thiết kế được duyệt: phương án 2 của bộ demo OCR CCCD.
- Ảnh chuẩn: `../design/tenant-profile/approved-ocr-option-2.png`.
- Toàn bộ thao tác thêm khách thuê diễn ra trên Electron của chủ nhà.
- Chủ nhà cung cấp ảnh CCCD bằng tải lên, kéo thả hoặc dán ảnh.
- Hệ thống đọc ảnh để tự điền thông tin giấy tờ; chủ nhà kiểm tra/chỉnh sửa và lưu hồ sơ.
- Số điện thoại và email cần được bổ sung từ thông tin khách cung cấp, không lấy từ OCR CCCD.
- Hợp đồng lấy thông tin từ hồ sơ khách thuê; chi tiết tích hợp hợp đồng và xác minh được bàn riêng.
- Để bảo đảm tên tiếng Việt có dấu, khi lưu phải có QR hợp lệ từ ảnh mặt sau; OCR mặt trước chỉ hỗ trợ đối chiếu/dự phòng và không được tự đoán tên.

## Công nghệ đã triển khai

- `zxing-wasm` (ZXing-C++) chạy cục bộ trong main process Electron để đọc QR.
- `sharp` để xoay theo EXIF, giới hạn kích thước, chuẩn hóa ảnh và tạo bản lưu hai mặt.
- `tesseract.js` với bộ ngôn ngữ `vie+eng` đóng gói cục bộ làm fallback OCR khi QR không có.
- IPC preload riêng `tenantIdentity:read` và `tenantIdentity:clipboard`; ảnh không được gửi ra ngoài trong bước QR/OCR; khi lưu hồ sơ, ảnh đi theo cơ chế lưu dữ liệu hiện tại của ứng dụng.
- React + TypeScript + Tailwind theo design system Electron hiện tại.

## Kết quả kiểm thử ảnh thật

Ảnh trong `webmobile/test image` đã được chạy qua backend:

- Ảnh mặt sau gốc: QR → tên đầy đủ có dấu và số CCCD khớp ảnh mẫu.
- Ảnh mặt sau thu nhỏ còn 1200px: QR → khớp 100%.
- Ảnh mặt sau xoay 90°: QR → khớp 100%.
- Ảnh mặt trước OCR sau chuẩn hóa JPEG và cắt vùng: tên có dấu và số CCCD khớp mẫu. Vẫn yêu cầu QR khi lưu để ưu tiên nguồn đọc ổn định.
- Ảnh sai định dạng và dữ liệu không hợp lệ: bị từ chối.

Chi tiết máy: `webmobile/qa/backend-results.json` và `webmobile/qa/packaged-runtime-results.json` (fixture ảnh thật được gitignore để không phát tán CCCD).

## Đang thảo luận — chưa chốt

- Các trường bắt buộc, trường mở rộng và xử lý khi không đọc được ảnh.
- Lưu trữ ảnh CCCD và quyền truy cập ảnh.
- Quy tắc kiểm tra trùng hồ sơ.

## Trạng thái triển khai

Đã triển khai Phase 01 và chạy typecheck/build. Đã kiểm tra đóng gói Windows, thư viện native và model OCR trong runtime đóng gói. Sau lỗi lưu trên database thực tế, đã áp dụng migration `20261005200000_tenant_identity_details.sql` bổ sung `address`, `id_card_issued_date`, `id_card_issued_place` nullable vào tenants và xác nhận PostgREST nhận schema mới. Không tạo khách thuê thử trong dữ liệu production.
