# Phase 11 — Nối luồng hợp đồng → Gmail → xác nhận → cấp tài khoản (TEST)

Ngày triển khai: 07/10/2026.

## Đã nối

Electron dùng cùng trang **Lập hợp đồng** hiện tại. Sau khi lưu bản nháp, Electron gọi backend TEST để tạo token xác nhận một lần, gửi link qua Gmail OAuth trên máy dev và lưu trạng thái gửi. Người thuê mở website TEST, xem bản hợp đồng đầy đủ, đánh dấu đã đọc, xác nhận và tự đặt mật khẩu. Backend tạo/liên kết tài khoản website theo `tenant_id` sau khi xác nhận.

Website TEST: `https://ankhanghome-contract-test.pages.dev/contract-confirmation`.

Project TEST: `gsianbstkmyutnhromwc` (`TEST`), schema riêng `ankhang_contract_test`. Phòng giả lập `999` đang để `vacant`; không sửa dữ liệu production `k-map-house`.

## Bảo vệ đã áp dụng

- Token rõ chỉ nằm trong URL fragment, không gửi lên server trong lúc tải trang; database chỉ lưu SHA-256.
- Token có hạn 72 giờ, link đã xác nhận/thu hồi/hết hạn không dùng lại để cấp tài khoản.
- Gửi lại cùng bản nháp bị chặn; nếu Gmail lỗi thì lượt gửi không tự tạo link mới để tránh gửi trùng.
- RPC xác nhận khóa bản nháp, phòng và khách thuê; kiểm tra revision, email, phòng trống và hợp đồng trùng trong cùng giao dịch.
- Email TEST allowlist hiện chỉ có địa chỉ được phép; không gửi khách thật.
- Tài khoản được tạo bằng Auth admin, vai trò portal riêng, không gửi mật khẩu qua Gmail. Người thuê tự đặt mật khẩu.
- Electron TEST có profile riêng `.contract-test-profile`, output riêng `.contract-test-out`, không dùng token Gmail production, không bật update/SePay thật.
- Website TEST có banner môi trường; không dùng domain `pay.phongtroankhang.com` cho xác nhận TEST.

## Kiểm thử đã chạy

`webmobile/scripts/verify-contract-test.mjs` đã đạt 14 kiểm tra live: không gửi trùng, hash token, chặn anonymous RPC, xem hợp đồng, vô hiệu link khi revision đổi, hết hạn, xác nhận nguyên tử, xác nhận lặp idempotent, tự đặt mật khẩu, chặn dùng lại link cấp tài khoản, đăng nhập đúng khách/phòng, vai trò anon portal khóa truy cập và thu hồi phiên đang đăng nhập khi kết thúc hợp đồng. Không gửi Gmail và không tạo thanh toán SePay trong bộ test tự động.

## Cách chạy

1. Chạy `start-contract-test.bat` ở thư mục gốc.
2. Đăng nhập Electron bằng thông tin trong `webmobile/qa/private/test-login.txt`.
3. Vào Hợp đồng → phòng 999 → lập hợp đồng → lưu bản nháp.
4. Bấm **Kết nối Gmail** lần đầu trên panel Gmail; sau đó bấm **Gửi Gmail xác nhận**. Chỉ email allowlist nhận được thư.
5. Mở link trong thư trên website TEST, xem hợp đồng, xác nhận và tự đặt mật khẩu.

## Chưa bật production

**Cập nhật 07/10/2026:** Người dùng đã yêu cầu chuyển sang Electron thật. Trạng thái triển khai mới ở `phase-12-contract-production-gmail.md`; các ghi chú dưới đây mô tả thời điểm triển khai TEST trước đó.

Luồng này chưa chạm project `k-map-house`, chưa bật gửi tới khách thật và chưa nối SePay thật. Muốn đưa lên production cần tạo cấu hình endpoint/domain production riêng, chạy migration production đã duyệt, thay allowlist, bật job kiểm tra trạng thái và nghiệm thu thêm một lượt.

## Gmail cần thao tác đầu tiên

Backend và luồng website/tài khoản đã kiểm thử live. Chưa gửi Gmail trong bộ kiểm thử. Phiên Gmail TEST chưa có token; người dùng cần bấm **Kết nối Gmail** để cấp OAuth cho profile TEST, rồi mới gửi được thư thật tới email allowlist. Backend chạy khi tắt máy; thao tác gửi thư của phase này vẫn chạy từ Electron đang bật.

## Sửa lỗi mở nhầm phiên Electron (07/10/2026)

- Cấu hình TEST được đóng gói riêng. Phiên dữ liệu thật chưa có endpoint xác nhận nên sẽ hướng dẫn mở Electron TEST, có nút mở launcher trong trang lập hợp đồng.
- Cửa sổ và màn hình đăng nhập TEST có nhãn **ELECTRON TEST · Phòng 999**. Giữ app identity riêng để phân biệt với bản chính.
- Cửa sổ TEST hiển thị ngay khi tạo; launcher mở Electron ở chế độ có cửa sổ và nhận diện đúng đường dẫn Windows khi mở lại, không build lại phiên đang chạy.
- Đã kiểm tra typecheck, build TEST, mốc renderer/login hiển thị và mở launcher lần hai đưa phiên TEST hiện tại lên trước. Gmail vẫn cần OAuth từ người dùng trước khi gửi thử.

## Sửa lỗi Gmail project đã xóa (07/10/2026)

Đã xác định client Gmail chung thuộc Google project `470025984975` bị xóa. Lượt gửi của phòng 999 bị Google từ chối, chưa có message ID/sentAt, đã được chuyển sang `failed`. Đã sửa phân biệt từ chối chắc chắn với lỗi mạng chưa rõ kết quả, yêu cầu kết nối lại khi đổi client, bổ sung cấu hình Gmail riêng cho TEST và script nhập JSON OAuth. Typecheck, 8 kiểm tra Gmail và build Electron TEST đạt.

Đã tạo project Google `ankhang-home-gmail`, bật Gmail API. Người dùng đã đồng ý chính sách và tạo client Desktop; cấu hình được nhập vào file TEST riêng và Electron TEST đã khởi động lại. Test users gồm Gmail gửi thử `yendao444@gmail.com`. Chưa có phiên OAuth gửi thư bằng client mới, chưa gửi thử thành công. Hướng dẫn tiếp tục ở `gmail-test-setup.md`.

## Kết quả Gmail và thông báo gửi (07/10/2026)

- Người dùng đã hoàn tất OAuth; profile TEST lưu phiên Gmail thành công. Lượt gửi phòng 999 lúc 15:27 (UTC+7) có Gmail message ID và trạng thái `sent`, người nhận `zicky.iluv@gmail.com`. Đây là xác nhận Gmail tiếp nhận thư, chưa chứng minh thư vào Inbox hay khách đã đọc.
- Sau khi bấm gửi, trang hiển thị tiến trình; khi có kết quả sẽ mở hộp thông báo ở giữa màn hình với email người nhận. Đóng hộp thông báo vẫn giữ kết quả có màu rõ ở chân trang.
- Phân biệt gửi thành công, từ chối gửi chắc chắn, và chưa rõ kết quả. Nếu Gmail đã nhận thư nhưng ghi trạng thái lỗi, thông báo nói rõ đã tiếp nhận và yêu cầu kiểm tra hộp thư trước khi gửi lại.
- Typecheck và 16 kiểm tra Gmail/kết quả gửi đạt. Không gửi thêm thư trong bộ kiểm thử, không sửa dữ liệu thật.

## Email chuyên nghiệp — phương án 1 (07/10/2026)

Đã chọn phương án 1 trong `design-references/contract-confirmation-email-20261007/display-order.json`. Email có banner căn hộ/hợp đồng/chìa khóa, ghép logo AK gốc của Electron (không vẽ lại logo bằng AI). Phần chữ bên dưới dùng HTML: lời chào, phòng, ngày bắt đầu từ bản nháp, nút xem và xác nhận, hạn link 72 giờ và chữ ký An Khang Home. Banner đính kèm inline CID để Gmail hiển thị; thông tin động và đường dẫn vẫn được escape.

Đã kiểm tra desktop/mobile 390px và MIME thực tế; typecheck, 18 kiểm tra, build Electron TEST đạt. Nghiệm thu tại `design-references/contract-confirmation-email-20261007/design-qa.md`. Mẫu áp dụng cho các email gửi tiếp theo; email cũ đã gửi giữ nguyên. Không gửi thêm email hay thay đổi trạng thái hợp đồng hiện tại trong lần triển khai giao diện.
