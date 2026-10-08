# Phase 12 — Hợp đồng trên Electron thật và Gmail phòng trọ

## Chốt ngày 07/10/2026

Người dùng yêu cầu chuyển luồng sang Electron thật và dùng Gmail gửi `phongtroankhang.com@gmail.com`.

## Đã triển khai

- Electron dùng database `k-map-house` / schema `public`; endpoint xác nhận riêng `contract-confirmation`.
- Khách thuê → chọn phòng → lập hợp đồng → lưu bản nháp → gửi Gmail xác nhận.
- Email dùng banner phương án 1 và logo Electron đã duyệt. Link mở `https://pay.phongtroankhang.com/contract-confirmation`.
- Khi khách xác nhận: kiểm tra bản nháp/revision/email/phòng trống, tạo hợp đồng và cập nhật phòng trong cùng giao dịch. Chưa tạo hóa đơn hoặc ghi nhận đã thu tiền.
- Khách tự đặt mật khẩu; tài khoản chỉ truy cập portal khách thuê. Kết thúc hợp đồng khóa tài khoản và thu hồi phiên.
- Token link chỉ lưu hash trong database, hạn 72 giờ; các RPC và bảng xác nhận chỉ service role được dùng. Admin Electron phải đăng nhập thật.
- Gmail OAuth dùng client Desktop của project `ankhang-home-gmail` còn hoạt động. Gmail mới đã được thêm vào Test users.
- Electron xác minh email qua ID token Google trước khi lưu token, từ chối chọn nhầm Gmail cũ. Token được mã hóa bằng Windows safeStorage, gắn với client và Gmail gửi; không lấy token của phần mềm khác khi đã cố định Gmail.
- Hiển thị Gmail gửi trên trang lập hợp đồng; bỏ nút chuyển sang Electron TEST. Khi khách xác nhận, cập nhật cache hợp đồng/phòng/tài khoản.

## Kiểm tra

- Typecheck và build Electron/website đạt; public build không chứa cấu hình riêng.
- 27 kiểm tra Gmail, kết quả gửi và hàng rào production/test đạt (bao gồm không kế thừa Gmail production trong profile TEST).
- 14 kiểm tra luồng live trên project TEST riêng đạt sau khi cập nhật schema: không gửi trùng, link sửa/hết hạn bị chặn, xác nhận nguyên tử, cấp tài khoản đúng khách, thu hồi phiên khi trả phòng.
- Production: route website 200, link sai 410, admin thiếu JWT 401, anonymous RPC bị từ chối; bảng RLS bật.
- Số bản ghi trước/sau migration: 25 phòng, 30 khách, 48 hợp đồng, 2 bản nháp. Không tạo thêm hợp đồng, không gửi Gmail, không thanh toán trong triển khai.
- Pages đã deploy và kiểm tra backend health online. Secret Pages bị redacted khi đọc API nên deploy phải cấp lại giá trị riêng có sẵn; đã sửa và xác minh gateway.
- Bằng chứng: `qa/contract-production-deployment.json`, `qa/contract-production-verification.json`, `deployment.json`; metadata schema trước migration trong thư mục private.

## Gmail đã kết nối

Người dùng đã tự đăng nhập và cấp quyền trên Google. Electron lưu token mới thành công lúc 16:39 ngày 07/10/2026. Đã xác minh danh tính đúng `phongtroankhang.com@gmail.com`, scope `gmail.send` và refresh token thực sự đổi được access token mới. Token mã hóa nằm trong profile Electron chính `k-map-house`; không in token/secret và không gửi thêm thư.

Bằng chứng: `qa/gmail-production-connection.json` và `qa/gmail-new-sender-connected.png`. Script kiểm tra `scripts/verify-gmail-connection.cjs` chỉ đọc/kiểm tra OAuth, không gửi Gmail hay sửa nghiệp vụ.

### Người dùng gửi thử lúc 16:43 ngày 07/10/2026

Đã đối chiếu Gmail Đã gửi: người gửi `phongtroankhang.com@gmail.com`, người nhận đúng `zicky.iluv@gmail.com`. Tìm theo tiêu đề với `in:anywhere` trong Gmail nhận thấy thư hợp đồng phòng 999 nằm trong **Thư rác**. Gmail giải thích thư tương tự các thư đã được xác định là spam trước đó; không đủ bằng chứng để khẳng định do banner hoặc tài khoản mới.

Đã báo cáo riêng thư mới là không phải thư rác. Gmail xác nhận đã chuyển thư về Hộp thư đến. Bằng chứng ở `qa/private/gmail-contract-out-of-spam-20261007.png`. Không gửi lại email, không bấm link xác nhận, không kích hoạt hợp đồng thay khách. Trạng thái gửi thành công chỉ chứng minh Gmail tiếp nhận, không bảo đảm Inbox cho các địa chỉ nhận khác.

## Lịch sử xác nhận — đã triển khai 07/10/2026

- Trang lập hợp đồng Electron có nút icon đồng hồ **Lịch sử** cạnh trạng thái ở góc trên bên phải. Hộp lịch sử hiển thị giờ GMT+7 tới giây, tự cập nhật mỗi 5 giây khi mở và có nút làm mới.
- Các mốc: tạo link, gửi Gmail/thất bại, mở link, nội dung hợp đồng hiển thị, xác nhận hợp đồng, tài khoản sẵn sàng, thu hồi link. Giữ lịch sử các lượt gửi/bản hợp đồng; mỗi lần mở lại được ghi riêng, cùng một lượt không ghi trùng.
- Xem/xác nhận được lưu ở Supabase cloud khi Electron tắt. Quyền xem lịch sử chỉ dành cho admin đã xác thực; public gateway không cho truy vấn lịch sử, bảng/RPC chỉ service role được truy cập.
- Mốc cũ nhập từ thời gian đã lưu và có nhãn riêng. Không tạo giả giờ khách bấm link hoặc xem nội dung trước khi có tính năng. “Mở link” là trang nhận link; “xem hợp đồng” là nội dung đã hiển thị, không chứng minh người thật đã đọc toàn bộ hay Gmail đã vào Inbox.
- Migration/edge đã triển khai TEST và production; website đã deploy. Số phòng/khách/hợp đồng/bản nháp production không đổi (25/30/48/2). Không gửi thêm Gmail hoặc xác nhận hợp đồng thay khách.
- Kiểm tra: 8 backend tests; 21 live TEST checks (mở/xem, chống trùng, mở nhiều lượt, xác nhận/cấp tài khoản, thu hồi, quyền truy cập); production read-only checks; build Electron/website. UI thực kiểm tra đầy đủ/rỗng/đang tải/lỗi, Escape và mở lại.
- Bằng chứng: `qa/contract-history-test-deployment.json`, `qa/contract-history-production-deployment.json`, `qa/contract-history-preview.png` (giao diện component thực với dữ liệu giả).

## Giới hạn hiện tại

Sửa/hủy sau xác nhận đã triển khai ở [Phase 13](phase-13-contract-amendment-and-cancellation.md): phiên bản chờ xác nhận, hủy có lý do, giữ tài chính và lịch sử.

- Gmail gửi từ Electron đang bật; backend xem/xác nhận/cấp tài khoản chạy cloud khi máy tắt.
- Google OAuth đang ở Testing; token Gmail có thể hết hạn sau 7 ngày. Trước khi vận hành lâu dài cần hoàn tất cấu hình/publishing Google OAuth phù hợp. Chưa tự publish app, chưa thay quyền Gmail ngoài phạm vi gửi thư và xác minh email gửi.
- Hóa đơn/ảnh chỉ số/SePay trên website vẫn có phần demo, chưa chuyển sang nghiệp vụ thanh toán thật trong phase này.
- Chưa chạy lượt gửi/xác nhận với hồ sơ thật. Người dùng có thể bắt đầu kiểm tra bằng phòng 999 trong Electron chính sau khi Gmail kết nối; thao tác này sẽ lưu vào database chính.
