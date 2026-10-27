# Phase 02 - Danh sách phòng trên PWA mobile

Ngày chốt: 08/10/2026.
Ứng dụng đích: https://app.phongtroankhang.com.
Trạng thái: Đã chốt hướng giao diện; bản PWA riêng đang triển khai theo goal hiện hành, chưa nghiệm thu toàn bộ nghiệp vụ hoặc phát hành production.

## Xác nhận chốt phương án

Ngày 08/10/2026, người dùng xác nhận triển khai **phương án 2**: danh sách phòng hiển thị liên tục theo cách quen thuộc của Electron desktop, **không chia theo tầng**. Đây là quyết định giao diện chính thức của phase; các thay đổi tiếp theo chỉ được phép tinh chỉnh responsive, khả năng đọc và thao tác chạm mà không thay đổi bố cục hoặc thêm nhóm tầng.

## 1. Phương án đã duyệt

- Chọn phương án 2, theo bản điều chỉnh giữ cách hiển thị quen thuộc của Electron desktop.
- Hiển thị một danh sách phòng liên tục; không chia theo tầng, không thêm tiêu đề tầng hoặc bộ lọc tầng từ quyết định này.
- Giữ nhận diện AN KHANG HOME, màu xanh emerald, nền trắng, thứ bậc thông tin và màu trạng thái quen thuộc.
- Tối ưu kích thước, khoảng cách và thao tác cho điện thoại; không thiết kế lại thành một hệ thống quản lý khác.
- Sau khi đăng nhập hợp lệ, mở màn Danh sách phòng.

Ảnh đã duyệt là nguồn tham chiếu khi triển khai:

![Danh sách phòng mobile đã chốt](../tmp-product-design/rooms-mobile-20261008/electron-like-revision.png)

## 2. Bố cục đã chốt

- Phần đầu: tên màn hình, số lượng phòng và thao tác thêm phòng theo ảnh duyệt.
- Công cụ: tìm kiếm phòng và lọc trạng thái theo Electron.
- Danh sách: tên phòng, số người ở, giá thuê, trạng thái phòng, tình trạng thu tiền/nợ và dấu mở chi tiết; giữ thứ bậc như ảnh duyệt.
- Trạng thái tài chính: đỏ cho chưa thu/còn nợ, xanh cho `Đã thu đủ`; kỳ thu và số tiền lấy từ dữ liệu thực tế.
- Thanh điều hướng dưới: giữ hình thức trong ảnh, mục `Phòng` đang được chọn. Quyền và luồng của các mục còn lại cần đặc tả riêng.

## 3. Cách triển khai khi bắt đầu phase

1. Đối chiếu danh sách, bộ lọc, thứ tự phòng và các quy tắc nghiệp vụ với Electron hiện tại.
2. Triển khai phần PWA riêng; dùng Electron làm tham chiếu, không cần sửa UI Electron để thực hiện hướng mobile này.
3. Kết nối dữ liệu backend chung sau khi hoàn thành kiểm tra phiên và quyền của Phase 01.
4. Chuyển phần trình bày danh sách sang bố cục mobile theo ảnh duyệt, giữ nguyên quy tắc dữ liệu và tính toán hiện có.
5. Giữ tìm kiếm và các bộ lọc hiện có: tất cả, đang ở, phòng trống, sắp trả và sắp hết hạn; đối chiếu điều kiện lọc với Electron khi triển khai.
6. Tổng số phòng, tên phòng, người ở, giá thuê, trạng thái và số tiền phải lấy từ backend; không dùng dữ liệu mẫu trong ảnh làm dữ liệu thật.
7. Chuẩn bị trạng thái đang tải, không có phòng, tìm kiếm không có kết quả và lỗi kết nối có thể thử lại.
8. Kiểm tra trên mobile và so sánh ảnh chụp thực tế với ảnh đã duyệt; ghi kết quả vào `design-qa.md` của phần PWA khi triển khai.

## 4. Nguyên tắc dữ liệu và tài chính

- Không đổi mô hình phòng hoặc thứ tự hiện có chỉ để khớp bố cục demo.
- Không thay đổi cách tính tiền thuê, phí dịch vụ, cọc, hóa đơn hay trạng thái thu tiền.
- Phân biệt tổng nợ nhiều kỳ với số tiền còn thiếu của hóa đơn hiện tại; không dùng hai giá trị thay cho nhau.
- Nhãn `Chưa thu tháng 10` trong demo chỉ là ví dụ. Giao diện thực tế phải hiển thị đúng kỳ hóa đơn.
- Những trường hợp nhiều kỳ chưa thu, thanh toán một phần, phòng bảo trì hoặc chưa có hóa đơn phải đối chiếu nghiệp vụ Electron; chưa chốt cách trình bày chi tiết trong quyết định này.

## 5. Tiêu chí nghiệm thu khi triển khai

- [ ] Danh sách liên tục, không chia theo tầng.
- [ ] Giao diện giữ màu sắc và thứ bậc thông tin của ảnh duyệt/Electron, dùng tốt ở chiều rộng 320–430 px.
- [ ] Tên phòng, người ở, giá thuê và trạng thái đúng với dữ liệu backend dùng chung Electron.
- [ ] Tìm kiếm, lọc và thứ tự hiển thị tương đương quy tắc Electron.
- [ ] Nhãn kỳ thu, trạng thái chưa thu/đã thu và số tiền đúng nghiệp vụ; không hardcode tháng 10.
- [ ] Không nhầm tổng nợ với dư nợ hóa đơn hiện tại.
- [ ] Các trạng thái tải, rỗng, lỗi và kết quả lọc không làm vỡ bố cục.
- [ ] Thao tác chạm không chồng nhau; mở đúng phòng và không phát sinh thay đổi dữ liệu chỉ khi xem danh sách.
- [ ] Có ảnh chụp thực tế và báo cáo `design-qa.md` đối chiếu với ảnh đã duyệt.

## 6. Còn bàn riêng

- Giao diện chi tiết phòng và các thao tác bên trong.
- Cách hiển thị nhiều kỳ nợ và các trường hợp tài chính đặc biệt.
- Vị trí xuất Excel trên mobile: màn danh sách hay menu thao tác.
- Luồng điều hướng và quyền chi tiết của các mục khác.

Ghi chú: Chốt hướng giao diện không đồng nghĩa đã triển khai, nghiệm thu hoặc phát hành. Các ô nghiệm thu chỉ đánh dấu sau khi có kiểm chứng.
