# Camera mobile — kiểm chứng 10/10/2026

## Luồng đã chốt

1. Người thuê bấm **Chụp ảnh điện/nước**. Website mở camera điện thoại bằng `input type=file accept=image/* capture=environment`; không dùng `getUserMedia`, video hoặc trình phát toàn màn hình.
2. Ảnh được đưa về website để đọc OCR. Ảnh đạt vẫn mở màn **Xác minh số** và phải bấm **Xác nhận**.
3. Nếu chụp/đọc ảnh lỗi hai lần, hiện nút **Nhập chỉ số thủ công**. Số thủ công mở màn kiểm tra riêng, hiển thị số cũ, số mới và mức tiêu thụ; khách phải bấm **Xác nhận** rồi mới ghi nhận.
4. Số điện chỉ chuyển sang bước nước sau khi backend xác nhận thành công. Nước chỉ lập hóa đơn sau khi được xác nhận.

## Kiểm nghiệm UX phòng 999

- Bản HTTPS Tunnel của phòng 999 có nút **Kiểm nghiệm** để duyệt từng màn hình mà không mở camera hay gọi Gemini.
- Nút chỉ cấp cho hồ sơ `simulation`; từng lần bấm vẫn dừng tại màn xác minh và xác nhận tiếp theo để kiểm tra UX đầy đủ. Trạng thái và thanh toán thử chỉ tồn tại trong RAM.
- Năm lần bấm từ trang đầu kiểm tra đủ điện, nước, hóa đơn và trạng thái đã thanh toán; `/reset` đưa kỳ trở lại chưa có chỉ số.

## Kiểm chứng

- 38/38 kiểm tra tự động đạt, gồm xác minh trước khi ghi, sai công tơ, số tăng bất thường, manual fallback, camera/request cancellation và API cũ không có `AbortSignal.any/timeout`.
- Browser QA tổng hợp ở cổng 5299 đã kiểm tra ảnh lỗi → chụp lại → màn xác minh điện; camera, OCR và hóa đơn trong QA là dữ liệu tổng hợp, không chứng minh chất lượng AI thật trên mọi máy.
- Sandbox HTTPS `https://converter-sink-barcelona-drives.trycloudflare.com/?screen=payment&camera=canvas2` trả HTTP 200, `noWrites=true`; không ghi Supabase, Electron, Gmail hoặc SePay. Trạng thái kiểm tra hiện vẫn chưa có chỉ số mới hay hóa đơn.
- Build mới đã kiểm tra TypeScript và public bundle; không chứa khóa riêng. Website deploy tại `https://pay.phongtroankhang.com` và backend health online.

## Giới hạn thiết bị

Giao diện camera gốc do hệ điều hành/trình duyệt quyết định. Website không thể vẽ khung scan bên trong camera gốc; ảnh sau khi chụp mới quay lại màn xác minh của website. Cần thử thực tế trên iPhone Safari, Android Chrome, Samsung Internet và trình duyệt trong Zalo/Gmail. Không dùng kết quả desktop để kết luận mọi thiết bị hoạt động giống nhau.

## Bằng chứng

- `meter-camera-native-fallback.png`
- `meter-camera-native-image-recovery.png`
- `meter-camera-browser-cases.json`
- `meter-camera-canvas-working.png` (bằng chứng cũ của canvas QA, không còn là luồng tenant chính)
