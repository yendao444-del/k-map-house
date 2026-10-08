# Phase 07 — Tên miền thật và backend demo online

Ngày: 06/10/2026.

## Quyết định của người dùng

- Đã mua `phongtroankhang.com`, kết nối DNS; yêu cầu kiểm tra và hoàn tất để website hoạt động.
- OCR phải dùng API AI online, hoạt động khi máy tính tắt.
- Người dùng chưa có API key AI, chốt bổ sung sau. Không bật nhận diện giả hoặc bỏ qua xác nhận ảnh để lập hóa đơn.

## Cập nhật kích hoạt OCR online — 07/10/2026

- Người dùng đã cập nhật token triển khai Supabase. Token được xác thực qua management API; không đưa khóa vào frontend hoặc tài liệu.
- `webmobile-demo` đã được deploy với Gemini `gemini-3.1-flash-lite`. Gateway Pages đã giữ secret server và trỏ đúng function.
- `https://phongtroankhang.com/api/health`, `www` và Pages đều báo `ocrConfigured:true`.
- Kiểm thử end-to-end qua domain bằng ảnh thật: điện `12692` (khoảng 4,4 giây), nước `00287` (khoảng 3,1 giây), xác nhận từng ảnh, hóa đơn demo `3.472.000đ`, mô phỏng giao dịch SePay và trạng thái `paid` với biên nhận.
- Evidence: `../qa/public-cloud-ocr-flow.json`, `../qa/cloud-backend-deployment.json`.
- Vẫn là dữ liệu demo: chưa bật thanh toán thật, webhook SePay thật, tenant thật, email hoặc đăng nhập sản xuất.

## Đã triển khai và kiểm chứng

- Domain chính, `www` và Pages URL đều trả HTTP 200 với cùng entry asset của bản build hiện tại. Cloudflare xác nhận cả hai custom domain/validation active; HTTPS kiểm tra với chứng chỉ được tin cậy, không bỏ xác minh TLS.
- Đã deploy bản mới: khung scan cố định, không có bước kéo/chỉnh vùng chọn. Camera cần quyền người dùng; phần cứng điện thoại chưa được kiểm tra thay người dùng.
- Pages Functions gateway `/api/health`, `/api/meter-ocr`, `/api/demo-payments` gọi Supabase function riêng `webmobile-demo` bằng secret backend; browser không nhận gateway secret/service key/provider key.
- Supabase lưu phiên thử/hóa đơn mẫu trong bảng riêng `webmobile_demo_sessions`, giới hạn lượt đọc trong `webmobile_demo_limits`. RLS và quyền service-role; không đổi bảng khách thuê, hợp đồng, hóa đơn thật hoặc tài khoản ngân hàng.
- Cookie Secure/HttpOnly/SameSite theo host và session scope; lease nguyên tử ngăn hai request cùng phiên ghi đè; trạng thái hóa đơn/queue demo có thể khôi phục sau cold start. Không lưu ảnh công tơ trong database; phiên hết hạn sau 24 giờ không hoạt động, dọn khi có claim tiếp theo.
- OCR quota nguyên tử: 200 ảnh/ngày toàn bộ demo, 120/IP đã băm, 20/phiên. Không tiêu quota hoặc gọi AI khi chưa có key.
- API AI online được chuẩn bị với Gemini hoặc provider tương thích OpenAI. Giữ toàn bộ biên ảnh, kiểm tra ảnh tối thiểu/đồng nhất, hai lượt đọc phải khớp từng chữ số; giữ kiểm tra loại công tơ và số cũ/mới. Không có Sharp tăng tương phản trên cloud. Chưa kiểm chứng model/độ chính xác AI vì key được hoãn.
- Trang chủ báo “Bản demo · AI chờ cấu hình.”; ảnh mẫu chuyển thẳng OCR review và hiện “AI online chưa được cấu hình”, nút xác nhận không cho qua. Không diễn giải lỗi cấu hình thành ảnh khách chụp mờ.

## Evidence

- `../deployment.json`: domain, build asset, thời điểm deploy, backend health.
- `../qa/public-domain-checks.json`: cả ba host health 200/backend online, OCR 503 với `OCR_NOT_CONFIGURED`, token giả không lập được hóa đơn.
- `../qa/cloud-database-checks.json`: anon không gọi RPC, authenticated không đọc bảng phiên, lease sai bị chặn, claim đồng thời bị chặn, state khôi phục, lượt thứ 21/phiên bị chặn. Fixture database được rollback.
- 25 kiểm thử backend pass; build/typecheck/public secret scan pass; prototype typecheck và 28 file runtime được bảo vệ pass.
- Browser: trang chủ mobile 390×844 và 320×568 không tràn ngang/dọc; khách mới không có nút lịch sử cũ. `../qa/public-domain-home-390.png`, `../qa/public-domain-home-320.png`, `../qa/public-domain-new-tenant.png`, `../qa/public-domain-ocr-pending.png`.

## Chờ bổ sung / ngoài bản demo

- API key AI online: điền `METER_CLOUD_API_KEY` trong `.env.production.local`, sau đó `npm run deploy:backend`; script kiểm tra catalog/model trước khi kích hoạt. Cần thử ảnh thật để chứng minh tốc độ/chất lượng. Không suy ra OCR đạt độ chính xác 100% từ hai lần cùng model.
- Đăng nhập người thuê, phân quyền hợp đồng thật, xác nhận hợp đồng qua email, đồng bộ nghiệp vụ Electron, hóa đơn thật, scheduler/email và webhook SePay thật là các phase tiếp theo; bản hiện tại vẫn dùng fixtures.
- Website và backend đã host online, không phụ thuộc `start.bat`. AI chưa hoạt động online cho đến khi bổ sung key; thanh toán hiện vẫn là SePay mô phỏng.
- Không mua gói hosting/backend trả phí; dùng Pages và Supabase hiện có. Chưa đo chi phí AI vì chưa kích hoạt.

Hướng dẫn kỹ thuật: `../cloud/README.md`. Chỉ cập nhật source/tài liệu website trong `webmobile`.


## Cập nhật API key Gemini — 06/10/2026

Người dùng đã bổ sung key tại `webmobile/.env`, được chuẩn hóa thành `METER_CLOUD_API_KEY`, provider Gemini và model `gemini-3.1-flash-lite`. API catalog và hai lượt đọc ảnh nước thật trả HTTP 200, cùng đọc `00287` khoảng 6,6 giây. Model 2.5 không dành cho tài khoản mới; 3.8/3.5 đang quá tải. Triển khai key lên Supabase bị 401 với token quản trị hiện tại, đã yêu cầu cập nhật `SUPABASE_ACCESS_TOKEN` ở `.env` gốc. Website chưa kích hoạt OCR online; không nhầm kết quả test trực tiếp với kết quả trên cloud. Chi tiết: `../qa/gemini-api-test.md`.
