# Phase 14 — Menu người thuê và tài sản trong phòng

## Phạm vi đã triển khai

- Nút menu bên trái thay nút thoát trên thanh đầu trang; giữ logo và màu xanh hiện tại.
- Menu cuối: Trang chủ; Thông tin phòng → Thông tin chung / Điện & nước / Thiết bị trong phòng; Thanh toán; Tài khoản; Đăng xuất.
- Trang chủ hiển thị trực tiếp thông tin phòng, điện nước, phí dịch vụ và toàn bộ tài sản với tên, số lượng, tình trạng do chủ nhà cập nhật trong Electron; không cần bấm mở danh sách tài sản. Menu vẫn cho phép truy cập các mục riêng.
- Thông tin phòng gồm tầng, diện tích, giá thuê, ngày bắt đầu, ngày lập hóa đơn, đơn giá dịch vụ và chỉ số điện nước khi nhận phòng.
- Chỉ số khi nhận phòng được ghi rõ nhãn, không trình bày thành chỉ số mới nhất hàng tháng.

## Dữ liệu và quyền truy cập

- Backend xác định phòng từ hợp đồng đang hiệu lực của tài khoản người thuê; không nhận phòng tùy ý từ trình duyệt.
- Chỉ trả các trường tài sản cần thiết: mã, tên, số lượng, loại và tình trạng; không trả ghi chú nội bộ hay thông tin liên hệ sửa chữa.
- Không có hợp đồng đang hiệu lực thì không tải tài sản, đơn giá hoặc chỉ số bàn giao.
- Đơn giá lấy từ khu dịch vụ của phòng hiện tại.
- Tải lỗi và danh sách thật sự trống có thông báo khác nhau.
- Làm mới khi mở mục tài sản/thông tin phòng, khi quay lại tab và mỗi 30 giây; có nút làm mới tài sản.

## Kiểm chứng

- 10 kiểm thử backend tài khoản người thuê đạt, bao gồm giới hạn theo phòng hiện tại, cập nhật tài sản, lỗi tải và giá trị chỉ số bằng 0.
- Build TypeScript/Vite đạt; kiểm tra bản public không chứa cấu hình bí mật đạt.
- UI tại 320×568 và 390×844 đạt: menu trái, vùng bấm tối thiểu 44px, danh sách và tình trạng tài sản, trạng thái trống/lỗi, đăng xuất và không tràn ngang.
- Đối chiếu chỉ đọc phòng 999: hai tài sản trả về khớp dữ liệu Electron; không tạo dữ liệu, đổi mật khẩu hay gửi email kiểm thử.
- Backend test và production đã triển khai bằng script chỉ cập nhật mã; số bản ghi nghiệp vụ và Auth không thay đổi.
- Frontend đã triển khai lên Cloudflare Pages; kiểm chứng tệp giao diện mới và backend online trên `https://pay.phongtroankhang.com` cùng các tên miền đang hoạt động. Bằng chứng triển khai trong `webmobile/deployment.json`.
- Bằng chứng: `webmobile/qa/tenant-room-menu-*.json` và ảnh `webmobile/qa/tenant-*.png`.

## Giới hạn hiện tại

- OCR/hóa đơn/SePay thật đã nối trong Phase 15; xem `phase-15-tenant-monthly-payment.md` để biết phạm vi và giới hạn. Hóa đơn demo vẫn tách khỏi tài khoản thật.
- Menu này hiển thị dữ liệu phòng hiện tại; không mở lịch sử người thuê trước.

## Cập nhật giao diện trang chủ theo phương án 1

- Giữ bố cục đã duyệt: header thương hiệu, thông tin phòng, vùng điện nước/dịch vụ, danh sách tài sản và trạng thái thanh toán.
- Bỏ khung viền bao quanh toàn bộ ứng dụng theo góp ý cuối; chỉ giữ một vùng trắng gọn cho nhóm điện nước và dịch vụ.
- Không thêm dữ liệu diện tích hoặc thông tin mới; dữ liệu vẫn lấy từ hợp đồng/phòng hiện tại.
- Design QA và build đạt; ảnh kiểm tra cuối: `webmobile/qa/tenant-menu-home-390.png`.

### Sửa lại độ giống ảnh sau góp ý

- Khôi phục cỡ chữ/biểu tượng theo ảnh đã duyệt, bỏ nền ô vuông của tài sản, thêm icon Internet và Vệ sinh.
- Không dùng viền ngoài hoặc padding desktop để tạo một khung cao rỗng cho trang người thuê.
- Chuẩn hóa ảnh mẫu 853×1844 về 426×922 và đối chiếu với ảnh browser cùng nội dung fixture. Bằng chứng: `qa/tenant-home-premium-comparison.png` và `qa/tenant-home-premium-details-comparison.png`.
- Browser 320px/390px và build đạt. Các sai khác nhỏ của font thật và icon thư viện được ghi trong design-qa.

## Cấu trúc menu đã chốt và triển khai

- Trang chủ → Thông tin phòng → Thanh toán → Tài khoản; Đăng xuất tách phía dưới.
- Bên trong Thông tin phòng có ba lựa chọn: Thông tin chung, Điện & nước, Thiết bị trong phòng. Điện/nước gộp một mục, hiển thị hai phần rõ ràng.
- Thiết bị không còn là mục cấp cao riêng; vẫn hiển thị dữ liệu phòng hiện tại và nút làm mới.
- Trang chủ giữ bố cục đã duyệt và thông tin hiện có; đổi tiêu đề tài sản thành Thiết bị trong phòng cho nhất quán.
- Kiểm tra browser ở 320px và 390px: chuyển ba mục, điều hướng menu/thanh toán và trường hợp không có hợp đồng; không tràn ngang, không có lỗi browser. Build đạt.
- Chức năng Thanh toán thật vẫn đang chuẩn bị theo Phase 15; thay đổi này chỉ hoàn thiện cấu trúc điều hướng.

## Cập nhật theo góp ý trang chủ

- Giảm cỡ tiêu đề phòng, khoảng cách và chiều cao dòng; điện và nước nằm cạnh nhau.
- Danh sách tài sản hiển thị đầy đủ trên trang chủ, có nút làm mới; không cắt bớt danh sách theo số lượng.
- Khung thanh toán rút còn thông báo ngắn, không giả lập hóa đơn cho khách thật.
- Kiểm tra lại UI 320px/390px và build đạt; trạng thái chưa có hợp đồng không hiển thị tài sản hay đơn giá.

