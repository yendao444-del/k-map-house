# Review thanh toán người thuê — 08/10/2026

## Đã sửa trong review

- Tách real tenant khỏi demo store; backend sở hữu phạm vi, đơn giá, chỉ số và trạng thái paid.
- Giới hạn lịch sử theo lượt thuê; không trả payment_records/ghi chú nội bộ.
- Token ảnh đúng người/loại/kỳ/hạn; kiểm tra lại hợp đồng/số cũ trước lập.
- Khóa + trigger chống race Electron/web; tạo invoice idempotent sau nhấn lại/timeout.
- Không mở thêm kỳ có snapshot cũ khi còn kỳ chưa ghi số.
- SePay dùng ledger cloud; thiếu/thừa tiền cần đối soát, trùng không ghi hai lần.
- Chỉ số đã trả không bị lùi khi trả hóa đơn cũ.
- Email recheck account/contract/recipient, dùng chung budget, rate limit/lease/idempotency. Sửa CTA phù hợp renderer HTML fragment.
- Sửa bundle backend vô tình kéo TypeScript compiler do đường import adapter mới; dùng helper thuần Electron.
- Sửa input file gây tràn ngang 40px tại 320px; thu QR còn 200px cho hóa đơn gọn.

## Bằng chứng

25 unit/regression tests; SQL isolated transaction; E2E Gemini thật → invoice test → SePay giả lập → paid → receipt queue đạt. Production API/auth/CSRF/RPC/table và cron configured đạt. Không chuyển tiền, gửi thư thử hoặc tạo dữ liệu giả trong production.

## Giới hạn

Tháng đầu/tiền cọc, chu kỳ nhiều tháng/chuyển phòng chưa quyết toán giữ nghiệp vụ riêng của Electron. OCR chưa xác minh serial công tơ và không bảo đảm tuyệt đối mọi ảnh. Camera vật lý/Gmail Inbox chưa được thử bằng một giao dịch hoặc email thật trong lượt này.
