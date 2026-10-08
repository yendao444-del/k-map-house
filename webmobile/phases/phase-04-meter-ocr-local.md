# Phase 04 — Thử OCR công tơ trên máy

Chốt ngày 06/10/2026: trước mắt chạy OCR qua `start.bat` trên máy, dùng 9Router hiện có. Chưa bật OCR trên Cloudflare Pages.

## Luồng đã triển khai

1. Người thuê chụp/chọn ảnh điện, JPG/PNG/WebP tối đa 10 MB.
2. Trình duyệt thu nhỏ ảnh, backend local gọi AI qua 9Router. Khóa tiếp tục khi đang đọc.
3. Kiểm tra đúng loại công tơ và đơn vị; chỉ lấy số nguyên, bỏ bánh số đỏ/thập phân, số seri, năm và thông số thiết bị.
4. Đọc hai lượt độc lập song song, dùng ảnh toàn công tơ và ảnh cắt trung tâm do server tạo từ chính ảnh đó. Kết quả phải hợp lệ và thống nhất mới hiện chỉ số đề xuất. Ảnh không rõ/sai loại/kết quả khác nhau: chặn xác nhận, yêu cầu chụp lại. Dịch vụ lỗi/chậm: báo thử lại, không coi là ảnh mờ.
5. Backend đối chiếu loại công tơ, chỉ số cũ, số ngày của kỳ và giới hạn tiêu thụ. Số mới nhỏ hơn số cũ hoặc ảnh điện bị đưa vào bước nước sẽ bị từ chối; mức tăng quá cao/tăng đột biến chuyển sang `review` và không cấp token xác nhận.
6. Người thuê đối chiếu ảnh và bấm xác nhận số điện; server kiểm tra lại token ảnh và giá trị trước khi chuyển sang nước, thực hiện tương tự.
7. Nhập tay chỉ là nhánh sửa số sau khi ảnh đã được AI đọc rõ, không phải lối đi cho ảnh mờ/sai loại. Giá trị sửa cũng phải qua server check và được ghi nguồn `manual`.
8. Chỉ hoàn tất khi cả hai chỉ số đã xác nhận. Chụp lại hủy yêu cầu đang chạy và xóa kết quả/xác nhận của ảnh thay thế; ảnh điện mới cũng làm mất bước nước trước đó.

## Phạm vi phiên thử

- Ảnh gửi đến nhà cung cấp AI đã cấu hình qua 9Router; backend không ghi ảnh/chỉ số xuống ổ đĩa hoặc database.
- Chỉ số và ảnh nằm trong phiên trình duyệt, tải lại sẽ mất. Chưa tạo hóa đơn/gửi email/ghi SePay.
- Bản demo dùng context mẫu: phòng 101 có số cũ 12.600 kWh/280 m³ và ngưỡng mẫu; phòng 102 là bàn giao nên không hiển thị lịch sử khách cũ. Đây chỉ là minh họa UI/policy, không dùng để tính tiền thật.
- Khóa nhận diện chỉ ở `.env.local` đã được Git bỏ qua, không dùng `VITE_*` và không có trong bundle công khai.
- Mở `webmobile/start.bat`; cần 9Router đang chạy. URL local: `http://127.0.0.1:5188/`.
- Hai lượt AI đồng ý không bảo đảm đúng tuyệt đối. Giữ bắt buộc xác nhận từ người thuê; cùng ảnh có thể được AI chấp nhận hoặc từ chối ở lượt khác nhau.

## Trước khi dùng thật

- Cần ảnh thực tế của nhiều mẫu công tơ để đo tỷ lệ đọc sai/từ chối và thời gian nhận diện.
- Kết nối auth, hợp đồng hiện tại, lưu ảnh riêng tư và bản ghi chỉ số/nguồn/xác nhận; đối chiếu số cũ, công tơ thay mới và mức tiêu thụ bất thường ở backend.
- Với ảnh không rõ/sai loại: bắt chụp lại, không cho nhập tay để vượt qua. Nhánh sửa tay chỉ mở sau một ảnh AI rõ và cần server duyệt lại.
- Gắn công tơ theo phòng bằng số seri/QR hoặc mã công tơ đã đăng ký để chống chụp nhầm công tơ cùng loại của phòng khác. Nhận diện điện/nước và kiểm tra mức tăng hiện chưa chứng minh ảnh thuộc đúng phòng.
- Nghiệp vụ `review` hiện chỉ chặn trong phiên local; trước khi dùng thật cần lưu bản ghi chờ kiểm tra và thao tác duyệt của chủ nhà ở Electron. Thay/đảo vòng công tơ cần mốc ghi số mới được chủ nhà xác nhận, không tự coi số giảm là hợp lệ.
- Tạo hóa đơn, SePay và email nối sau theo nghiệp vụ đã chốt.
- Muốn chạy khi máy tắt: triển khai endpoint OCR có xác thực/rate limit trên cloud và cấu hình provider truy cập được từ cloud. Không đưa địa chỉ localhost/khóa 9Router local lên Pages.

QA chi tiết: `../qa/meter-ocr-local.md`.

## Tối ưu nhận diện và tốc độ — 06/10/2026

- Trước đây giảm ảnh còn 1800 px rồi gọi AI hai lần tuần tự; đã đổi giữ ảnh gửi tối đa 2560 px, server tạo ảnh toàn thiết bị 1600 px và vùng trung tâm lớn hơn để đọc dãy số. Cắt ảnh theo tỷ lệ chung, không dùng tọa độ riêng của hai ảnh mẫu.
- Cả hai lượt nhận diện chạy song song, `reasoning_effort: low` và JSON ngắn. Vẫn phải cùng loại công tơ, đơn vị, dãy số rõ và chỉ số thống nhất.
- Prompt kiểm tra độ rõ của dãy số; nhãn/vỏ công tơ hơi mờ không đủ để từ chối nếu từng chữ số đọc rõ. Không dùng số cũ để đoán số mới.
- Giới hạn chờ nhà cung cấp 15 giây; timeout báo dịch vụ chậm, không cho xác nhận. Đây là giới hạn chờ, không cam kết latency.
- Lượt đo trước sửa: điện 11,5 giây đọc được; nước 5,8 giây bị từ chối. Ba lượt sau sửa: điện 3,35–3,79 giây (2/3 lượt chấp nhận), nước 3,28–4,61 giây (3/3 lượt chấp nhận). Giao diện thực tế đã đọc được cả hai.
- Các con số chỉ là kiểm thử hai ảnh cung cấp trên kết nối hiện tại, không phải tỷ lệ chính xác hay SLA cho toàn bộ khách thuê.
