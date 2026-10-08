# Phase 05 — Hóa đơn và SePay demo

Ngày thực hiện: 06/10/2026. Phạm vi: website local trong `webmobile`, dữ liệu mẫu theo yêu cầu người dùng.

**Cập nhật sau:** phase 06 bổ sung khung chụp/chọn vùng và các trường hóa đơn tháng như Electron. WiFi 50.000đ + vệ sinh 30.000đ thay tổng mẫu phòng 101 thành **3.472.000đ** và phòng 102 thành **3.080.000đ**. Các con số phía dưới là bằng chứng bản phase 05 trước cập nhật. Xem `phase-06-meter-framing-and-invoice-fields.md`.

## Đã thực hiện

1. Điện → đọc ảnh → người thuê xác nhận → nước → đọc ảnh → người thuê xác nhận.
2. Backend cấp token xác nhận gắn hợp đồng, loại công tơ, chỉ số và hạn dùng. Backend lập hóa đơn từ hai token, kiểm tra lại mức tiêu thụ; không dùng tổng tiền hoặc số cũ do browser gửi.
3. Tự chuyển tới hóa đơn, chi tiết tiền phòng/điện/nước, QR demo và mã nội dung chuyển khoản.
4. Dùng trực tiếp các hàm thuần tạo mã và tìm hóa đơn của Electron tại `src/renderer/src/lib/invoiceTransfer.ts`. Adapter local chỉ tải các hàm này; không gọi IPC hoặc database.
5. Nguồn giao dịch SePay **mô phỏng** có các trường tương ứng giao dịch nhận tiền của luồng hiện tại. Đúng tài khoản demo, đúng một mã hóa đơn, đủ số tiền còn lại và chưa ghi nhận giao dịch mới được xác nhận đã trả.
6. Website tự kiểm tra trạng thái mỗi 2 giây, không cần người thuê bấm xác nhận đã chuyển tiền. Nguồn demo đưa giao dịch vào hàng đợi sau 1,2 giây.
7. Thiếu/thừa tiền hoặc sai mã chuyển tới cần đối soát, chưa ghi nhận trả tiền. Giao dịch trùng ID hoặc mã tham chiếu bị bỏ qua; hóa đơn đã trả không ghi nhận thêm tiền.
8. Sau khi trả đủ: biên lai, lịch sử của hợp đồng hiện tại và nút xem biên lai trên trang chủ. Khách mới không hiển thị lịch sử và chỉ số cũ của khách trước.

## Dữ liệu mẫu

Phòng 101: giá thuê 3.000.000đ; điện 12.600 → 12.692 = 92 kWh × 3.500đ; nước 280 → 287 = 7 m³ × 10.000đ. Tổng **3.392.000đ**.

Khách mới phòng 102: không lấy chỉ số của khách cũ; hai chỉ số là bàn giao và tiền điện nước chưa phát sinh. Tiền phòng tháng đầu trong demo là 3.000.000đ, chưa mô phỏng tính theo ngày.

## Chạy thử

- Mở `start.bat` tại `G:\PHONG TRO\app\webmobile`, website `http://127.0.0.1:5188/`.
- 9Router cần chạy để OCR nhận diện ảnh thực tế. Cấu hình riêng server trong `.env.local`.
- Xác nhận điện rồi nước, hệ thống tự lập hóa đơn.
- Mở **Thử giao dịch SePay demo** → **Nhận đủ tiền** để mô phỏng nguồn tiền vào. Các nút khác kiểm tra thiếu/thừa tiền, sai mã và trùng giao dịch.
- Các nút mô phỏng chỉ phục vụ kiểm thử. Luồng thật sẽ nhận giao dịch từ backend SePay.

## Giới hạn hiện tại

- Chưa kết nối API/webhook SePay thật, không dùng tài khoản ngân hàng/token SePay thật, không ghi Supabase, Electron, sổ thu tiền hoặc gửi email.
- QR chứa `ANKHANGHOME-DEMO:<invoiceId>:<amount>`, **không phải VietQR và không dùng chuyển tiền ngân hàng**.
- Hóa đơn/giao dịch lưu trong RAM của server, khởi động lại server sẽ mất. Browser lưu khả năng mở lại hóa đơn trong sessionStorage theo hợp đồng, không phải đăng nhập/phân quyền production.
- Mỗi hợp đồng/kỳ có một hóa đơn demo; chỉ số thay đổi sau khi đã lập bị chặn. Cần khởi động lại server nếu muốn thử lại từ đầu với chỉ số khác.
- Backend này chạy bằng Vite dev server trên máy. Bản Pages công khai chưa cập nhật luồng mới; tắt máy sẽ dừng backend demo.

## Phần production cần nối sau

1. Auth và quyền theo khách thuê/hợp đồng đang có hiệu lực; dữ liệu giá/chỉ số lấy từ backend, không từ fixtures.
2. Lưu chỉ số/hóa đơn/giao dịch và biên lai trong Supabase, ràng buộc duy nhất theo kỳ và giao dịch, cập nhật nguyên tử khi đối soát.
3. VietQR theo ngân hàng/tài khoản nhận thật, dùng chung quy tắc mã hóa đơn với Electron.
4. SePay webhook trên cloud, xác thực theo cấu hình dịch vụ, chống nhận lại giao dịch, bảo đảm chung một nguồn đối soát với Electron để không ghi thu hai lần.
5. Luồng chủ nhà kiểm tra thiếu/thừa tiền/sai mã/công tơ bất thường; nhật ký và retry.
6. Scheduler/email trên cloud để nhắc và vận hành khi máy Electron tắt.

Kiểm thử: `../qa/sepay-demo.md`.
