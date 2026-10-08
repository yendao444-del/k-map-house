# Phase 10 — Cấp tài khoản tự động và môi trường kiểm thử biệt lập

Ngày ghi nhận: 07/10/2026.

## Mục tiêu đã chốt

Phòng 999 là phòng mẫu để chủ nhà đóng vai khách thuê và chạy thử trọn luồng:

**Thêm khách thuê → lập hợp đồng → khách xác nhận → cấp tài khoản website → đăng nhập → nhập/chụp điện nước → tạo hóa đơn → thanh toán → trả phòng.**

Các bước thử nghiệm không được làm thay đổi khách thuê, hợp đồng, hóa đơn, số điện nước, email hoặc thanh toán thật đang có trong Electron.

## Luồng cấp tài khoản tự động

1. Admin tạo hoặc chọn hồ sơ khách thuê trong Electron; email là trường bắt buộc và phải được xác minh hợp lệ.
2. Admin lập hợp đồng từ hồ sơ đó. Lưu bản nháp không tạo tài khoản và chưa kích hoạt quyền truy cập phòng.
3. Khách nhận link Gmail, mở trang xác nhận, xem toàn bộ hợp đồng và xác nhận.
4. Backend kích hoạt hợp đồng bằng thao tác nguyên tử. Sau khi kích hoạt thành công, backend tạo hoặc liên kết tài khoản portal theo `tenant_id`; không tạo tài khoản khi hợp đồng còn nháp, hết hạn hoặc bị hủy.
5. Backend gửi email kích hoạt chứa link một lần, có hạn dùng. Khách tự đặt mật khẩu trên website; không gửi mật khẩu dạng rõ trong email.
6. Tài khoản chuyển từ `pending` sang `active` sau khi đặt mật khẩu thành công. Hệ thống chống gửi trùng và chống tạo trùng nếu khách bấm lại link hoặc webhook chạy lại.
7. Khi đổi phòng, tài khoản được giữ lại và quyền truy cập lấy theo hợp đồng active hiện tại; không sao chép lịch sử của người thuê cũ.
8. Khi trả phòng hoặc hợp đồng kết thúc, quyền phòng bị thu hồi, phiên đăng nhập bị vô hiệu hóa và tài khoản chuyển sang trạng thái phù hợp chính sách lưu trữ. Việc xóa tài khoản vật lý chỉ làm theo chính sách dữ liệu đã chốt.

## Trách nhiệm của admin

Sau khi tự động hóa hoàn chỉnh, admin chỉ cần hoàn tất hồ sơ, lập/kiểm tra hợp đồng và gửi link xác nhận. Không phải tự sinh, đọc hoặc gửi mật khẩu cho từng khách. Màn hình **Cài đặt → Tài khoản → Tài khoản khách thuê** vẫn là nơi theo dõi trạng thái, cấp lại link, khóa tài khoản và thu hồi phiên khi cần.

## Môi trường test riêng cho phòng 999

Không dùng phòng 999 trong database production làm sandbox. Một cờ `is_test` trong cùng các bảng production không đủ cách ly vì báo cáo, trigger, email, Auth, Storage và webhook thanh toán vẫn có thể chạm dữ liệu thật.

Phương án an toàn được ghi nhận:

- Tạo **Supabase project test riêng** (Database, Auth, Storage, Edge Functions và keys riêng).
- Chạy **Electron test instance/profile riêng**, với `userData` và cấu hình Gmail test riêng; không dùng session OAuth và cấu hình gửi thư production.
- Deploy **website test/Pages URL riêng**, có nhãn rõ `MÔI TRƯỜNG TEST`; không trỏ nhầm về endpoint production.
- Seed dữ liệu tổng hợp cho phòng 999, khách test, hợp đồng test và giá test. Không copy hồ sơ/CCCD, lịch sử điện nước hoặc token thật.
- Email chỉ gửi tới địa chỉ test đã được chủ nhà cho phép. Có thể dùng Gmail test hoặc mail sink; tuyệt đối không gửi nhầm khách thật.
- SePay dùng mock webhook/sự kiện test và mã QR test trước; chưa dùng token, tài khoản nhận tiền hoặc webhook production.
- OCR dùng cấu hình test riêng (cùng nhà cung cấp nếu cần), giới hạn quota và không lưu ảnh test vào storage thật.
- Backend từ chối khởi động khi các biến môi trường trộn lẫn giữa test và production; mỗi bản ghi test có định danh môi trường để truy vết.

Phòng 999 trong Electron production hiện tại được xem là dữ liệu thật của hệ thống đang chạy. Không xóa, chuyển trạng thái, tạo hợp đồng, gửi Gmail hoặc tạo thanh toán trên bản production chỉ để kiểm thử. Khi cần chạy E2E, dùng bản sao mã nguồn với cấu hình test và dữ liệu seed riêng.

## Trạng thái triển khai

- Đã có màn hình và backend quản trị tài khoản khách thuê; tài khoản thật hiện chưa được cấp tự động sau khi xác nhận hợp đồng.
- Luồng xác nhận Gmail, kích hoạt hợp đồng, job email nền, hóa đơn thật và SePay webhook thật cần triển khai ở các phase tiếp theo.
- Môi trường Supabase/Electron/Pages test riêng là đề xuất để người dùng xem xét; chưa tạo project hoặc phát sinh chi phí.
- Bản local SQLite trước đây đã được dừng và xóa theo yêu cầu; không còn là phương án triển khai tiếp theo.

## Quyết định mới — 07/10/2026

Người dùng chọn quay lại phương án **Supabase test riêng + cùng mã nguồn/giao diện Electron hiện tại + website test riêng**, theo ảnh trao đổi trước. Không dựng một giao diện quản trị riêng cho TEST LOCAL.

### Thứ tự triển khai

1. Kiểm tra tài khoản/organization Supabase và khả năng tạo project test miễn phí; chưa nâng gói trả phí.
2. Chuẩn bị database test từ cấu trúc/migration đã kiểm tra, chỉ seed dữ liệu giả phòng 999; không sao chép dữ liệu production.
3. Tạo cấu hình và profile Electron test, chạy chính mã nguồn Electron để giữ nguyên giao diện. Địa chỉ/keys và các job phải bị chặn nếu trỏ nhầm production.
4. Website test dùng URL Pages riêng và project Supabase test, không sửa website đang dùng.
5. Nối Gmail thật với phiên/config test riêng và allowlist email do chủ nhà cung cấp. Luồng xác nhận hợp đồng → email kích hoạt → nhắc cuối tháng phải chạy trên môi trường test. Không gửi thư trước khi có địa chỉ nhận được người dùng cho phép.
6. Thử từ thêm khách đến trả phòng. SePay vẫn giả lập trước; xác nhận isolation và quyền dữ liệu bằng các test tương ứng.

Môi trường cloud test và Gmail thật chưa được triển khai/kiểm chứng. Cấu hình OAuth Google có trên máy nhưng chưa xác minh phiên gửi Gmail riêng cho môi trường test.

## Tiêu chí nghiệm thu phase

- Có thể chạy trọn luồng phòng 999 trên môi trường test mà không tạo hoặc sửa bất kỳ bản ghi nào trong production.
- Xác nhận hợp đồng lặp lại không tạo tài khoản hoặc email trùng.
- Link kích hoạt hết hạn/đã dùng không thể đặt lại mật khẩu.
- Tài khoản test chỉ thấy phòng, hợp đồng, hóa đơn và lịch sử của chính hợp đồng test.
- Kết thúc hợp đồng test chặn truy cập phòng và vô hiệu hóa phiên cũ.
- Tắt Electron vẫn không dừng các job backend đã được triển khai trên cloud.

## Cập nhật triển khai 07/10/2026

Đã khôi phục project TEST `gsianbstkmyutnhromwc`, tạo schema `ankhang_contract_test` riêng vì public đã có bảng ứng dụng khác, dùng cùng giao diện Electron/profile riêng và deploy `ankhanghome-contract-test.pages.dev`. Phòng 999 là dữ liệu giả trong schema riêng. Luồng xác nhận → tự đặt mật khẩu → cấp tài khoản đã kiểm thử live; bước gửi Gmail thật cần kết nối OAuth riêng lần đầu. Chi tiết Phase 11.
