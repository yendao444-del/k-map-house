# Phase 06 — Khung quét công tơ và dữ liệu hóa đơn như Electron

Ngày: 06/10/2026. Người dùng đã đồng ý triển khai khung chụp/chọn vùng/kiểm tra ảnh và yêu cầu màn hình thanh toán demo có các trường dữ liệu tương ứng phần mềm.

## Luồng đã thực hiện

Camera có khung ngắm cố định như quét QR → khách bấm chụp → lấy ảnh trong khung từ video gốc và đọc ngay → hai lượt đọc song song → kiểm tra mức tiêu thụ → khách đối chiếu ảnh phóng to và xác nhận → nước → hóa đơn → đối soát SePay demo. Chọn ảnh đã chụp cũng đi thẳng sang đọc, không có bước chọn vùng.

- Camera dùng `getUserMedia`, ưu tiên camera sau, không lấy âm thanh, dừng stream khi rời màn hình. Có chọn ảnh đã chụp khi thiết bị/quyền camera không sẵn sàng.
- Quyết định cập nhật 06/10/2026: bỏ toàn bộ bước chọn vùng thủ công. Khung camera cố định, có vạch quét hướng dẫn; khách không kéo hay điều chỉnh. Vạch quét là hiệu ứng hướng dẫn, không tự phát hiện công tơ và không tự chụp. Bấm “Chụp & đọc số” lấy vùng trong khung theo tọa độ video gốc, có tính phần bị che bởi `object-fit: cover`. Chọn file không tự đoán/cắt công tơ; ảnh nhiều công tơ phải chụp lại.
- Client/server chặn ảnh dưới 240 × 180px; server từ chối ảnh gần như đồng nhất trước khi gọi AI. Ngưỡng này là giới hạn tối thiểu, không phải chứng minh dãy số đã rõ.
- Hai ảnh gửi AI đều giữ đủ biên của ảnh nhận được, một ảnh gốc và một bản tăng tương phản nhẹ. Đã bỏ cắt giữa ảnh cố định. Không dùng AI để tạo lại chữ số hoặc làm sắc nét sinh nội dung.
- Hai lượt phải có đúng một công tơ, khung đủ gần/không cắt mất số, không có vấn đề lóa/mờ/không đọc rõ, đúng loại/đơn vị. Đây là nhận định của model trên ảnh, chưa phải bộ phát hiện vật thể độc lập.
- So sánh chuỗi từng chữ số, kể cả số 0 đầu, không chỉ so sánh số nguyên. Thiếu/khác metadata chất lượng hoặc khác chữ số đều không cấp token.
- Không cho nhập tay để vượt ảnh đã bị từ chối. Cho sửa chỉ số khi ảnh đã qua kiểm tra; backend kiểm tra lại và lưu nguồn manual riêng.

## Các trường hóa đơn

Đối chiếu `Invoice` / `InvoicePaymentRecord` trong `src/renderer/src/lib/db.ts` và `InvoiceDetailModal.tsx`:

- Thông tin phòng/người thuê/hợp đồng; mã hóa đơn, nội dung thu, ngày lập, kỳ tính tiền, hạn thanh toán.
- Điện/nước: chỉ số cũ, chỉ số mới, tiêu thụ, đơn giá chụp tại thời điểm lập, thành tiền. Khách mới chỉ có chỉ số bàn giao, không lấy số hoặc lịch sử của hợp đồng cũ.
- Tiền phòng, Internet/WiFi, vệ sinh, nợ kỳ trước thuộc hợp đồng hiện tại, điều chỉnh/ghi chú.
- Tổng cộng, bằng chữ, đã thanh toán, còn phải trả, trạng thái/phương thức/ngày thanh toán và bản ghi giao dịch.
- Ngân hàng, số tài khoản, chủ tài khoản, nội dung và số tiền chuyển; email/SĐT người thuê, cơ sở/địa chỉ/liên hệ chủ nhà.
- Trường cọc/bù trừ cọc/hư hỏng được giữ trong schema demo và chỉ hiển thị khi phát sinh. Luồng hiện tại là hóa đơn tháng; chưa triển khai tính thanh lý, chuyển phòng hoặc thu/hoàn cọc.
- Nội dung chuyển khoản và hàm đọc tiền bằng chữ lấy từ hàm thuần Electron, không tải component React/IPC/database.
- `payment_method` dùng giá trị `transfer`; bản ghi tiền dùng `payment_date`, `created_at`, `external_ref`, `external_id`, `source` tương ứng phần mềm.

WiFi demo 50.000đ + vệ sinh 30.000đ. Phòng 101 với chỉ số mẫu 12692 / 287: **3.472.000đ** (thay 3.392.000đ của phase 05). Phòng 102 bàn giao chưa phát sinh điện nước: **3.080.000đ**. Các giá này là fixture, chưa đọc phí thật từ Electron.

## Kiểm chứng ban đầu và giới hạn (trước khi bỏ chọn vùng)

19 kiểm thử pass; build/typecheck/public scan và kiểm tra 28 file runtime prototype pass. Browser 390px/320px không tràn ngang trong hóa đơn đã kiểm tra. Chạy luồng đầy đủ bằng provider OCR mô phỏng có banner riêng để kiểm tra hóa đơn/thanh toán/hợp đồng mới; không dùng kết quả đó làm bằng chứng độ chính xác AI.

OCR thật: ảnh nhiều công tơ của người dùng bị từ chối; ảnh zoom mờ bị từ chối. Một ảnh điện chọn riêng mặt đọc `10717` trong khoảng 5,7 giây, phù hợp dãy số nhìn trên ảnh. Ảnh nước thử vẫn bị đánh giá mờ trong khoảng 6,3 giây. Vì vậy không cam kết mọi ảnh zoom đều đọc được hay độ chính xác 100%. Hai lượt cùng model có thể cùng sai; khách vẫn phải đối chiếu. Chưa có mã định danh/số serial công tơ gắn với từng phòng để chứng minh đúng công tơ của hợp đồng.

Camera trực tiếp trên điện thoại thật còn cần người dùng thử; browser QA đã kiểm tra chọn ảnh/cắt ảnh. Camera cần quyền truy cập và secure context (HTTPS hoặc localhost); URL local hiện chỉ thử trên máy, bản Pages công khai chưa cập nhật API.

Ảnh và khả năng mở hóa đơn chỉ tồn tại trong phiên local; không upload ảnh vào public/build, không ghi giao dịch thật, không gọi SePay thật hoặc deploy cloud. Chi tiết: `../qa/meter-framing-invoice-fields.md`.

## Kiểm chứng sau khi bỏ chọn vùng — 06/10/2026

- Build/typecheck/public scan pass; 20/20 kiểm thử pass, gồm ánh xạ khung camera cho nguồn portrait/landscape và API nhận ảnh không cần cờ `selectionConfirmed`.
- Prototype đã đồng bộ; typecheck và kiểm tra 28 file runtime được bảo vệ pass.
- Browser 390 × 844: khung scan cố định hiển thị, không có nút chọn lại vùng, không tràn ngang. Ảnh: `../qa/private/meter-fixed-scan-mobile.png`. Đây là kiểm tra giao diện khung, chưa chứng minh camera điện thoại thật.
- Browser dùng server QA gắn banner OCR mô phỏng: chọn file điện đi thẳng vào trạng thái đọc/xác nhận; xác nhận chuyển nước; ảnh mẫu nước đọc ngay; lập hóa đơn 3.472.000đ với đầy đủ trường. Ảnh: `../qa/private/meter-no-selection-invoice.png`. Không dùng provider mô phỏng để khẳng định độ chính xác AI.
- Giữ kiểm tra ảnh mờ/lóa/nhiều công tơ/sai loại, so sánh từng chữ số, bất thường số cũ/mới và xác nhận người thuê. Chưa thử camera vật lý trên điện thoại; vẫn cần HTTPS/localhost và quyền camera. Bản Pages chưa deploy.
