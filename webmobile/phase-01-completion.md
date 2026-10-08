# Báo cáo hoàn thành Phase 01 — Hồ sơ khách thuê

Ngày: 05/10/2026.

## Phạm vi đã thực hiện

- Tích hợp phương án 2 vào Electron: Khách thuê → Thêm khách thuê.
- Có hai ô và hai nút rõ ràng: **Mặt trước** và **Mặt sau**; mỗi ô nhận một ảnh JPG/PNG tối đa 5 MB, đồng thời hỗ trợ kéo thả hoặc dán ảnh vào đúng mặt.
- Đọc QR bằng ZXing-C++ (`zxing-wasm`); OCR bằng `tesseract.js` với model `vie+eng` cục bộ; xử lý ảnh bằng `sharp`.
- Tự điền tên và số giấy tờ, giữ Unicode NFC và số 0 đầu; cho chỉnh sửa và xác nhận đối chiếu trước khi lưu.
- Phát hiện hai số giấy tờ mâu thuẫn, từ chối ảnh trùng, giữ chỉnh sửa khi kết quả OCR đến muộn.
- Lưu bản ghép hai ảnh qua trường `identity_image_url` hiện có. Sau kiểm tra schema thực tế, đã bổ sung ba cột nullable còn thiếu: `address`, `id_card_issued_date`, `id_card_issued_place` bằng migration `20261005200000_tenant_identity_details.sql`.

## Bằng chứng

Tên trên bộ ảnh cung cấp: **Đỗ Kim Ngân**. QR trả đúng tên có dấu và số giấy tờ ở ảnh gốc, ảnh thu nhỏ 1200px và ảnh xoay 90°. OCR mặt trước cũng khớp tên và số trên bộ ảnh này.

- 6 kiểm thử parser/validation/persistence: passed.
- `npm run typecheck`, `npm run build`, `npm run build:win`, `npm run verify:package`: passed.
- IPC với preload và main handlers đã biên dịch trong cửa sổ Electron sandbox: passed.
- Electron smoke dùng thư viện trong `app.asar` và model trong resources đóng gói: cả QR/OCR khớp fixture.
- QA giao diện: tải hai ảnh, tự điền, xác nhận, lưu bản ghép, bỏ ảnh QR và từ chối ảnh trùng đã được kiểm tra trên harness biệt lập.
- Giao diện đã tách rõ hai ô/nút **Mặt trước** và **Mặt sau**; thay từng mặt được kiểm tra, thay ảnh reset xác nhận, ảnh trùng giữa hai ô bị chặn. Ảnh giao diện: `qa/tenant-two-sides.png`.
- Không tạo khách thuê trong database production khi kiểm thử; kiểm thử persistence dùng adapter giả lập.
- Installer đã build tại `dist/DBYHOME-1.0.99-setup.exe`; chưa cài installer trong lần xác minh này.

Chi tiết: `design-qa.md`, `qa/backend-results.json`, `qa/ipc-runtime-results.json`, `qa/packaged-runtime-results.json`.

## Sửa lỗi lưu hồ sơ trên Supabase thực tế

Lỗi `Could not find the 'address' column of 'tenants' in the schema cache` do kiểu Tenant trong app khai báo các trường giấy tờ nhưng bảng production chưa có các cột tương ứng. Đã áp dụng và ghi nhận migration trên project workspace ngày 05/10/2026, yêu cầu PostgREST reload schema và xác nhận API nhận đủ ba trường bằng truy vấn chỉ đọc `limit=0`. Ngày cấp không có giá trị được gửi là `undefined` (không gửi chuỗi rỗng vào cột date).

Insert xác minh dùng bảng temporary tạo từ cấu trúc tenants hiện tại, rollback toàn bộ: tên có dấu, số 0 đầu, ngày cấp hợp lệ và ngày cấp null đều qua. Kết quả ở `qa/tenant-schema-results.json`. Không tạo/sửa khách thuê thực tế; thay đổi production chỉ bổ sung cột nullable và bản ghi migration. Sáu tests và build/typecheck được chạy lại thành công sau sửa lỗi.

## Giới hạn và quy tắc hiện tại

Kết quả dựa trên một bộ CCCD được cung cấp, không chứng minh độ chính xác tuyệt đối trên mọi ảnh. QR lấy tên trực tiếp từ dữ liệu mã; OCR không tự đoán hoặc khôi phục dấu từ MRZ. Ảnh QR mờ cần được thay bằng ảnh rõ hơn.

Hiện lưu hồ sơ yêu cầu hai ảnh khác nhau, QR hợp lệ và xác nhận đối chiếu. Quy tắc này là lựa chọn triển khai nhằm giảm nguy cơ sai tên có dấu; các chính sách trường bắt buộc, lưu trữ ảnh và kiểm tra hồ sơ trùng vẫn cần được bàn riêng.

Bước đọc QR/OCR chạy trên máy, không gửi ảnh đến dịch vụ OCR ngoài và không có phí OCR theo lượt. Khi lưu hồ sơ, ảnh đi theo cơ chế dữ liệu hiện có của ứng dụng.

Hợp đồng, xác minh email/điện thoại, cấp tài khoản và thanh toán không nằm trong phạm vi Phase 01 này.
