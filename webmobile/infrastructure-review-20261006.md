# Kiểm tra hạ tầng website người thuê — 06/10/2026

Trạng thái: tư vấn, chưa chốt nhà cung cấp/tên miền và chưa triển khai website công khai.

## Thực tế đã kiểm tra

- Backend hiện tại là Supabase, project ở Singapore (`ap-southeast-1`), trạng thái `ACTIVE_HEALTHY`.
- Query chỉ đọc: database tổng 16 MB; các bảng `public` khoảng 2248 kB; 25 bản ghi phòng, 30 khách thuê, 48 hợp đồng, 202 hóa đơn. Đây là số bản ghi thực tế, không suy ra số phòng đang kinh doanh.
- Storage: 1 bucket, 5 file, tổng 410478 bytes (khoảng 0,4 MB).
- Có 1 ảnh CCCD dạng data URL trong database, khoảng 0,61 MB. Ảnh mới cho website nên lưu trong bucket riêng tư thay vì nhét base64 vào bảng.
- Đã deploy `admin-sepay-bridge` và `send-email-notification`. Không suy ra cấu hình email/provider hoạt động chỉ từ trạng thái function.
- Chưa cài `pg_cron` hoặc `pg_net`; chưa có website người thuê hay API token xác nhận hợp đồng trong source đã kiểm tra.
- Gmail hiện tại dùng Electron main + OAuth, token được Windows safeStorage mã hóa cục bộ; bị khóa khi `app.isPackaged`. Gmail này không gửi khi máy tắt.
- Luồng SePay trong App lấy giao dịch mỗi 60 giây khi trang đang hiển thị. Muốn cập nhật thanh toán khi máy tắt cần webhook/server job; chỉ host frontend sẽ không giải quyết việc này.
- Đã xác nhận trạng thái/dung lượng, chưa xác nhận gói billing hiện tại của tài khoản Supabase.

## Kiến trúc đề xuất tận dụng hệ thống đang có

1. Source website: `G:\PHONG TRO\app\webmobile`.
2. Frontend React + TypeScript + Vite: build thành file tĩnh, host trên Cloudflare Pages Free. Có URL `*.pages.dev` và có thể gắn tên miền riêng; HTTPS được cung cấp bởi dịch vụ.
3. Backend: Supabase Edge Functions cho link xác nhận, xác nhận hợp đồng, tính hóa đơn, email và webhook SePay; dữ liệu dùng chung với Electron.
4. Database: Supabase PostgreSQL hiện tại. Người thuê chỉ được xem dữ liệu thuộc hợp đồng của mình, không mở quyền bảng admin cho trình duyệt.
5. Ảnh công tơ/CCCD: Supabase Storage private, truy cập bằng quyền theo hợp đồng hoặc link có hạn. Frontend chỉ giữ cấu hình công khai; service-role/API email/token không đưa vào website.
6. Nhắc cuối tháng: lịch backend gọi function, có nhật ký gửi, retry và chống gửi trùng. Giữ Gmail hiện có bằng cách chuyển phần OAuth/gửi sang server là một phương án; Resend Free là lựa chọn thay thế nếu dùng domain riêng. Đây là tác vụ tự động, không yêu cầu mở Electron.
7. Để xác nhận hợp đồng: link ngẫu nhiên có hạn, gắn đúng bản snapshot/revision, có thể thu hồi; đọc link không tự xác nhận. Người thuê phải chủ động xác nhận.

## Chi phí và giới hạn đã đối chiếu

| Thành phần | Giá/hạn mức | Nhận xét |
| --- | --- | --- |
| Cloudflare Pages static | 0 USD; request file tĩnh miễn phí, không giới hạn; 500 build/tháng ở Free | Phù hợp website người thuê. Pages Functions có quota Workers riêng nếu dùng. |
| Supabase Free | 500 MB database, 1 GB Storage, 5 GB egress, 500.000 Edge Function invocations | Dung lượng hiện tại nhỏ hơn nhiều so với hạn mức. Project Free có thể bị pause sau 1 tuần không hoạt động. Free không có automatic database backups. |
| Supabase Pro | Từ 25 USD/tháng cho cấu hình cơ bản một project | Không pause do inactivity, backup hằng ngày giữ 7 ngày. Đây là phí nâng gói backend, không phải phí bắt buộc để host frontend. Không diễn giải thành cam kết uptime 100%. |
| Tên miền miễn phí | Subdomain `*.pages.dev` | Dùng được cho thử nghiệm và link website, không cần mua domain. |
| Tên miền `.com` — ví dụ TENTEN | 309.000đ năm đầu; gia hạn 429.000đ/năm, chưa VAT 8% theo bảng giá | Tương ứng khoảng 333.720đ / 463.320đ gồm VAT hiện niêm yết. Tên chưa được chọn/kiểm tra khả dụng. Ngân sách 350–500k/năm là hợp lý cho domain loại này. |
| Gmail API | Standard usage không có phí bổ sung; có quota và giới hạn tài khoản | Khối lượng vài chục/vài trăm thư tháng rất nhỏ. Cần cấu hình OAuth server; OAuth External Testing có refresh token hết hạn 7 ngày với scope gửi Gmail. |
| Resend Free | 3.000 email/tháng; 100 email/ngày | Gửi cho khách thật cần xác minh domain gửi. Có thể nhận trên Gmail. Không cần trả 20 USD/tháng cho khối lượng hiện tại. |

Với 24 phòng, một nhắc nhập điện nước + một hóa đơn + một biên nhận mỗi phòng là khoảng 72 email/tháng (chưa tính retry/nhắc nợ). Nếu cùng phát sinh trong một ngày vẫn cần tính tất cả thư gửi thực tế vào giới hạn 100/ngày.

Ví dụ ảnh: 24 phòng × 2 ảnh/tháng × 200 kB sau nén ≈ 9,6 MB/tháng, 115 MB/năm. Đây là ước lượng thiết kế, không phải số đo ảnh công tơ thực tế; cần tính thêm ảnh CCCD, file khác và lượt tải/egress. Đặt thời hạn lưu ảnh theo nghiệp vụ, không xóa lịch sử tài chính theo phòng.

## Phương án tư vấn

- Miễn phí để bắt đầu: Pages Free + URL pages.dev + Supabase hiện tại nếu ở Free/trong quota + Gmail chuyển sang backend. Phí hạ tầng phát sinh có thể 0đ; không bảo đảm chạy không gián đoạn vì chính sách pause Free.
- Ít phí, dễ nhận diện: Pages Free + domain `.com` + Supabase hiện tại + Gmail cloud hoặc Resend Free. Ngân sách domain khoảng 350–500k/năm. Chưa cần mua VPS hay gói hosting truyền thống.
- Nếu cần loại bỏ pause backend: thêm Supabase Pro từ 25 USD/tháng, cộng domain. Thuế, tỷ giá, compute của project khác và overage có thể làm tổng tăng.

Đề xuất bắt đầu bằng phương án ít phí; chỉ nâng backend khi yêu cầu vận hành hoặc quota thực tế cần. Không mua addon custom domain của Supabase (10 USD/tháng) chỉ để gắn tên miền frontend Cloudflare.

## Bổ sung quy hoạch nhiều website — 06/10/2026

Đã ghi chú vào `phases/phase-03-webmobile-infrastructure.md`: domain chính dành cho home giới thiệu; subdomain dành cho website người thuê. Ví dụ do người dùng đưa ra là `ankhanghome.vn` / `payment.ankhanghome.vn`, chưa kiểm tra quyền sở hữu hoặc khả dụng. Subdomain không cần mua riêng; giá `.vn` cần kiểm tra riêng thay vì dùng ngân sách `.com` ở trên. Hai site có thể dùng hai Cloudflare Pages project với HTTPS, tận dụng chung Supabase cho nghiệp vụ cần backend và phân quyền riêng; không tạo database mới chỉ vì có thêm subdomain.

## Việc phải chuẩn bị trước khi bật thật

- Website xem/xác nhận hợp đồng; API xác nhận và phân quyền theo khách/hợp đồng.
- Domain hoặc URL Pages công khai được chốt; token link an toàn; khóa cấu hình môi trường.
- Email chạy trên server; cấu hình OAuth Gmail hoặc xác minh domain gửi, kiểm tra gửi/nhận và chống trùng.
- Scheduler backend và SePay webhook; kiểm tra máy Electron tắt vẫn xử lý.
- Backup database/Storage trên cloud. Script backup hiện có chạy tại máy và danh sách bảng chưa có `contract_drafts`, nên chưa thể coi là backup tự động toàn bộ khi tắt máy.
- Kiểm tra OCR ảnh công tơ thực tế riêng trước khi chốt có cần AI trả phí; tổng chi phí trên chưa bao gồm dịch vụ AI hoặc phí SePay hiện có.

## Nguồn giá/chính sách

Đối chiếu ngày 06/10/2026; giá có thể thay đổi trước lúc đăng ký.

- https://supabase.com/pricing
- https://supabase.com/docs/guides/cron
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/functions/pricing/
- https://tenten.vn/vi/bang-gia-ten-mien
- https://resend.com/pricing
- https://developers.google.com/workspace/gmail/api/reference/quota
- https://developers.google.com/identity/protocols/oauth2?hl=en

Kết quả tổng hợp được lấy bởi `check-infrastructure.mjs` bằng query chỉ đọc; không ghi dữ liệu production, không gửi email, không đăng ký dịch vụ/domain.
