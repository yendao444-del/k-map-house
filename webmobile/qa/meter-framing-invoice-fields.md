# QA — Chọn vùng công tơ và dữ liệu hóa đơn

06/10/2026.

## Kiểm tra tự động

`node --test server/demo-payments.test.mjs server/meter-reader.test.mjs server/meter-policy.test.mjs server/meter-dev-api.test.mjs`: **19/19 pass**.

Thêm kiểm tra: nhiều công tơ, lóa/mờ/cắt mất số/công tơ quá xa, thiếu metadata không được chấp nhận; chuỗi `00126` và `0126` không được coi là đồng thuận; ảnh nhỏ/trống bị chặn; ảnh tăng tương phản giữ nguyên biên; API yêu cầu đã chọn vùng. Hóa đơn có đúng đơn giá, tiêu thụ, phí WiFi/vệ sinh, tổng tiền, kỳ/hạn thanh toán và tiền bằng chữ; thanh toán cập nhật đầy đủ trường/trạng thái/bản ghi.

`npm run build`: typecheck, Vite và scan private configuration pass. `npm run sync:prototype`, `npm run check:runtime --prefix prototype` và prototype typecheck pass; 28 file runtime không thay đổi.

## OCR thật

- Browser 5188: upload ảnh điện → chọn vùng → OCR. Ảnh điện ban đầu có thể bị đánh giá mờ; không cho xác nhận hoặc nhập tay vượt kiểm tra.
- Ảnh clipboard có nhiều công tơ: chọn toàn ảnh → hai lượt AI → **bị từ chối vì nhiều công tơ**. Chọn lại vùng mở ảnh gốc với công cụ chỉnh khung.
- Ảnh clipboard zoom công tơ: **bị từ chối vì dãy số chưa nét**. Việc zoom/cắt không bảo đảm khôi phục thông tin mờ.
- API local với hai vùng chọn riêng từ ảnh trong thư mục người dùng: điện đọc **10717** / khoảng **5682ms**, nước bị từ chối do mờ / khoảng **6293ms**. Đây là một lượt mỗi ảnh, không phải benchmark đại diện. Điện được đối chiếu bằng mắt với ảnh cắt; nước chưa có kết quả OCR được chấp nhận trong lượt này.
- Nguồn/crop/kết quả không có token/secret: `private/meter-selection-real-results.json`. Ảnh đối chiếu: `private/meter-10717-selected.png`.

## UI và thanh toán (OCR mô phỏng có banner)

Website QA riêng 5192 có banner **KIỂM THỬ MÔ PHỎNG OCR · Không phải kết quả AI thực tế**. Provider giả chỉ phục vụ kiểm tra tương tác, không đánh giá chất lượng ảnh.

- Chọn ảnh điện/nước → cắt vùng → xác nhận tuần tự → tự tạo hóa đơn **3.472.000đ**.
- Hóa đơn có mã, người thuê, kỳ/ngày lập/hạn, chỉ số cũ/mới/tiêu thụ/đơn giá, phòng/điện/nước/WiFi/vệ sinh/nợ/điều chỉnh, tổng/đã trả/còn lại, bằng chữ, ghi chú, ngân hàng/tài khoản/chủ tài khoản/nội dung.
- Nhận đủ tiền qua nguồn SePay giả → polling tự hiện biên lai, `đã trả=3.472.000đ`, `còn lại=0đ`, có phương thức/tham chiếu; lịch sử thêm hóa đơn đúng tổng.
- Đổi khách mới: không có lịch sử khách 101; hóa đơn **3.080.000đ**, chỉ số bàn giao, không có chỉ số cũ hoặc tiêu thụ của khách trước.
- Hóa đơn ở 390px và hóa đơn khách mới ở 320px không tràn ngang. Không có console error trong lượt QA cuối.

Ảnh private: `meter-crop-electric.png`, `meter-multiple-rejected.png`, `meter-zoom-rejected.png`, `invoice-fields-mobile.png`, `invoice-fields-receipt.png`, `invoice-fields-new-tenant.png`.

## Chưa xác minh

Camera hardware/quyền camera trên điện thoại thật, chống đọc nhầm serial/định danh công tơ từng phòng, độ chính xác OCR trên mọi ảnh và webhook SePay thật. Hệ thống local vẫn cần máy/9Router chạy. Hóa đơn trong RAM, restart server mất demo. Không deploy Pages, không chạm sổ/database thật.


## Update 06/10/2026: fixed scan guide, no manual selection

Previous crop screenshots/results above describe the earlier implementation. Current upload/sample flow goes directly to OCR review. Camera extracts the fixed guide from original video pixels accounting for cover offsets. Guide animation is instructional, not automatic detection. 390×844 DOM check: guide present, manual region actions absent, no horizontal overflow; `private/meter-fixed-scan-mobile.png`. Physical mobile camera remains unverified.

Synthetic-provider browser QA with explicit banner: file upload → electric confirmation → water sample → water confirmation → complete invoice 3,472,000 VND. Evidence `private/meter-no-selection-invoice.png`. Build/public scan, 20 tests, prototype typecheck and 28 protected runtime files passed. Rejection and policy gates remain intact; simulation does not establish OCR accuracy.
