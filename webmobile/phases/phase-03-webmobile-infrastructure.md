# Phase 03 — Website người thuê và hạ tầng

Ngày ghi nhận: 06/10/2026.

## Đã ghi nhận

- Toàn bộ source và tài liệu liên quan website lưu tại `G:\PHONG TRO\app\webmobile`.
- Website người thuê theo phương án 1 đã duyệt, đồng bộ màu Electron.
- Theo yêu cầu mới, làm trang chủ người thuê trước; trang khách mở link email xem/xác nhận hợp đồng nối sau.
- Về sau có website giới thiệu/home của AN KHANG HOME, ngoài website nghiệp vụ cho người thuê.
- Người dùng yêu cầu ưu tiên miễn phí hoặc chi phí thấp; hạ tầng phải hỗ trợ tự động khi máy Electron tắt.
- Đã chốt 06/10/2026: bản demo dùng địa chỉ miễn phí Cloudflare Pages `*.pages.dev`. Sau khi ổn định mới mua/gắn domain riêng. Tên project cụ thể còn chờ kiểm tra khả dụng.

## Quy hoạch domain đề xuất

| Địa chỉ minh họa | Vai trò |
| --- | --- |
| `ankhanghome.vn` (và `www` nếu cần) | Website giới thiệu/home của thương hiệu |
| `payment.ankhanghome.vn` | Website người thuê: xem/xác nhận hợp đồng, nhập/chụp điện nước, xem hóa đơn, thanh toán và lịch sử thuộc hợp đồng hiện tại |

- Chỉ cần mua/sở hữu domain chính; subdomain thông thường không phải mua riêng. Giá đăng ký/gia hạn `.vn` cần kiểm tra riêng, không áp dụng mức tham khảo `.com` trong báo cáo.
- Hai site có thể deploy vào hai Cloudflare Pages project độc lập, gắn domain/subdomain tương ứng và có HTTPS. Phí hosting đề xuất 0đ trong hạn mức Free.
- Khi triển khai home sau này, ưu tiên project riêng để cập nhật/rollback độc lập với website thanh toán.
- Giữ chung Supabase hiện tại cho nghiệp vụ cần backend. Home giới thiệu tĩnh không cần database riêng; chỉ gọi API công khai nếu có chức năng cần dữ liệu.
- Phân quyền theo site/người thuê/hợp đồng. Không chia sẻ phiên admin hoặc dữ liệu khách thuê với home công khai chỉ vì cùng domain.
- `ankhanghome.vn` là ví dụ do người dùng đưa ra; chưa kiểm tra khả dụng, quyền sở hữu hay mua domain. Chưa cấu hình DNS hoặc triển khai site.

## Hạ tầng tư vấn đã ghi chú

1. Frontend React + TypeScript + Vite, Cloudflare Pages Free. Có thể dùng URL `*.pages.dev` trong giai đoạn thử trước khi gắn domain.
2. Dùng chung Supabase Database và Edge Functions hiện tại với Electron, không cần mua VPS chỉ để phục vụ website này.
3. Ảnh công tơ/CCCD lưu Storage riêng tư; API/token theo quyền và link có hạn. Website không chứa service-role key, khóa email hoặc token SePay.
4. Chuyển gửi Gmail lên backend để chạy khi máy tắt; có thể giữ tài khoản Gmail bằng OAuth server. Resend Free là lựa chọn thay thế, chưa chốt provider.
5. Scheduler backend cho nhắc cuối tháng và gửi hóa đơn; có retry, nhật ký và chống gửi trùng.
6. SePay cần webhook/backend cập nhật thanh toán; luồng polling Electron hiện tại chưa đáp ứng khi máy tắt.
7. Chuẩn bị backup trên cloud; script backup máy hiện tại chưa bao gồm `contract_drafts`.

## Chi phí và giới hạn

- Frontend static Cloudflare Pages Free: 0đ; thêm subdomain không tự tạo phí backend.
- Supabase Free: 500 MB database, 1 GB Storage; có thể pause sau 1 tuần không hoạt động và không có automatic database backups. Chưa xác nhận billing hiện tại của project.
- Database thực tế đã kiểm tra khoảng 16 MB, Storage khoảng 0,4 MB; hiện còn nhỏ so với hạn mức Free.
- `.com` tham khảo: ngân sách 350–500k/năm; `.vn` theo tên người dùng minh họa cần báo giá riêng tại thời điểm đăng ký.
- Nếu cần loại bỏ pause do inactivity: Supabase Pro từ 25 USD/tháng, chưa tính thuế/tỷ giá/overage. Không cam kết uptime 100% từ gói này.
- Gmail có thể 0đ cho khối lượng hiện tại; Resend Free 3.000 thư/tháng và 100 thư/ngày, cần domain gửi đã xác minh.
- Chưa cộng phí SePay hoặc OCR/AI trả phí nếu sau này sử dụng.

Chi tiết và nguồn: `../infrastructure-review-20261006.md`.

## Còn cần chốt trước khi triển khai công khai

- Domain thực tế và tài khoản Cloudflare do chủ sản phẩm sở hữu.
- Gói backend đang dùng, yêu cầu vận hành/backup.
- Gmail OAuth server hoặc provider email thay thế.
- Token xác nhận hợp đồng, trạng thái gửi/xem/xác nhận, kích hoạt hợp đồng nguyên tử và phân quyền website.

Ngày 06/10/2026 đã deploy bản demo static vào Pages project riêng `ankhanghome-payment`, URL `https://ankhanghome-payment.pages.dev/`. Dùng dữ liệu mẫu, chưa nối nghiệp vụ thật. Không đăng ký dịch vụ trả phí.

## Cách kết nối AI agent

- Cloudflare có REST API và Wrangler CLI. Tài liệu deploy dùng `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN`; token tối thiểu cho deploy Pages là **Account → Cloudflare Pages → Edit**.
- Tài khoản Cloudflare cũng có MCP chính thức `https://mcp.cloudflare.com/mcp`, truy cập qua OAuth hoặc API token; MCP có thể tìm/gọi Cloudflare API.
- Supabase có MCP chính thức, có thể giới hạn theo project và bật read-only. Với production nên ưu tiên project-scoped, read-only khi kiểm tra; chỉ mở deploy/migration khi đã kiểm tra diff.
- Secret triển khai local lưu tại `webmobile/.env.local` đã được Git bỏ qua; không đưa token vào biến `VITE_*` hoặc frontend. Account ID lấy từ URL tài khoản trong ảnh người dùng; token để trống cho người dùng điền trực tiếp vào file.
- Agent có thể tự động build, tạo Pages project, deploy bản demo `pages.dev` đã được người dùng yêu cầu, xem deployment và kiểm tra logs. Việc mua domain/nâng gói không nằm trong phạm vi demo miễn phí đã chốt.

### Kết nối Cloudflare đã kiểm tra 06/10/2026

- Người dùng lưu `CLOUDFLARE_API_TOKEN` tại `.env` gốc của repository; Account ID tại `webmobile/.env.local`. Khi triển khai, loader phải lấy token từ `.env` gốc nếu giá trị ở file webmobile trống. Không in token hoặc đưa vào bundle frontend.
- API xác minh account token trả HTTP 200, `success: true`, trạng thái `active`.
- API liệt kê Pages projects trả HTTP 200, `success: true`; tài khoản đang có project `dbysoftware` (`dbysoftware.pages.dev`).
- Token hết hạn 06:59:59 ngày 06/11/2026 theo giờ Việt Nam (API: `2026-11-05T23:59:59Z`).
- Kiểm tra ban đầu chỉ đọc. Sau khi người dùng chốt triển khai, đã tạo Pages project riêng `ankhanghome-payment` và deploy thành công; không sửa project `dbysoftware`.

## Demo UI đã triển khai và review

- Điều chỉnh responsive đã chốt: home ưu tiên thông tin phòng và nút chụp, lịch sử mở khi bấm. Breakpoint chiều cao giúp không phải cuộn home ở các viewport 359 × 757 và 320 × 568 đã kiểm tra.

- URL: https://ankhanghome-payment.pages.dev/
- Ba trạng thái: khách đang thuê có lịch sử thuộc hợp đồng hiện tại; khách mới không hiển thị dữ liệu trước; chụp điện → review/retake → nước → hoàn tất chụp thử.
- Source: `src/`. Build/deploy độc lập với Electron, tự động qua `npm run deploy` và `scripts/deploy.mjs`.
- Trang chủ làm trước theo quyết định mới; link email xác nhận hợp đồng nối sau.
- Public bundle chỉ có static frontend/assets. Không chứa server keys, dữ liệu khách thật hoặc endpoint Supabase thật.
- Review build, browser mobile/public và ảnh so sánh đã hoàn thành, `design-qa.md` có `final result: passed`.
- Chưa nối auth/API production, private Storage, OCR, tạo hóa đơn, Gmail scheduler hoặc SePay webhook. Phân quyền hợp đồng phải được thực hiện trên backend trước khi dùng thật.
- Báo cáo chi tiết: `../implementation-report.md`.

### Cập nhật OCR local 06/10/2026

Người dùng chốt thử OCR qua `start.bat` trên máy trước. Luồng nhận diện AI, xác nhận số điện → nước, chụp lại và nhập tay đã nối tại local; Pages vẫn là bản demo static cũ. Chi tiết: `phase-04-meter-ocr-local.md`. Chưa kết nối lưu chỉ số thật hoặc phát hành hóa đơn từ website.


## Cập nhật tên miền và backend — 06/10/2026

Đã mua/gắn domain thật `phongtroankhang.com` và `www.phongtroankhang.com`; HTTPS active. Website bản mới và backend demo online đã triển khai. OCR dùng API online theo lựa chọn người dùng, key được người dùng hoãn bổ sung. Trạng thái hiện tại và evidence: `phase-07-domain-and-cloud-demo.md`. Các đoạn trên mô tả lịch sử tư vấn/triển khai, không thay thế trạng thái mới.
