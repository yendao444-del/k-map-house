# Phase 13 — Sửa và hủy hợp đồng đã xác nhận

## Đã chốt và triển khai ngày 07/10/2026

- Danh sách hợp đồng có menu **⋯** luôn hiển thị: Xem / in, Lịch sử, Sửa hợp đồng, Hủy do lập nhầm. Hợp đồng đã hủy có thêm **Thông báo hủy / gửi lại** để xem kết quả Gmail; không hủy lần nữa.
- Sửa: nhập lý do → mở trang sửa hợp đồng → chỉnh nội dung → lưu bản sửa → gửi Gmail → khách xem cũ → mới và xác nhận. Bản hiện tại vẫn có hiệu lực trong thời gian chờ. Gửi email là thao tác của admin trên Electron; không tự gửi thêm email trong triển khai.
- Các nội dung sửa: giá thuê, cọc thỏa thuận, ngày bắt đầu, thời hạn, ngày chốt, số người ở, điều khoản bổ sung. Giữ khách/phòng, thông tin danh tính, tài sản, đơn giá dịch vụ và chỉ số bàn giao. Đã có hóa đơn thì chặn đổi ngày bắt đầu. Có nghiệp vụ chuyển phòng thì xử lý chuyển phòng trước.
- Khi xác nhận: kiểm tra lại bản nháp/phiên bản, hợp đồng gốc, email, admin và trạng thái. Cập nhật hợp đồng cùng phòng trong một giao dịch; giữ nguyên mã hợp đồng, chỉ số hiện tại, hóa đơn, giao dịch và tài khoản/mật khẩu. Chống xác nhận lặp, bản cũ hoặc nguồn đã thay đổi.
- Hủy: xem ảnh hưởng + kiểm tra backend → nhập lý do 5–1000 ký tự → đánh dấu đã kiểm tra → xác nhận. Lưu trạng thái Đã hủy, giờ, admin và lý do; không xóa hồ sơ hoặc bản đã xác nhận. Thu hồi link của hợp đồng và bản sửa đang chờ; phòng về trống nếu không có hợp đồng hiệu lực khác; khóa tài khoản/phiên khi không còn hợp đồng hiệu lực.
- **Chính sách hủy do lập nhầm đã chốt:** chỉ admin yêu cầu và khách **không cần xác nhận**. Backend chỉ cho hủy trong 24 giờ kể từ `original_confirmed_at` của lần khách xác nhận đầu tiên; sửa/gửi lại bản hợp đồng không tính lại mốc này. Hợp đồng cũ không có mốc xác nhận đầu tiên không được dùng đường tắt này.
- Hộp hủy bắt buộc chọn lý do có thể đối chiếu: **chọn nhầm phòng**, **chọn nhầm khách**, hoặc **lập trùng hợp đồng**; phải chọn phòng/khách/hợp đồng đúng tương ứng. Sai giá, cọc, ngày hoặc điều khoản dùng Sửa hợp đồng.
- Backend chặn thêm nếu có hóa đơn/công nợ/tiền cọc/thanh toán, phiếu bàn giao, tài sản bàn giao, thay đổi chỉ số hoặc sử dụng điện nước, chuyển phòng, hay bất kỳ bằng chứng nghiệp vụ đã ghi nhận. Dấu vết sử dụng được lưu riêng nên đổi trạng thái hoặc xóa dòng nguồn không làm điều kiện hủy quay lại.
- Sau khi commit hủy, hệ thống tạo outbox thông báo Gmail tới đúng email nhận hợp đồng gốc. `pending → sending → sent/failed/uncertain` có claim chống gửi trùng; Gmail lỗi không hoàn tác hủy. Trạng thái `failed` được gửi lại; `uncertain` yêu cầu kiểm tra Gmail đã gửi trước khi thử lại. Email thông báo nói rõ hợp đồng đã hủy và khách không cần xác nhận.
- Có hóa đơn còn mở, tiền đã ghi nhận kể cả hóa đơn đã hủy, phiếu vào phòng còn hiệu lực/có ngày thanh toán, giao dịch tiền, cọc đã thu từ app cũ, nợ di cư hoặc chuyển phòng: chặn hủy do lập nhầm và dùng Trả phòng / chấm dứt hợp đồng. Không tự hủy hóa đơn hoặc xóa giao dịch ngân hàng. Kiểm tra tài chính dùng phòng + khách; giao dịch tiền không có khách dùng phòng + ngày vào, nên có thể chặn bảo thủ khi dữ liệu cũ thiếu liên kết hợp đồng.
- Hủy rồi lập lại cùng khách: chỉ tái sử dụng tài khoản bị khóa bởi chính lần hủy này sau khi khách xác nhận hợp đồng mới cùng email. Dùng phiên bản tài khoản để phân biệt khóa do hủy với khóa chủ động của admin. Nếu admin khóa/revoke sau đó hoặc đã khóa trước khi hủy, không tự mở khóa. Link và phiên cũ không được phục hồi.
- Lịch sử hợp đồng tổng hợp các lượt gửi/mở/xem/xác nhận cùng mốc tạo bản sửa, áp dụng, hủy; lưu lý do, người thực hiện, nội dung trước/sau. Mở lại bản sửa không tạo thêm bản nháp. Hủy/sửa bản nháp thu hồi link cũ.

## Backend và bảo vệ dữ liệu

- Migration `20261007190000_contract_revisions_and_cancellation.sql` và `20261007200000_contract_cancellation_policy.sql`; RPC/table nội bộ chỉ service role. Mọi thao tác admin đi qua Edge có JWT và role admin thật; public Pages gateway chỉ cho xem/ghi nhận hiển thị/xác nhận/cấp tài khoản. Hàm hủy cũ tùy ý đã bị thu hồi; hợp đồng đã hủy không thể khôi phục bằng PATCH trực tiếp.
- Chặn ghi đè trực tiếp các điều khoản hợp đồng đã xác nhận; chức năng đổi giá/cọc ở chi tiết phòng kiểm tra hợp đồng trước khi ghi phòng để không ghi dở dang.
- Advisory lock tuần tự hóa xác nhận/hủy; hủy khóa các bảng tài chính trong giao dịch ngắn để không bỏ sót hóa đơn mới hoặc thanh toán đang ghi. Xác nhận sửa không tự sửa tiền đã thu hay hóa đơn có sẵn.
- TEST và production đã deploy. Website `https://pay.phongtroankhang.com` đã cập nhật; Electron đã build. Số bản ghi production trước/sau triển khai: 25 phòng, 30 khách, 49 hợp đồng, 2 bản nháp. Không tạo, sửa hoặc hủy hợp đồng thật trong kiểm tra; không gửi Gmail hoặc thanh toán thay người dùng.

## Kiểm tra và bằng chứng

- 18 live TEST checks cho sửa/hủy: quyền + lý do, một bản sửa, giữ danh tính/chỉ số, bản gốc không đổi khi lưu, chặn ghi đè, cũ/mới, nguyên tử/idempotent, lịch sử riêng, giữ tài khoản/mật khẩu, chặn tài chính, thu hồi phiên, xác nhận/hủy đồng thời, lập lại cùng khách, giữ khóa chủ động, hợp đồng cũ và tài sản.
- 21 live TEST checks luồng hợp đồng ban đầu/lịch sử tiếp tục đạt sau khi thêm thu hồi link khi sửa bản nháp. 9 unit tests backend và 21 kiểm tra email/MIME/feedback đạt. Typecheck/build Electron và web/public secret scan đạt.
- UI dùng component Electron thực với dữ liệu minh họa + adapter QA không ghi dữ liệu: menu luôn hiện, mở dialog hủy, yêu cầu lý do/checkbox, nút bị khóa khi có hóa đơn, trang sửa giữ nguyên khách và có cũ → mới. Không gửi email hoặc bấm xác nhận/hủy dữ liệu thật qua UI.
- 18 kiểm tra live policy trên TEST: mốc 24 giờ bất biến, hồ sơ đối chiếu, hợp đồng cũ, tài chính đã đổi trạng thái, bàn giao/chỉ số, nợ/chuyển phòng, cạnh tranh hóa đơn-hủy, outbox claim chống trùng, lỗi Gmail, tenant không cần xác nhận, hợp đồng trùng và tái sử dụng tài khoản an toàn. Production policy fingerprint khớp TEST; counts production vẫn 25 phòng, 30 khách, 49 hợp đồng, 2 bản nháp, 0 thông báo tồn.
- Bằng chứng: `qa/contract-lifecycle-test-results.json`, `qa/contract-lifecycle-test-deployment.json`, `qa/contract-lifecycle-production-deployment.json`, `qa/contract-production-verification.json`; ảnh `qa/contract-lifecycle-menu.png`, `qa/contract-lifecycle-cancel.png`, `qa/contract-lifecycle-edit.png`.

## Giới hạn

- Không thay khách hoặc phòng bằng bản sửa. Chọn nhầm khách/phòng thì hủy có lý do rồi lập lại.
- Với hợp đồng cũ chưa có snapshot xác nhận online, lấy thông tin hợp đồng hiện tại và danh sách tài sản/biểu phí hiện tại để khách xác nhận bản mới; không tạo giả lịch sử xác nhận hoặc bản scan trước đây.
- Xác nhận email là ghi nhận đồng ý trong ứng dụng; không bổ sung chữ ký số/chứng thực pháp lý trong phase này. Gmail Testing và các phần thanh toán website còn demo giữ phạm vi như Phase 12.
- Backend kiểm tra dữ liệu bàn giao/nghiệp vụ **được ghi trong hệ thống**, không tự suy đoán khách thực tế đã nhận phòng khi chưa có bản ghi. Ngoại lệ hủy test chỉ dành cho đúng mã hợp đồng được backend đánh dấu; tên phòng 999 không tự cấp ngoại lệ.
- Gmail dùng kết nối Electron hiện tại. Khi mở Danh sách hợp đồng, Electron gửi tiếp outbox `pending`; `failed` có nút gửi lại. Nếu tắt Electron trước khi gửi, thông báo được giữ ở backend và xử lý khi mở lại màn hình hợp đồng. Phase này không chuyển Gmail OAuth lên cloud.
- Nếu kết quả gửi `sending/uncertain`, không tự claim/gửi lại để tránh gửi trùng. Admin kiểm tra thư đã gửi; chưa có công cụ tự đối soát Gmail trong phase này.
- Bằng chứng policy hiện tại: `qa/contract-cancellation-policy-test-results.json`, `qa/contract-cancellation-policy-production-deployment.json`, `qa/contract-cancellation-policy-production-verification.json`. Script `verify-contract-cancellation-production.mjs` đối chiếu source của 7 function với TEST đã kiểm thử và xác minh RLS/gateway. Không gửi email thật hoặc hủy hợp đồng production để chạy test.

## 08/10/2026 — Hủy hợp đồng thử nghiệm

- Chủ nhà xác định hợp đồng `contract_66753eca-d4f6-4e5d-8ab0-913dc588570e` của phòng 999 là test. Đánh dấu đúng mã hợp đồng + phòng + khách trong bảng private `contract_test_designations`; không tự đánh dấu hợp đồng mới cùng phòng.
- UI mặc định chọn **Hợp đồng thử nghiệm**, có sẵn lý do kết thúc test, không bắt chọn hồ sơ đối chiếu giả. Admin kiểm tra/đánh dấu checkbox rồi bấm Hủy và gửi thông báo.
- Hợp đồng test đã đăng ký có thể hủy sau 24 giờ. Các kiểm tra tài chính, hóa đơn, bàn giao, quyền admin, thu hồi link/tài khoản và lưu lịch sử vẫn áp dụng. Không xóa bản ghi hợp đồng.
- Regular admin/tenant không được tự đánh dấu hợp đồng thật thành test từ frontend hoặc REST. Server kiểm tra designation, không tin cờ do client gửi.
- Migration `20261008210000_contract_test_cancellation.sql`; 19 live policy checks trên project TEST đã qua. Bản thật được kiểm tra source khớp TEST và dữ liệu vẫn 25 phòng / 30 khách / 49 hợp đồng / 2 nháp. Agent không thực hiện hủy hoặc gửi email thật để thử.

## 08/10/2026 — Email bắt buộc khi chọn khách lập hợp đồng

- Trong trang Lập hợp đồng, ẩn hoàn toàn khách thiếu email hoặc email sai định dạng khỏi danh sách chọn và kết quả tìm kiếm. Chỉ hiện khách có email hợp lệ.
- Chỉ khách có email hợp lệ mới được chọn. Có hướng dẫn và nút mở danh sách khách thuê để cập nhật hồ sơ.
- Bản nháp cũ đã chọn khách thiếu email không được lưu/gửi cho đến khi bổ sung. Kiểm tra email tại validation và hàm lưu bản nháp; nút Lưu / Gửi cũng bị khóa.
- Quy tắc áp dụng theo email trong hồ sơ, không tạo ngoại lệ riêng cho tên khách test Đỗ Kim Ngân. Không sửa email hoặc dữ liệu hợp đồng hiện có khi triển khai.

## 08/10/2026 — Cảnh báo trước khi gửi hợp đồng

- Hai chỉ số điện/nước bàn giao có dấu bắt buộc, cảnh báo tại từng ô khi trống hoặc sai định dạng; số 0 hợp lệ, không tự thay ô trống bằng 0.
- Hiển thị lý do chưa thể gửi ở chân trang và khóa nút Gửi Gmail xác nhận ngay khi nội dung chưa đủ/hợp lệ. Sau khi bổ sung, phải lưu lại bản nháp trước khi gửi.
- Kiểm tra nội dung biểu mẫu, lý do sửa/điều chỉnh và chỉ số trong bản nháp đã lưu trước khi gọi API tạo link. Bản nháp vẫn được lưu khi chỉ số còn trống để admin hoàn thiện sau; không coi thiếu dữ liệu là lỗi gửi Gmail.
- Giữ kiểm tra backend để xử lý dữ liệu thay đổi đồng thời. Typecheck/build Electron đạt; kiểm tra chỉ số trống, âm, thập phân bị chặn trước API và chỉ số 0 được chấp nhận. Không gửi email hoặc ghi dữ liệu thật khi kiểm tra.

## 08/10/2026 — Tách email hệ thống, tìm hợp đồng và trạng thái tài khoản

- Email khách thuê không được trùng email đăng nhập tài khoản hệ thống, kể cả tài khoản hệ thống đang khóa; so sánh không phân biệt hoa/thường và khoảng trắng. RPC cho nhân viên chỉ trả kết quả kiểm tra, không công khai danh sách email hệ thống. Tài khoản portal dùng metadata Auth riêng được phân biệt với tài khoản Electron.
- Cảnh báo khi thêm/sửa hồ sơ, khóa Lưu / Lưu và gửi / Cấp tài khoản khi đang kiểm tra hoặc email bị chặn. Kiểm tra lại trước thao tác; trigger backend bảo vệ hồ sơ, bản nháp, gửi/xác nhận hợp đồng và claim/cấp tài khoản, gồm cả hồ sơ/link đã lập trước chính sách. Không đổi mật khẩu hay chuyển tài khoản hệ thống thành tài khoản người thuê.
- Danh sách hợp đồng mặc định **Tất cả**, có tìm theo phòng / tên khách / số điện thoại / mã hợp đồng; bản nháp cùng dùng bộ tìm kiếm. Hiển thị số điện thoại, trạng thái **Chưa hoàn tất tài khoản**, lý do email trùng hệ thống hoặc hồ sơ đã đổi email sau xác nhận; nút Làm mới và tự đồng bộ khi mở/15 giây.
- Đã xác nhận hợp đồng và hoàn tất tài khoản website là hai trạng thái riêng; lỗi cấp tài khoản không làm hợp đồng biến mất. Bảng hợp đồng, bản nháp và tài khoản portal được publish realtime theo quyền RLS, không publish bảng token/link xác nhận. Phòng đã có hợp đồng nhưng chưa bàn giao hiển thị **Chờ bàn giao**.
- Trường hợp nhập sai email: sửa email đúng trong hồ sơ → Hủy do lập nhầm, lý do **Nhập nhầm email nhận hợp đồng** → lập và gửi lại. Backend đối chiếu email hồ sơ đã khác email nhận hợp đồng gốc, đúng khách và không trùng hệ thống; vẫn yêu cầu admin, trong 24 giờ, không có tài chính/bàn giao. Giữ hợp đồng cũ và lịch sử, thu hồi link, thông báo tới người nhận cũ sau khi admin hủy. Có nghiệp vụ phát sinh hoặc quá hạn thì không dùng đường hủy này.
- Phòng 999 hiện có hợp đồng `contract_5f951395-b5a5-4f2c-9fd2-766b0aa388de` đã xác nhận bằng email hệ thống; email hồ sơ đã được chủ nhà đổi. Kiểm tra backend hiện đủ điều kiện hủy do lập nhầm. Agent không hủy, không gửi email và không tự đổi hồ sơ này.
- Migration `20261008220000_tenant_system_email_separation.sql`, `20261008223000_contract_account_visibility.sql`, `20261008224000_contract_wrong_email_cancellation.sql` đã deploy TEST và production. 11 live checks tách email + 8 live checks trạng thái/khôi phục luồng đều đạt, fixture rollback. Typecheck/build Electron đạt; policy production khớp TEST. Dữ liệu production giữ nguyên 25 phòng / 30 khách / 50 hợp đồng / 3 bản nháp.
- Bằng chứng: `qa/tenant-email-separation-test.json`, `qa/contract-account-visibility-test.json`, `qa/tenant-email-separation-production-verification.json`, `qa/tenant-email-separation-production-deployment.json`.

## 08/10/2026 — Sửa lỗi cấp tài khoản sau khi khách xác nhận hợp đồng

- Nguyên nhân: Supabase Auth ghi dòng `auth.users` trước khi áp dụng `app_metadata`. Trigger tách email nhìn thấy dòng mới như tài khoản hệ thống và chặn email khách thuê, nên giao diện báo nhầm là email đã có tài khoản.
- Cách sửa: backend tạo reservation server-only đã kiểm tra admin + khách + email + hợp đồng, rồi trigger Auth gắn nhãn portal ngay trong lượt INSERT. Reservation tự hết hạn sau 60 giây, không có quyền đọc từ trình duyệt; retry dùng đúng `account_user_id` và không tạo tài khoản thứ hai.
- Lỗi phản hồi được tách: email trùng Auth thật, mật khẩu yếu, lỗi hệ thống; không còn gom mọi lỗi thành “email đã có tài khoản”. Không ghi password/token vào log.
- Migration `20261008233000_tenant_auth_provisioning.sql`; kiểm thử live TEST 10 checks trong `qa/tenant-auth-provisioning-test.json`, không gửi email và đã xóa fixture. Unit tests confirmation/account đạt 20/20.
- Đã triển khai production qua `deploy-tenant-email-separation.mjs`; số dòng nghiệp vụ không đổi. Link hiện tại của `yendao444@gmail.com` vẫn ở trạng thái `confirmed`, chưa cấp tài khoản, có thể thử lại sau khi lease cũ hết hạn.

## 08/10/2026 — Hủy hợp đồng kiểm thử không gửi thông báo

- Hợp đồng đã được backend đánh dấu kiểm thử hiển thị lý do cố định **Đang kiểm thử hệ thống**.
- Không yêu cầu chọn hồ sơ đối chiếu hoặc nhập ghi chú bổ sung; backend vẫn kiểm tra designation, thời hạn, tài chính, bàn giao và lịch sử sử dụng.
- Sau khi hủy test, Electron không gọi Gmail và không hiển thị nút gửi lại thông báo. Các lý do hủy hợp đồng thật vẫn giữ nguyên luồng xác nhận và gửi email.
