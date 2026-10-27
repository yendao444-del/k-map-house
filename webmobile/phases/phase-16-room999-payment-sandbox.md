# Phase 16 — Kiểm nghiệm thanh toán phòng 999

> Sandbox RAM trong phase này chỉ phục vụ thử UI/UX nhanh. Luồng Electron ↔ website ↔ database TEST ↔ SePay Simulator trên thiết bị thật được lập kế hoạch ở `phase-17-staging-e2e-room999.md`; phase 16 không được xem là đã triển khai staging đó.

## Bổ sung 10/10/2026 — Camera mobile

- Màn chụp có nút **Chụp ảnh** luôn nằm trong viewport, không cần cuộn; camera gốc do điện thoại mở, kiểm tra bố cục ở 390×664, 320×480 và 664×320.
- Luồng tenant chỉ dùng camera điện thoại qua `input type=file accept=image/* capture=environment`; không gọi `getUserMedia`, không gắn video và không mở trình phát “Trực tiếp”. Sau hai lần chụp/đọc ảnh lỗi mới mở nút nhập thủ công.
- Ảnh AI đọc được và số nhập thủ công đều đi qua màn xác minh riêng. Khách phải bấm **Xác nhận**; chỉ sau đó mới ghi nhận và chuyển sang công tơ tiếp theo.
- Chụp → OCR → xác minh chỉ số → nước → hóa đơn được giữ nguyên. Sandbox tiếp tục lưu RAM, không ghi dữ liệu thật.
- Đã triển khai UI chung lên website. Bằng chứng/giới hạn kiểm chứng tại `webmobile/qa/meter-camera-mobile-fix.md`; cần thử camera vật lý trên iPhone.

## Cách chạy

- Mở `webmobile/test/room999-payment/start-payment-room999.bat`.
- Website local: http://127.0.0.1:5298/?screen=payment.
- Bắt đầu lại bằng nút trên trang hoặc http://127.0.0.1:5298/reset.
- Cùng giao diện TenantHome/TenantPayment thật; hồ sơ và kỳ phòng 999 mô phỏng riêng, không dùng tài khoản thật.

## Luồng

1. Chụp ảnh điện bằng camera điện thoại → Gemini đọc → kiểm tra loại, số cũ, mức tiêu thụ → khách xem ảnh, đối chiếu/sửa số và xác nhận → mới ghi nhận, chuyển sang nước.
2. Chụp ảnh nước bằng camera điện thoại → kiểm tra tương tự → khách xác minh và xác nhận → ghi nhận, lập hóa đơn.
3. Hóa đơn có chỉ số cũ/mới, tiêu thụ, đơn giá, tiền phòng, dịch vụ, tổng và nội dung chuyển khoản.
4. QR chứa văn bản kiểm nghiệm, không phải QR chuyển khoản ngân hàng. Nút “Mô phỏng nhận đủ tiền” cập nhật trạng thái trong RAM.

## Nút kiểm nghiệm UX

- Chỉ hồ sơ sandbox phòng 999 thấy nút **Kiểm nghiệm**; website thật không cấp cờ `simulation` nên không có nút này.
- Mỗi lần bấm đi qua một bước thật của giao diện: xác minh điện `12600 → 12692` (92 kWh), xác nhận điện, xác minh nước `280 → 287` (7 m³), xác nhận nước/lập hóa đơn, rồi ghi nhận thanh toán thử.
- Nút không gửi ảnh đến Gemini và không gọi Supabase, Electron, Gmail, SePay. Hai số mẫu đi qua cùng bước xác nhận API nhưng chỉ ghi trong RAM của server sandbox.
- Từ màn hình đầu, bấm năm lần liên tiếp để lần lượt xem: xác minh điện, chụp nước, xác minh nước, hóa đơn chờ thanh toán và hóa đơn đã thanh toán.
- Ở hóa đơn có nút **Tạo lại kiểm nghiệm** để xóa kỳ mô phỏng hiện tại, quay về đầu kỳ và thử lại ngay trên cùng URL.
- Ở màn xác minh, trạng thái **Chỉ số đã qua kiểm tra** và nút **Kiểm nghiệm · Xác nhận** được hiển thị riêng; nút xác nhận thật vẫn có để kiểm tra thao tác người thuê.

## Dữ liệu và phạm vi

- Đầu kỳ giả lập: điện 12600, nước 280. Giá thuê 3500000; điện 3200/kWh; nước 35000/m³; internet 50000; vệ sinh 70000.
- Không ghi Supabase, hóa đơn Electron, ảnh hay chỉ số vào database. Không gửi email hoặc gọi SePay. Server đọc khóa Gemini từ cấu hình backend để OCR thật; có thể tính phí theo gói AI.
- Không đưa sandbox lên production hoặc kích hoạt bằng mã phòng trên website thật. Dữ liệu mất khi dừng server/reset.
- QA/bundle local và log kiểm nghiệm nằm trong `test/room999-payment`; ảnh tải lên và trạng thái nghiệp vụ chỉ ở RAM. Gemini nhận ảnh để OCR.

## Kiểm chứng 08/10/2026

### Kiểm nghiệm điện thoại qua LAN

- File chạy: `webmobile/test/room999-payment/start-payment-room999-lan.bat`, server `--lan` nghe cổng 5298 trên IPv4 LAN.
- IP hiện tại: http://192.168.100.114:5298/?screen=payment. Điện thoại phải cùng mạng với máy tính, máy tính cần bật; IP có thể đổi.
- HTTP LAN không có getUserMedia/khung scan trực tiếp trong trang. Riêng sandbox, nút Chụp ảnh dùng input file `capture=environment` để điện thoại mở camera gốc. Hành vi phụ thuộc trình duyệt; vẫn chọn ảnh có sẵn được.
- Nếu firewall chặn: mở PowerShell bằng quyền Administrator rồi chạy `& 'G:\PHONG TRO\app\webmobile\test\room999-payment\allow-room999-lan.ps1'`. Chỉ cho TCP 5298 từ LocalSubnet tới địa chỉ LAN máy này; không đổi mạng Public thành Private.
- Đóng server khi xong; tùy chọn gỡ rule: `Remove-NetFirewallRule -Name AnKhangHome-Room999-LAN-Test`.
- Muốn khung scan giống website thật và dùng ngoài WiFi: cần HTTPS ở môi trường test riêng hoặc tunnel được bảo vệ. Chưa đưa sandbox lên website production.

## Bổ sung 09/10/2026 — HTTPS test trên điện thoại

- File chạy: `webmobile/test/room999-payment/start-payment-room999-https.bat`.
- Script tự tải `cloudflared-windows-amd64.exe` từ release chính thức của Cloudflare khi máy chưa có, khởi động sandbox ở cổng 5298 và tạo URL `trycloudflare.com` tạm thời.
- Mở URL HTTPS được in ra trên điện thoại để dùng camera trực tiếp trong trang. Khi đóng launcher, tunnel dừng; server sandbox có thể dừng riêng bằng cách đóng cửa sổ Node hoặc dừng tiến trình cổng 5298.
- Sandbox vẫn memory-only và không gọi Supabase, Electron, Gmail hay SePay. Không đưa URL tunnel này cho khách thật.

- Trình duyệt: ảnh điện 12692 → 92 kWh; ảnh nước 00287 → 7 m³; tổng 4159400đ; nút mô phỏng nhận tiền → paid.
- TypeScript đạt. Ảnh kết quả: `test/room999-payment/artifacts/room999-payment-sandbox-paid.png`.
- Gemini có lúc trả provider_busy/timeout; không cho xác nhận nếu đọc thất bại. Lần thử lại đã đọc được cả hai ảnh.
- Ảnh không đạt chỉ hiển thị lý do và nút chụp lại. Khôi phục màn hình xác minh theo yêu cầu 09/10/2026: ảnh đạt vẫn cần khách đối chiếu và bấm xác nhận; OCR chưa ghi chỉ số vào kỳ. Nhập thủ công có bước xác nhận riêng.
- Sau 2 lần OCR thất bại cùng loại công tơ, sandbox mở `Nhập chỉ số thủ công`; số vẫn qua kiểm tra nghiệp vụ và ghi nguồn `manual` trong RAM. Website thật dùng RPC/database riêng để ghi bộ đếm và audit entry.

## Bổ sung 09/10/2026 — Nhập thủ công có kiểm soát

- Website thật đã nhận UI/backend mới tại `https://pay.phongtroankhang.com`.
- Migration `20261009100000_tenant_meter_manual_fallback.sql` tạo bộ đếm lỗi OCR theo kỳ/công tơ và bảng audit nhập thủ công; không tạo ảnh OCR giả.
- Nhập thủ công chỉ được RPC mở sau 2 lỗi OCR/camera của đúng công tơ; backend vẫn kiểm tra số cũ, giới hạn tăng và hợp đồng hiện tại. Nguồn lưu là `manual`, lý do là `ocr_failed` hoặc `camera_unavailable`.
- Build, 9 regression checks, test SQL trên project test riêng và deploy health đều đạt. Dữ liệu test rollback; không tạo hóa đơn/thanh toán thật khi kiểm thử.
