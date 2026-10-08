# Lý do hủy thử nghiệm — 08/10/2026

Nguyên nhân: giao diện đã hỗ trợ `test_reset`, nhưng dấu thử nghiệm thuộc hợp đồng cũ đã hủy. Hợp đồng thay thế của phòng 999 chưa được đánh dấu nên lựa chọn bị ẩn.

Đã áp dụng migration `20261008230000_designate_current_contract_test.sql` cho đúng hợp đồng `contract_5f951395-b5a5-4f2c-9fd2-766b0aa388de`, phòng `room-1791197579415-sgwfup89`, khách `tenant-1791206769026-rqk3wsos`. Không đánh dấu toàn bộ phòng hoặc hợp đồng về sau.

Backend production xác nhận `isTestContract=true`, `allowed=true`, các số hóa đơn/phiếu/giao dịch/bằng chứng sử dụng bằng 0. Hợp đồng vẫn active; không gửi email, không hủy. Số hợp đồng, hóa đơn và thông báo giữ nguyên; thêm đúng một designation. Bằng chứng chi tiết: `contract-test-reason-verification.json`.

QA với component thật và dữ liệu giả xác nhận lý do được chọn, không cần hồ sơ đối chiếu, nút hủy bật sau khi xác nhận. Ảnh: `contract-test-reason.png`. Backend vẫn kiểm tra tài chính và bàn giao tại thời điểm hủy.

11/11 kiểm thử `contract-confirmation.test.mjs` đạt; build/typecheck Electron đạt. Mock kiểm tra email hệ thống được cập nhật để phản ánh RPC boolean hiện có.

Người dùng đóng và mở lại hộp thoại hủy để nhận trạng thái mới; không cần đổi giao diện hoặc cài lại app.
