# Phase 15 — Thanh toán hằng tháng cho người thuê

## Cập nhật hoàn thành — 08/10/2026

Website: https://pay.phongtroankhang.com/?screen=payment

- Menu: Trang chủ; Thông tin phòng → Thông tin chung / Điện & nước / Thiết bị trong phòng; Thanh toán; Tài khoản; Đăng xuất. Điện & nước chung một mục; gửi ảnh tuần tự điện rồi nước.
- Scheduler cloud hiện có chạy mỗi 2 phút, mở kỳ theo ngày lập hóa đơn hợp đồng và gửi email có nút tới Thanh toán. Dùng Resend đã cấu hình, không cần bật Electron/Gmail OAuth. Chỉ tài khoản khách thuê active được nhận.
- Backend lấy hợp đồng/phòng từ phiên đăng nhập; đầu kỳ từ hóa đơn gần nhất của lượt thuê hiện tại hoặc bàn giao hợp đồng. Không lấy dữ liệu người thuê trước/đơn giá do browser khai.
- Gemini đọc hai lượt đối chiếu từng chữ số, loại công tơ, độ rõ. Sau đó kiểm tra chỉ số cũ, giới hạn tăng và tiêu thụ bất thường. Ảnh sai/không rõ bị từ chối; cho sửa số trên ảnh đã đạt kiểm tra, lưu nguồn manual và ảnh riêng tư làm bằng chứng.
- Cập nhật 10/10/2026: độ chính xác OCR là ưu tiên cao nhất. Không giảm độ phân giải/chất lượng ảnh, không bỏ lượt đọc Gemini thứ hai và không tắt thinking chỉ để nhanh hơn nếu chưa có benchmark ảnh đúng, ảnh mờ/lóa và ảnh sai loại cho kết quả giữ nguyên. Tối ưu hiệu năng chỉ được bật sau kiểm chứng độc lập.
- Cập nhật 10/10/2026: ảnh công tơ trong luồng thật gửi JPEG nhị phân `multipart/form-data` thay cho JSON Base64. Giới hạn JPEG 2.962.482 byte khớp chính xác giới hạn Base64 cũ; khung ảnh 2560px, JPEG 95%, hai lượt Gemini và bước khách xác nhận giữ nguyên. Pages giữ nguyên boundary/bytes khi chuyển Edge; Edge xác thực phiên trước khi đọc ảnh.
- Điện → OCR → khách xem ảnh/số và xác minh → backend ghi nhận → nước → OCR → khách xác minh → lập invoices thật của Electron. Ảnh không đạt chỉ yêu cầu chụp lại; nhập thủ công vẫn có bước xác nhận riêng. Tiến độ đã xác nhận lưu database; token ảnh gắn người/kỳ/loại, hạn 10 phút. Thoát vào lại tiếp tục được; hóa đơn có rồi thì mở lại trực tiếp.
- Snapshot gồm chỉ số cũ/mới, tiêu thụ, đơn giá, tiền phòng và dịch vụ. Kiểm tra lại hợp đồng/chỉ số trước tạo, khóa + trigger chống trùng khi Electron/web cùng lập.
- QR lấy cấu hình Electron hiện tại: BIDV / Đỗ Kim Ngân, cùng helper mã chuyển khoản. Không có nút frontend đánh dấu paid hoặc mô phỏng thanh toán cho tài khoản thật.
- SePay cloud đối chiếu tài khoản + mã + đúng số tiền còn phải thu, chống giao dịch trùng; thiếu/thừa tiền cần đối soát. Web kiểm tra mỗi 10 giây khi hiển thị, có kiểm tra ngay; paid hiển thị xác nhận, scheduler tạo thư biên lai.
- Chỉ số phòng đã trả được cập nhật không lùi khi thanh toán hóa đơn cũ. Lịch sử riêng lượt thuê hiện tại; email kiểm tra lại tài khoản/hợp đồng/địa chỉ, budget dùng chung, lease và delivery ID chống trùng.

### Kiểm chứng

- Build TypeScript/Vite và kiểm tra public bundle không chứa bí mật đạt; 25 unit/regression checks đạt.
- SQL trên project test riêng kiểm tra account scope/lượt thuê, số bất thường, ảnh đảo loại/hết hạn, nguồn manual, tiến độ, sửa hợp đồng, trùng invoice, SePay thiếu/thừa/đúng/trùng, receipt và khóa tài khoản; dữ liệu rollback.
- E2E riêng dùng Gemini thật: điện 12692, nước 287 → lưu/xác nhận → hóa đơn 4.159.400đ → sự kiện SePay giả lập → paid → queue biên lai. Schema tạm dọn xong; không chuyển tiền/gửi thư thật.
- IAB: chọn ảnh → điện → nước → hóa đơn và paid, 390×844 / 320×568; input file gây tràn ngang đã sửa. Hai nút chụp/chọn ảnh nhìn thấy ở màn thấp.
- Production API 401 khi chưa đăng nhập, CSRF 403, RPC/ảnh/kỳ không có quyền browser trực tiếp. Cron đã thực thi tenant worker với HTTP 200, provider configured, SePay không có lỗi đồng bộ.
- Deploy không thêm dữ liệu giả: 25 phòng, 30 khách, 49 hợp đồng, 203 hóa đơn, 36 khoản thu, 1 tài khoản trước/sau migration.
- Bằng chứng: `qa/tenant-payment-database.json`, `qa/tenant-payment-e2e.json`, `qa/tenant-gemini-live.json`, `qa/tenant-payment-production-deployment.json`, `qa/tenant-payment-production-verification.json`, `qa/tenant-payment-review.md`, ảnh `qa/tenant-payment-*.png`.

### Phạm vi và giới hạn

- Tự lập hóa đơn OCR cho hợp đồng thu từng tháng/phòng đang thuê, theo ngày đã thỏa thuận; không tự đổi sang ngày cuối tháng.
- Hóa đơn tháng đầu/tiền cọc giữ nghiệp vụ bàn giao Electron; nếu có hóa đơn thì web dùng đúng bản ghi. Nếu chưa có, web báo rõ; ghi số hằng tháng bắt đầu kỳ tiếp theo. Không tự tính tháng đầu thành một tháng đầy đủ.
- Chu kỳ nhiều tháng/chuyển phòng chưa quyết toán/phòng đang trả/hợp đồng hoặc số cũ thay đổi cần xử lý nghiệp vụ riêng. Giao dịch sai mã chưa thể gắn an toàn một người thuê, giữ để chủ nhà đối soát.
- OCR không đảm bảo mọi ảnh chính xác tuyệt đối; chưa xác minh serial từng phòng. Camera vật lý và việc thư vào Gmail Inbox cần thử thực tế; không gửi email kiểm thử trong lượt này.
- Cập nhật yêu cầu 09/10/2026: khôi phục màn hình xác minh số điện/nước ở cả sandbox và production. OCR đạt chỉ tạo ảnh chờ xác minh; khách đối chiếu ảnh, chỉ số cũ/mới, tiêu thụ, sửa số nếu cần và bấm xác nhận thì mới lưu. Nút “Chụp lại / Sử dụng ảnh” của iOS là màn hình camera gốc, website không thể loại bỏ khi chạy HTTP LAN; môi trường HTTPS dùng camera trong trang.
- Thành phần: migration `20261009020000_tenant_monthly_payment.sql`; API `cloud/tenant-payments.mjs`; UI `src/TenantPayment.tsx`; email `supabase/functions/_shared/tenant-payment-emails.ts`; deploy mục tiêu `scripts/deploy-tenant-payment.mjs`.

---

## Ghi chú trước khi triển khai (lịch sử; đã được cập nhật ở trên)

## Mục tiêu

Khách vào website theo thông báo hằng tháng, gửi ảnh công tơ điện rồi nước, kiểm tra hóa đơn, chuyển khoản đúng QR/nội dung và nhận trạng thái đã thanh toán từ SePay. Dữ liệu phải gắn với khách thuê và hợp đồng hiện tại.

## Đã triển khai

- Menu Thanh toán ngay dưới Trang chủ.
- Nút Mở mục thanh toán ở trang chủ dẫn tới cùng một màn hình.
- Màn hình thật thông báo chức năng đang chuẩn bị; chưa có API kỳ thanh toán thật. Không suy diễn rằng khách không có hóa đơn/nợ trong Electron từ trạng thái này.
- Không sử dụng hóa đơn hoặc số liệu demo cho tài khoản thật; guard backend giữ nguyên.

## Luồng dự kiến cho phần kết nối tiếp theo

1. Backend cloud mở kỳ theo ngày lập hóa đơn và gửi email tự động có link trực tiếp tới Thanh toán. Máy Electron không cần bật cho tác vụ này; cần kiểm tra scheduler/email hiện có trước khi nối.
2. Khách chưa gửi số: hiển thị kỳ và nút Chụp điện & nước. Chụp điện → OCR/kiểm tra → khách xác nhận → chụp nước → OCR/kiểm tra → xác nhận. Ảnh không rõ/sai loại hoặc số bất thường phải xử lý trước khi lập hóa đơn.
3. Backend tính hóa đơn bằng thông tin hợp đồng và đơn giá áp dụng cho kỳ. Chỉ số đầu kỳ phải lấy từ kỳ hợp lệ gần nhất; kỳ đầu lấy bàn giao. Không dùng mã phòng/chỉ số cũ do trình duyệt tự khai làm nguồn quyền truy cập.
4. Hóa đơn đã tạo: mở lại thấy hóa đơn và QR chờ thanh toán, không bắt chụp lại. Lưu tiến độ phần điện/nước trên backend; chống tạo trùng hóa đơn theo hợp đồng/kỳ.
5. SePay webhook xác thực, đối chiếu tài khoản nhận/nội dung/số tiền và chống xử lý trùng; tự cập nhật đã thanh toán và biên lai. Không cho frontend tự đánh dấu đã trả.
6. Lịch sử chỉ thuộc lượt thuê hiện tại; người thuê mới không xem được lượt thuê trước.

## Chưa hoàn thành

- API kỳ thanh toán thật, lưu ảnh/chỉ số thật, tính/lưu hóa đơn thật, liên kết đối soát SePay với tài khoản web và thông báo mở kỳ.
- Luồng OCR/hóa đơn/SePay đang có thuộc demo; cần chuyển sang nghiệp vụ thật có kiểm soát, không bỏ guard và nối demo vào dữ liệu thật.

## Kiểm tra mục menu

- Browser 390px: menu → Thanh toán hoạt động, không tràn ngang.
- Thiết kế dùng palette/logo hiện có; không thêm bước nhập liệu cho menu.
