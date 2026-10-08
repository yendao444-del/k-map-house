# QA — Hóa đơn và SePay demo

06/10/2026. Website local, dữ liệu hợp đồng/đơn giá/giao dịch mẫu; hai ảnh công tơ do người dùng cung cấp được OCR thật qua cấu hình 9Router hiện tại.

## Kiểm tra tự động

Lệnh: `node --test server/demo-payments.test.mjs server/meter-reader.test.mjs server/meter-policy.test.mjs server/meter-dev-api.test.mjs` — **17/17 pass**.

- Tính giá trên server từ token xác nhận; tổng/giá trị cũ gửi từ client không thay được hóa đơn.
- Không chấp nhận thiếu/giả/đổi loại/đổi hợp đồng/hết hạn token hoặc chỉ số bất thường.
- Hai yêu cầu đồng thời trả cùng một hóa đơn; đổi chỉ số đã lập trả 409.
- Mã chuyển khoản dùng trực tiếp helper Electron.
- Sai tài khoản, chuyển ra, số tiền không nguyên/âm/NaN hoặc mã khớp hai hóa đơn không thanh toán.
- Thiếu/thừa tiền không tăng số đã trả; đúng mã và đủ tiền ghi nhận một lần.
- Chống trùng bằng ID và reference, kể cả ID số; hóa đơn đã trả không ghi nhận thêm giao dịch mới.
- Nguồn giả → hàng đợi → status poll → thành công; lặp lại giao dịch bỏ qua.
- Khách mới không có số cũ; token hợp đồng mới không đọc được hóa đơn hợp đồng khác.
- Test API tích hợp OCR/confirm hai công tơ → tạo hóa đơn; token giả không qua API.

Build website/typecheck/public bundle scan: pass. Prototype source sync, typecheck và kiểm tra nguyên vẹn 28 runtime files: pass.

## Kiểm tra browser thực tế

Website `http://127.0.0.1:5188/`, 390 × 844:

1. Upload ảnh điện thật: AI hiển thị **12692 kWh**, so số cũ mẫu 12600, tăng 92; xác nhận chuyển sang nước.
2. Upload ảnh nước thật: AI hiển thị **00287 m³**, số cũ mẫu 280, tăng 7; xác nhận tự chuyển hóa đơn.
3. Hóa đơn **3.392.000đ**, QR và nội dung chuyển khoản demo hiển thị. Không có tràn ngang ở 390px.
4. Bấm nguồn demo thiếu 10.000đ → polling tự hiển thị cần đối soát, tổng còn nguyên.
5. Bấm nhận đủ tiền → tự hiện biên lai **3.392.000đ** và thời điểm/mã giao dịch.
6. Gửi lại giao dịch → hiển thị đã bỏ qua, không tăng tiền.
7. Trang chủ → chuyển khách mới: không có lịch sử, giá cũ, chỉ số cũ hoặc hóa đơn của khách 101.
8. Chuyển lại khách đang thuê, reload: khôi phục biên lai từ server bằng khả năng phiên; lịch sử thêm 09/2026 và giữ các tháng riêng của hợp đồng đó.
9. Không có console error trong luồng đã kiểm tra. 320px cũng không tràn ngang ở biên lai.

Ảnh bằng chứng lưu riêng, không nằm trong public/build:

- `private/sepay-demo-invoice.png`
- `private/sepay-demo-partial.png`
- `private/sepay-demo-receipt.png`
- `private/sepay-demo-new-tenant.png`

## Kết luận và giới hạn

Pass cho demo local. Nguồn giao dịch là mô phỏng, chưa chứng minh kết nối SePay/webhook ngân hàng thật. Dữ liệu trong RAM mất khi server khởi động lại. Không deploy Pages; auth, database và vận hành cloud còn theo phase 05.
