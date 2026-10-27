# Kiểm tra bảo mật website quản lý — 08/10/2026

Website: https://app.phongtroankhang.com/

## Phạm vi và kết luận

Kiểm tra mã nguồn PWA, 40 file JavaScript tải từ website production, HTTP headers,
các API bằng khóa anon công khai, và metadata Auth/database/Storage đang triển khai.
Không sửa ứng dụng, không thay đổi phân quyền hoặc cấu hình production, không tạo
tài khoản, không tải lên/xóa ảnh và không ghi dữ liệu nghiệp vụ.

Phát hiện nguy cơ nghiêm trọng ở chuỗi tự đăng ký → tự tạo hồ sơ quản lý. Không nên
coi việc giao diện không có nút đăng ký là một biện pháp bảo vệ: có thể gọi Auth API
trực tiếp bằng cấu hình public đọc từ JavaScript.

Bằng chứng đã lọc thông tin riêng tư: `security-f12-live-2026-10-08.json`.

## 1. Ưu tiên cao: tự đăng ký có thể được nhận như nhân viên

**Đã xác nhận bằng cấu hình production và định nghĩa trigger; chưa thử tạo tài khoản.**

- Auth: `disable_signup=false`, `external_email_enabled=true`.
- Không có hook before-user-created được bật để kiểm soát người được đăng ký.
- Trigger `on_auth_user_created` gọi `handle_auth_user_created()` khi thêm Auth user.
- Hàm này tự thêm hồ sơ vào `public.users`, không chỉ định role/status.
- Giá trị mặc định thực tế: `role='user'`, `status='active'`.
- `assertManagementProfile()` chấp nhận user đang active; các policy đọc dữ liệu
  phòng/khách/hợp đồng/hóa đơn kiểm tra hồ sơ active.
- Guard dành cho portal chỉ loại người thuê được server gắn portal_role; không
  chặn người lạ đăng ký Auth thông thường bằng email mới không trùng hồ sơ khách.

**Tác động:** người ngoài có thể đăng ký email của họ, hoàn thành xác thực email
(production yêu cầu xác nhận email), rồi có hồ sơ được nhận như nhân viên quản lý.
Có nguy cơ đọc dữ liệu riêng tư và thực hiện các thao tác dành cho nhân viên.
Không có bằng chứng từ kiểm tra này rằng họ tự nhận được quyền admin.

**Đề xuất:** chặn public signup tại Auth server; giữ cơ chế cấp tài khoản bởi admin.
Kiểm tra ảnh hưởng tới luồng cấp tài khoản Electron và người thuê trước khi triển
khai. Không cần thay đổi quyền của các tài khoản quản lý đang có để chặn đường này.

## 2. Ưu tiên cao: kho ảnh có policy ghi dành cho public

**Đã xác nhận metadata production; chưa thử upload hoặc delete qua Storage API.**

Kho `room-images` là public, có hai policy permissive:

- `Allow public upload room-images`: INSERT, roles PUBLIC, chỉ kiểm tra bucket_id.
- `Allow public delete room-images`: DELETE, roles PUBLIC, chỉ kiểm tra bucket_id.
- Role anon có quyền INSERT/DELETE/SELECT cấp bảng trên `storage.objects`.
- Không tìm thấy policy restrictive giới hạn thêm các thao tác này.
- Giới hạn mỗi file 5 MiB, MIME `image/*`; không thay thế kiểm tra người được ghi.

**Tác động:** policy cho phép upload không yêu cầu đăng nhập, tạo nguy cơ tải ảnh
rác và tiêu tốn dung lượng. Policy DELETE cũng quá rộng; việc xóa qua API còn phụ
thuộc truy vấn SELECT và cách Storage xử lý, chưa được xác nhận thực nghiệm.
Ảnh phòng public có thể đọc khi biết URL; đây không tự chứng minh CCCD bị công khai.

**Đề xuất:** giới hạn thao tác ghi/xóa ảnh ở Storage. Đây là thay đổi policy kho
ảnh; theo yêu cầu giữ nguyên phân quyền, lần kiểm tra này chỉ báo cáo và chưa sửa.

## 3. Mức trung bình: lộ email và khả năng dò tài khoản

**Đã xác nhận bằng request anon trực tiếp trên production.**

`resolve_login_email(text)` được cấp EXECUTE cho anon, trả email của username hoặc
email đang hoạt động. Một request với tên phổ biến trả về email; một tên tổng hợp
không tồn tại trả null. Không ghi email thật vào báo cáo và không dò hàng loạt.

**Tác động:** người chưa đăng nhập có thể xác định tài khoản tồn tại và lấy email
khi đoán đúng username, hỗ trợ lừa đảo hoặc dò mật khẩu. Supabase Auth có giới hạn
tốc độ riêng; điều đó không loại bỏ thông tin lộ từ RPC này.

**Đề xuất:** đưa xử lý username vào endpoint đăng nhập trên server có giới hạn
tốc độ; không trả email ra trước khi xác thực. Luồng quên mật khẩu nên trả thông
báo chung, không tiết lộ email có thuộc hệ thống hay không.

## 4. Mức trung bình: dữ liệu công nợ lưu bền trên trình duyệt

**Đã xác nhận từ mã nguồn và nhận diện logic trong bundle production.**

`DebtReport.tsx` lưu số tiền, lý do, ghi chú và lịch sử vào localStorage với khóa
`an-khang-debt-summary` và `an-khang-debt-entries`, không phân biệt tài khoản.
Xử lý SIGNED_OUT trong `main.tsx` xóa React Query cache, nhưng không xóa hai khóa.
Nếu dữ liệu server trống, component còn có logic nhập lịch sử local lên server.

**Tác động:** sau khi đăng xuất, người có quyền sử dụng cùng trình duyệt có thể
xem dữ liệu tài chính qua F12. Không phải một đường đọc từ xa trên máy khác.
Lịch sử cũ cũng có thể được dùng lại trong phiên tiếp theo.

**Đề xuất:** loại bỏ cache công nợ bền nếu không cần, hoặc tách theo tài khoản và
xóa khi đăng xuất. Không tự nhập dữ liệu nghiệp vụ từ localStorage chưa tin cậy.

## Cấu hình đăng nhập cần tăng cường

- Server cho phép mật khẩu tối thiểu 6 ký tự, trong khi màn hình đặt lại yêu cầu 8.
  Kiểm tra ở giao diện có thể bị bỏ qua bằng API; nên thống nhất ở server.
- CAPTCHA và kiểm tra mật khẩu bị lộ đang tắt. Không kết luận Auth không có rate limit.
- Đổi mật khẩu không yêu cầu mật khẩu hiện tại hoặc reauthentication ở cấu hình Auth.
  Nếu token bị đánh cắp, hậu quả có thể gồm đổi mật khẩu, không chỉ dùng phiên đó.
- Không có inactivity timeout hoặc thời hạn tuyệt đối cho phiên ở cấu hình hiện tại.
- Token nằm trong sessionStorage, hoặc localStorage khi chọn ghi nhớ đăng nhập.
  Việc chủ phiên thấy token qua F12 là bình thường với kiến trúc hiện tại; chưa tìm
  được chuỗi XSS để người ngoài từ xa lấy token trong lần kiểm tra này.

## Các lớp bảo vệ đã kiểm tra

- 40 file JS public: không phát hiện giá trị private đã biết, JWT service_role,
  sb_secret hoặc private-key block; chỉ thấy JWT anon công khai.
- Không thấy sourceMappingURL trong các file JS đã tải.
- Các đường `.env`, `.env.local`, `.git/HEAD`, entry sourcemap và QA JSON được thử
  đều trả HTML fallback của ứng dụng, không trả nội dung file tương ứng.
- Request anon tới 10 bảng trọng yếu: không có hàng dữ liệu được trả; một số bảng
  từ chối bằng 401, các bảng còn lại trả mảng rỗng.
- Năm endpoint SePay, thị trường, hợp đồng, quản lý tài khoản khách và email đều
  trả 401 với request anon đã thử. Không thử giả mạo thanh toán hoặc gửi email thật.
- Production có CSP hạn chế script, frame-ancestors none, X-Frame-Options DENY và
  nosniff. Không thấy HSTS trong response đã kiểm tra; đây là điểm tăng cường thêm.
- Service worker cache bộ khung/tài nguyên, bỏ qua Auth, API và request ghi.
- 28 test liên quan SePay/thị trường/service worker đều pass.
- Quét build local pass; npm audit --omit=dev báo 0 lỗ hổng đã biết.
- Tự cập nhật PWA không cần tắt; cơ chế hiện tại chờ người dùng nhận bản cập nhật.

## Giới hạn diễn giải

Không có kiểm thử đăng nhập bằng tài khoản quản lý/người thuê, không tạo account
tấn công, không viết payload XSS vào dữ liệu và không thử thao tác Storage thật.
Chuỗi tự đăng ký được suy ra từ cấu hình/trigger/policy đang triển khai, không phải
một lần chiếm tài khoản đã thực hiện. Mã workspace đang có thay đổi đồng thời nên
không giả định mọi mã nguồn hiện tại đều trùng production.

Kết quả không chứng minh hệ thống đã bị xâm nhập và cũng không phải chứng nhận
an toàn toàn bộ. Các request anon bị chặn không phủ định rủi ro tự đăng ký rồi trở
thành một tài khoản được server chấp nhận.
