# Website online — cập nhật 07/10/2026

## Địa chỉ

- https://phongtroankhang.com/
- https://www.phongtroankhang.com/
- https://ankhanghome-payment.pages.dev/

## Trạng thái đã xác minh

| Thành phần | Trạng thái |
| --- | --- |
| DNS/custom domain/HTTPS | Active, cả tên miền chính và www mở được |
| Website | Bản mới nhất, responsive, khung scan cố định |
| Backend demo | Online trên Supabase, gọi qua API cùng tên miền |
| Lưu trạng thái demo | Database riêng, không phụ thuộc RAM máy chủ local |
| OCR AI online | Đã kích hoạt Gemini; ảnh thật điện/nước qua kiểm tra |
| Hóa đơn/SePay | Demo; cần ảnh qua kiểm tra và xác nhận hợp lệ |
| Dữ liệu khách thật/đăng nhập/email | Chưa nối, thuộc phase tiếp theo |

Mở link trên điện thoại có thể thử giao diện và camera với quyền của người dùng. Website/backend/OCR chạy online, không cần bật máy tính. OCR yêu cầu kiểm tra và xác nhận chỉ số trước khi lập hóa đơn demo. Không chuyển tiền thật với QR demo.

Không mua thêm gói hosting/backend. Gemini dùng key riêng trong `webmobile/.env` và secret backend; phí AI phụ thuộc quota/billing của tài khoản Gemini. Key không nằm trong public assets.

Kiểm chứng: build/typecheck/secret scan, 25 tests, RPC guards trên database thật có rollback fixture, API trên cả 3 host, trang chủ 390px/320px và trạng thái OCR chưa cấu hình. Chi tiết: `phases/phase-07-domain-and-cloud-demo.md`.


## Cập nhật sau khi người dùng bổ sung API key

Gemini đã xác thực và đọc ảnh nước `00287` bằng `gemini-3.1-flash-lite` (2 HTTP 200, khoảng 6,6 giây). Token Supabase mới đã được xác thực, backend đã deploy và Pages gateway đã cập nhật. Health công khai trên cả domain chính và Pages báo `ocrConfigured:true`. Kiểm thử ảnh thật qua domain đã đọc điện `12692` và nước `00287`, xác nhận hai chỉ số, lập hóa đơn demo `3.472.000đ`, mô phỏng SePay và đối soát thành công. Evidence: `qa/public-cloud-ocr-flow.json`.


## QR ngân hàng — 07/10/2026

Theo yêu cầu mới, QR dùng BIDV/Đỗ Kim Ngân/STK từ Electron; ảnh QR qua public API được giải mã và khớp tài khoản/số tiền/mã chuyển khoản. Hóa đơn và đối soát vẫn demo, QR có thể chuyển vào tài khoản thật nên UI cảnh báo chưa chuyển tiền khi thử. Không còn nút xem chi tiết; các trường đối chiếu chính hiển thị trực tiếp. Evidence: `qa/public-bidv-payment.json`.

## Chuyển website người thuê sang pay — 07/10/2026

URL chính hiện tại: https://pay.phongtroankhang.com/ . DNS CNAME/Pages custom domain/HTTPS active. Domain chính và www chuyển hướng tạm thời 302 (GET)/307 (POST) sang pay, giữ path/query để dành domain chính cho website home sau này. Pages URL vẫn dùng để preview.

Đã bật đăng nhập Supabase thật cho hai tài khoản demo riêng; khách chưa đăng nhập không gọi được OCR/hóa đơn. Backend gắn đúng phòng và chặn đổi contract ID. Tài khoản demo không được quyền staff Electron; dữ liệu tenant/contract/invoice và SePay vẫn demo. Quên mật khẩu chưa bật email gửi thực tế. Mật khẩu demo nằm trong qa/private/demo-login-accounts.md. Không mua thêm dịch vụ.

Evidence: qa/public-auth-checks.json, qa/public-login-390.png, qa/public-login-new-tenant.png, deployment.json; phase chi tiết: phases/phase-08-demo-login-and-pay-subdomain.md.
