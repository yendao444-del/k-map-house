# Website mobile — hoàn thành demo UI 06/10/2026

## Cập nhật trang chủ theo phản hồi responsive

- Người dùng chốt lịch sử mở bằng nút riêng; trang chủ chỉ ưu tiên tóm tắt phòng và CTA điện/nước.
- Breakpoint theo chiều cao viewport 760/680 px để trang chủ gọn trên cửa sổ thấp.
- 359 × 757: không overflow ngang/dọc; 320 × 568: CTA và lịch sử launcher nằm trong màn hình.
- Tài liệu/ảnh QA trước ở dưới phản ánh phiên bản có hai hàng lịch sử ngay home. Phiên bản mới mở danh sách các tháng khi bấm `Lịch sử thanh toán`.

## Xem demo

- Khách đang thuê: https://ankhanghome-payment.pages.dev/
- Khách mới: https://ankhanghome-payment.pages.dev/?tenant=new
- Chụp điện/nước: https://ankhanghome-payment.pages.dev/?screen=capture
- Local website: http://127.0.0.1:5188/
- Local phone prototype: http://127.0.0.1:5189/

## Đã làm

1. Thông tin phòng, giá hiện tại, ngày bắt đầu và lịch sử thuộc hợp đồng hiện tại.
2. Khách mới không hiển thị lịch sử, số tiền, công nợ, ảnh hoặc tên khách trước. Chuyển demo khách sẽ xóa ảnh đã chọn của phiên trước.
3. Chụp/chọn ảnh điện → xem lại/chụp lại → nước → xem lại → hoàn tất chụp thử. Ảnh ở trình duyệt, không upload. Có ảnh mẫu để thử nhanh; không giả lập OCR thành công.
4. Lịch sử mở được chi tiết tiền phòng/điện/nước và trạng thái thanh toán mẫu.
5. Logo/font lấy từ Electron, màu theo brief. Ảnh công tơ được tạo qua 9Router; đây là ảnh hướng dẫn minh họa.
6. Deploy tự động bằng script, dùng riêng project mới. Project `dbysoftware` không đổi.

## Tự động hóa

Chạy trong thư mục `webmobile`:

```powershell
npm ci
npm run build
npm run deploy
```

`deploy` build, kiểm tra bundle, tìm/tạo riêng project Pages, upload `dist` và xác nhận HTTP 200. Secret lấy từ `.env` gốc và `.env.local`, chỉ truyền trong môi trường tiến trình Wrangler; không nằm trong bundle. Token Cloudflare hiện hết hạn ngày 06/11/2026; cần cập nhật token khi muốn deploy sau ngày đó.

Nguồn UI duy nhất ở `src/`. `npm run sync:prototype` đồng bộ vào bản thử trong khung điện thoại `prototype/`, giữ nguyên 28 file runtime được bảo vệ. Public Pages deploy website trực tiếp cho điện thoại, không deploy ảnh khung thiết bị.

## Review

- Typecheck/build và quét public build: passed.
- In-app browser: file chooser, ảnh preview, retake, điện → nước → hoàn tất, menu, lịch sử, chi tiết hóa đơn, chuyển khách, lỗi tệp không phải ảnh: đã thử.
- Viewport mobile 393 × 900, 320 px: không tràn ngang. Desktop website giữ cột đọc tối đa 443 px.
- Prototype mobile: màn thiết bị đo đúng 393 × 852; runtime integrity và build passed. Đã sửa lỗi hai bản React ở bản prototype bằng đồng bộ source và dependency riêng.
- Website public: HTTPS, HTTP 200, cả ba deep links hoạt động, không lỗi/warn console trong phiên kiểm tra. CSP/noindex có trên response.
- So sánh hình đã duyệt: `design-qa.md`, ba board tại `qa/home/compare-*.png`.

## Phạm vi chưa nối

Đây là demo giao diện sau đăng nhập, chưa phải hệ thống tự động dùng cho khách thật. Chưa có đăng nhập thật, contract-scoped authorization/API, link xác nhận email, lưu ảnh lên private Storage, OCR, sinh hóa đơn, email scheduler và SePay webhook. Không đổi database, không công khai dữ liệu thật, không gửi email thật.

Không thiếu API/token để chạy demo này. Phase tiếp theo cần thiết kế auth/phân quyền và API website trên Supabase; thông tin Gmail/SePay chỉ cần khi triển khai tích hợp tương ứng. Bản demo chưa chứng minh camera trên iPhone/Android vật lý; đã kiểm tra file picker bằng ảnh mẫu trên browser.

Cloudflare hosting và tên miền `pages.dev`: 0đ trong hạn mức Free. Không nâng gói hoặc mua domain.
