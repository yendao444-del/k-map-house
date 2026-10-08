# Phase 01 - Đăng nhập PWA bằng tài khoản Electron hiện tại

Ngày ghi nhận: 08/10/2026.
Ứng dụng đích: https://app.phongtroankhang.com.
Trạng thái: Đã chốt mục tiêu chức năng; ghi kế hoạch triển khai để thực hiện sau. Chưa triển khai giao diện, thay đổi dữ liệu hoặc cấu hình production.

## 1. Yêu cầu đã chốt

- Làm đăng nhập trước các màn hình nghiệp vụ khác.
- Tài khoản quản lý đang dùng trên Electron đăng nhập được vào PWA bằng tên đăng nhập hoặc email và mật khẩu hiện tại.
- Giữ nguyên định danh tài khoản, vai trò và trạng thái hoạt động.
- Không yêu cầu đăng ký lại hoặc đặt lại mật khẩu chỉ vì chuyển sang PWA.
- PWA kết nối trực tiếp backend chung; không kết nối thông qua ứng dụng Electron hay phụ thuộc máy tính đang bật.
- Đăng nhập hợp lệ mới được vào ứng dụng quản lý; thông báo rõ lỗi nhập liệu, xác thực và kết nối.
- Giữ phong cách hình ảnh của màn đăng nhập Electron hiện tại; chỉ tối ưu bố cục, kích thước, khoảng cách và thao tác để dùng tốt trên mobile.

## 2. Căn cứ từ mã nguồn hiện tại

Đã kiểm tra mã nguồn cục bộ; chưa kiểm chứng cấu hình Auth/RLS đang triển khai hoặc đăng nhập tài khoản thật trong đợt lập kế hoạch này.

| Thành phần | Hiện trạng |
| --- | --- |
| `src/renderer/src/components/LoginScreen.tsx` | Form gọi `signInUser`; có hiện/ẩn mật khẩu, ghi nhớ đăng nhập và quên mật khẩu. |
| `src/renderer/src/lib/db.ts` | `resolveLoginEmail` đổi username sang email qua RPC `resolve_login_email`; email được đưa trực tiếp vào Supabase Auth. |
| `signInUser` | Gọi `supabase.auth.signInWithPassword`, sau đó tải hồ sơ tài khoản. |
| `getCurrentSessionUser` | Đọc phiên, làm mới token gần hết hạn và đọc bảng `users` theo ID tài khoản Auth. |
| `src/renderer/src/lib/supabase.ts` | Client dùng `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`; có nhận diện link khôi phục mật khẩu. |
| Bảng hồ sơ | Vai trò trong mã nguồn là `admin` / `user`; trạng thái là `active` / `inactive`. |

Lưu ý phải xử lý khi triển khai:

- Luồng hiện tại dùng hồ sơ mặc định nếu thiếu bản ghi `users`, đồng thời mặc định trạng thái là active. PWA phải từ chối quyền quản lý khi hồ sơ thiếu, trạng thái không hợp lệ hoặc vai trò không được hỗ trợ; không sao chép nguyên hành vi fallback này.
- Checkbox `rememberMe` hiện chưa được truyền vào `signInUser` trong form đã kiểm tra. Không coi đây là chức năng ghi nhớ đã hoàn thiện để bê nguyên sang PWA.
- Có cả IPC auth trong Electron main, nhưng form đang dùng Supabase từ renderer. Không tạo cầu nối trình duyệt tới IPC hoặc máy Windows cho đăng nhập PWA.
- Trạng thái hồ sơ và phân quyền phải được backend thực thi; ẩn nút hoặc chặn route trên frontend chưa đủ.

## 3. Cách triển khai

### Bước 1 - Xác nhận nguồn tài khoản và quyền

1. Xác định đúng Supabase project đang phục vụ tài khoản quản lý Electron; không nhầm môi trường demo hoặc schema thử hợp đồng.
2. Kiểm tra ánh xạ `auth.users.id` với `public.users.id`, email hệ thống, username, role và status bằng truy vấn chỉ đọc có giới hạn.
3. Kiểm tra RPC `resolve_login_email` và quyền gọi trước đăng nhập trong môi trường đích.
4. Kiểm tra RLS/API đối với người chưa đăng nhập, quản lý active, tài khoản inactive và tài khoản chỉ có quyền khách thuê.
5. Nếu có tài khoản cũ thiếu hồ sơ hoặc lệch ID, lập danh sách cần xử lý riêng. Không tự tạo tài khoản thay thế, đổi mật khẩu hoặc gán quyền admin để làm cho đăng nhập thành công.

Kết quả: xác định rõ nơi lưu tài khoản và những tài khoản tương thích; không sao chép kho mật khẩu sang database mới.

### Bước 2 - Tách lớp xác thực dùng trên web

1. Tạo module auth độc lập với Electron, gồm client Supabase, chuyển username sang email, đăng nhập, kiểm tra hồ sơ, khôi phục phiên và đăng xuất.
2. Tái sử dụng quy tắc hiện có; tránh kéo toàn bộ `db.ts` cùng các phụ thuộc Gmail/IPC vào trang đăng nhập.
3. Giữ cùng Supabase project và định danh người dùng. Không sửa luồng Electron trong phase này trừ khi phát hiện thay đổi dùng chung thật sự cần thiết và đã đánh giá hồi quy.
4. Frontend chỉ chứa cấu hình công khai cần thiết. Service-role key và khóa quản trị không được đưa vào bundle.
5. Không lưu mật khẩu, ghi log token hoặc coi thông tin role từ bộ nhớ trình duyệt là nguồn cấp quyền.

### Bước 3 - Luồng đăng nhập

1. Người dùng nhập tên đăng nhập hoặc email và mật khẩu.
2. Chuẩn hóa khoảng trắng của tên đăng nhập/email; giữ nguyên mật khẩu.
3. Nếu là username, gọi RPC để lấy email hệ thống tương ứng; không thay bằng email nhận thông báo.
4. Xác thực mật khẩu bằng Supabase Auth.
5. Tải hồ sơ quản lý theo ID vừa xác thực và kiểm tra trạng thái active cùng vai trò được hỗ trợ.
6. Nếu không có quyền quản lý, kết thúc phiên PWA vừa tạo và báo không được phép truy cập; tài khoản khách thuê không tự được chuyển thành tài khoản quản lý.
7. Khi hợp lệ, chuyển vào vùng ứng dụng được bảo vệ. Màn hình đến sau đăng nhập sẽ được chốt trong hạng mục điều hướng.

Không tải dữ liệu phòng, khách thuê, giấy tờ hoặc tài chính trước khi hoàn thành kiểm tra quyền.

### Bước 4 - Phiên đăng nhập và mở lại ứng dụng

- Khi mở PWA: hiển thị trạng thái đang kiểm tra phiên, kiểm tra/làm mới token qua cơ chế của Supabase rồi tải hồ sơ hợp lệ.
- Theo dõi thay đổi phiên đăng nhập; kiểm tra lại khi ứng dụng trở về foreground sau khi điện thoại ngủ hoặc chuyển ứng dụng.
- Token bị thu hồi hoặc không còn hợp lệ: về màn đăng nhập. Lỗi mạng tạm thời: cho thử lại, không tự coi là sai mật khẩu và không xóa phiên chỉ vì mất mạng.
- Các API nghiệp vụ phải kiểm tra quyền hiện tại để tài khoản đã bị khóa không tiếp tục thao tác chỉ vì token chưa hết hạn.
- Đăng xuất phải xóa trạng thái người dùng và cache dữ liệu riêng của tài khoản trên thiết bị; nút Back không mở lại dữ liệu cũ.
- Đề xuất đăng xuất riêng phiên PWA bằng local scope để không bất ngờ đăng xuất Electron; chính sách đăng xuất tất cả thiết bị cần chốt riêng.
- Electron, trình duyệt và PWA dùng cùng tài khoản nhưng không mặc định dùng chung phiên đăng nhập. Không hứa đăng nhập một nơi sẽ tự đăng nhập ở các nơi còn lại.
- Chính sách ghi nhớ, thời gian phiên và storage sẽ được chốt trước khi triển khai; không lưu mật khẩu để thực hiện ghi nhớ.

### Bước 5 - Giao diện mobile

Phạm vi chức năng của form: username/email, mật khẩu, hiện/ẩn mật khẩu, đăng nhập, trạng thái đang xử lý và lỗi. Trình duyệt hỗ trợ autofill thông qua `autocomplete` đúng loại.

- Hướng hình ảnh đã chốt: lấy màn đăng nhập Electron hiện tại làm nguồn tham chiếu chính; giữ nhận diện, màu sắc, logo, hình ảnh chủ đạo và thứ bậc nội dung khi không gây lỗi trên màn hình nhỏ.
- Thiết kế cho màn hình nhỏ, bàn phím điện thoại không che nút hoặc nội dung lỗi; kiểm tra chiều rộng 320–430 px và cỡ chữ lớn.
- Ngăn gửi lặp khi đang đăng nhập, xử lý timeout để kết quả trả về muộn không tự mở ứng dụng sau khi lần đăng nhập đã bị hủy.
- Phân biệt lỗi mất mạng với lỗi thông tin đăng nhập. Thông báo xác thực tránh lộ không cần thiết tài khoản nào tồn tại.
- Phiên bản hiển thị, nếu có, lấy từ build PWA; không gọi Electron updater hoặc dùng phiên bản desktop hardcode.
- Phong cách giao diện chưa chốt: giữ phong cách Electron hay làm mới sẽ bàn riêng. Tạo demo và chọn hướng theo quy trình thiết kế của workspace trước khi sửa UI.

### Bước 6 - Quên mật khẩu và cấu hình tên miền

Đây là phần liên quan đã có trên Electron; đề xuất giữ tương đương trên PWA, cần chốt trải nghiệm cụ thể.

- Dùng cơ chế khôi phục của cùng Supabase Auth, không tạo hệ thống mật khẩu thứ hai.
- Kiểm tra email hệ thống nào nhận được thư; không mặc định email đăng nhập kỹ thuật là email liên hệ hoặc email nhận thông báo.
- Nếu bật khôi phục, cấu hình chính xác URL callback HTTPS của `app.phongtroankhang.com` trong Auth, giữ nguyên các URL hiện đang phục vụ Electron và cổng người thuê.
- Link hợp lệ mở màn đặt mật khẩu mới; link hết hạn/đã dùng có thông báo và hướng gửi lại. Không cho phiên recovery vào nghiệp vụ trước khi hoàn tất.
- Mật khẩu mới thuộc cùng tài khoản Auth nên áp dụng cho lần đăng nhập tiếp theo ở Electron và PWA. Kiểm tra riêng chính sách thu hồi các phiên cũ, không tự hứa mọi thiết bị bị đăng xuất ngay lập tức.
- Kiểm tra deep link trên Safari, Chrome và PWA đã cài; không yêu cầu bật Electron để hoàn tất.

### Bước 7 - Thử nghiệm rồi mới đưa lên tên miền chính thức

1. Xây dựng và kiểm tra trên môi trường preview, dùng tài khoản thử có vai trò tương ứng.
2. Dùng tài khoản cũ do chủ hệ thống chọn để nghiệm thu khả năng tương thích; không lấy mật khẩu từ file hoặc yêu cầu dán mật khẩu vào chat.
3. Xác minh đăng nhập/đăng xuất Electron vẫn hoạt động và không phát sinh tài khoản trùng.
4. Kiểm tra build không chứa khóa quản trị, service worker không cache phản hồi Auth hoặc dữ liệu riêng chưa được phê duyệt lưu offline.
5. Ghi bằng chứng nghiệm thu và phiên bản triển khai. Khi đến bước phát hành, cấu hình HTTPS, route callback và fallback cho URL nội bộ; không thay route của pay hoặc trang chủ ngoài phạm vi.
6. Có thể quay về bản frontend trước; thay đổi backend nếu cần phải tương thích Electron và có migration riêng, không rollback bằng cách xóa tài khoản.

## 4. Tiêu chí nghiệm thu

- [ ] Tài khoản quản lý cũ active đăng nhập bằng username và email với mật khẩu hiện tại; ID và quyền không đổi.
- [ ] Sai mật khẩu, thiếu trường, tài khoản inactive, thiếu hồ sơ và tài khoản chỉ có quyền khách thuê không mở được vùng quản lý.
- [ ] API nghiệp vụ cũng từ chối truy cập trái quyền, kể cả gọi trực tiếp hoặc dùng token của tài khoản đã bị khóa.
- [ ] F5, mở URL nội bộ trực tiếp, đóng/mở lại PWA và chuyển ứng dụng hoạt động đúng chính sách phiên đã chốt.
- [ ] Mạng chậm, mất mạng, timeout và nhấn đăng nhập liên tục không gây màn hình treo hoặc nhận nhầm kết quả cũ.
- [ ] Đăng xuất xóa dữ liệu hiển thị/cache của tài khoản trước; đăng nhập người khác không thấy dữ liệu còn sót.
- [ ] Nếu có ghi nhớ/quên mật khẩu, kiểm tra end-to-end đúng hành vi đã chốt, bao gồm link lỗi và thiết bị mobile thật.
- [ ] Electron vẫn đăng nhập được, kể cả khi PWA đã đóng; PWA vẫn đăng nhập được khi máy tính tắt.
- [ ] Form dùng tốt trên Android Chrome, iPhone Safari và chế độ đã cài PWA; kiểm tra autofill và bàn phím.
- [ ] Không có khóa quản trị/mật khẩu/token trong bundle công khai, log hoặc báo cáo nghiệm thu.

## 5. Các điểm còn bàn, chưa coi là đã chốt

1. Ghi nhớ mặc định hay tùy chọn; thời gian phiên và cách đăng xuất nhiều thiết bị.
2. Luồng quên mật khẩu, địa chỉ email nhận khôi phục và các trường hợp email kỹ thuật.
3. Màn hình đầu tiên sau đăng nhập và các quyền nghiệp vụ chi tiết, thuộc hạng mục tiếp theo.

## 6. Sản phẩm bàn giao khi thực hiện phase

- Demo giao diện đăng nhập đã chọn và trang đăng nhập responsive đã triển khai.
- Module xác thực dùng chung backend với Electron, không phụ thuộc IPC.
- Danh sách cấu hình môi trường/callback không chứa bí mật và migration nếu thật sự cần.
- Báo cáo các tiêu chí nghiệm thu, các điểm chưa đạt và so sánh giao diện với demo đã duyệt.

Ghi chú: File này là đặc tả để triển khai sau. Các ô nghiệm thu chưa được đánh dấu; chưa khẳng định cấu hình production hoặc chức năng PWA đã chạy.
