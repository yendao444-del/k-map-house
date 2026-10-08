# Webmobile — phương án 1 đã duyệt

## Phạm vi giao diện

Giao diện mobile cho người thuê sau khi đăng nhập:

1. Tóm tắt căn phòng và hợp đồng hiện tại.
2. Nút mở lịch sử thanh toán của hợp đồng hiện tại (chỉ hiện nếu người thuê đã có lịch sử). Theo lựa chọn 06/10/2026, danh sách tháng mở ở màn riêng để trang chủ ưu tiên thông tin phòng và nút chụp.
3. Nút bắt đầu chụp chỉ số điện và nước.
4. Luồng chụp điện trước, nước sau để tạo hóa đơn.

## Quy tắc dữ liệu

- Lịch sử phải gắn với `tenantContractId`, không gắn đơn giản theo phòng.
- Khách mới chỉ thấy dữ liệu của hợp đồng hiện tại.
- Không hiển thị dữ liệu người thuê trước, giá cũ, chỉ số cũ, ảnh cũ, hóa đơn cũ hoặc công nợ cũ.

## Nhận diện thương hiệu

- Primary: `#00AB60`
- Primary dark / header: `#064A31`
- Text: `#15231D`
- Muted text: `#718079`
- Canvas: `#F7FAF8`
- Mint surface: `#EDF9F1`
- Border: `#E5EEE8`

## Tài liệu tham chiếu

- `approved-option-1.png`: hình ảnh phương án 1 đã duyệt.
- `approved-option-1.prompt.json`: thông tin lần tạo hình ảnh.

## Bản triển khai demo 06/10/2026

- Website mobile: `https://ankhanghome-payment.pages.dev/`, Cloudflare Pages Free.
- Ba trạng thái: khách đang thuê; khách mới không hiển thị lịch sử cũ; chụp điện → xem lại → nước → hoàn tất chụp thử.
- Dữ liệu mẫu: `src/fixtures.ts`. Ảnh công tơ minh họa được ghi rõ.
- Chưa nối đăng nhập thật, Supabase, link xác nhận hợp đồng, OCR, hóa đơn, Gmail hay SePay; thực hiện ở các phase tiếp theo.
- QA đối chiếu hình đã duyệt: `design-qa.md`.

## Điều chỉnh responsive được người dùng chốt 06/10/2026

- Trang chủ ưu tiên thông tin phòng và nút chụp luôn nhìn thấy ở các kích thước mobile đã kiểm tra.
- Lịch sử mở khi bấm nút riêng, không liệt kê các tháng ngay trang chủ.
- Có breakpoint theo chiều cao 760/680 px để giảm header/khoảng cách, giữ nút ít nhất 44 px. Không khóa overflow để che nội dung ở màn hình quá nhỏ hoặc khi người dùng tăng cỡ chữ.
