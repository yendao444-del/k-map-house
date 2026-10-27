# Kiểm nghiệm thanh toán phòng 999

Thư mục này chứa riêng luồng kiểm nghiệm thanh toán phòng 999. Luồng dùng giao diện thật, nhưng dữ liệu chỉ nằm trong RAM của server local.

## Chạy trên máy tính

Mở `start-payment-room999.bat`, sau đó truy cập `http://127.0.0.1:5298/?screen=payment`.

## Chạy trên điện thoại cùng Wi‑Fi

Mở `start-payment-room999-lan.bat`. Lấy địa chỉ `http://<IP-máy-tính>:5298/?screen=payment` được in trong cửa sổ, rồi mở trên điện thoại cùng mạng.

Nếu Windows Firewall chặn, chạy PowerShell Administrator:

```powershell
& 'G:\PHONG TRO\app\webmobile\test\room999-payment\allow-room999-lan.ps1'
```

Gỡ rule sau khi test:

```powershell
Remove-NetFirewallRule -Name AnKhangHome-Room999-LAN-Test
```

## Chạy trên điện thoại qua HTTPS

Mở `start-payment-room999-https.bat`. Script sẽ tự tải `cloudflared` bản Windows chính thức nếu máy chưa có, khởi động server kiểm nghiệm và tạo một URL HTTPS tạm thời dạng `https://....trycloudflare.com`.

Mở URL được in ra trên điện thoại. HTTPS cho phép trang dùng camera trực tiếp trong giao diện, gồm khung scan và nút `Chụp & đọc số`. URL chỉ tồn tại trong lúc cửa sổ launcher còn chạy; đóng cửa sổ để dừng tunnel.

Luồng này vẫn là sandbox phòng 999: dữ liệu chỉ ở RAM, không ghi Supabase/Electron, không gửi Gmail và không gọi SePay. Không dùng QR kiểm nghiệm để chuyển khoản thật.

Log tunnel nằm trong `.runtime/cloudflared.log` và `.runtime/cloudflared.err` nếu cần kiểm tra lỗi.

Nút chụp trên HTTP LAN mở camera gốc của điện thoại qua `capture=environment`; khung camera trực tiếp trong trang cần HTTPS.

## Reset

Mở `http://<IP-máy-tính>:5298/reset`. Dừng cửa sổ server để xóa toàn bộ trạng thái RAM.

Không có Supabase, Electron, SePay, Gmail hay thanh toán thật trong luồng này.

## Giao diện như thật

Giao diện khách thuê không hiển thị banner/chữ mô phỏng, nút nhận tiền thử hoặc reset. Ảnh công tơ mẫu hiển thị tại cả bước điện và nước; không còn nút “Không mở được camera?” và ghi chú dài bên dưới các nút.

Các thao tác kiểm thử nằm riêng tại `http://<IP-máy-tính>:5298/test-tools`: ghi nhận đủ tiền thử và bắt đầu lại. QR trên giao diện vẫn chỉ chứa văn bản kiểm thử, không chuyển tiền được; không chuyển khoản thủ công vào số tài khoản hiển thị. Giữ cờ simulation nội bộ để dữ liệu chỉ lưu trong RAM.

## Nhập thủ công

Chụp ảnh là luồng chính. Nếu OCR thất bại hai lần cho cùng loại công tơ, nút `Nhập chỉ số thủ công` được mở. Backend vẫn kiểm tra số cũ, giới hạn tiêu thụ và ghi nguồn `manual`; không tạo ảnh giả. Trên website thật, bộ đếm lỗi và bản ghi nhập thủ công nằm trong database theo đúng tài khoản/hợp đồng.
