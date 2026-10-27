# Review luồng thật và khôi phục xác minh — 09/10/2026

## Luồng được chốt

Chụp điện → OCR → hiển thị ảnh/chỉ số cũ-mới/tiêu thụ → khách xác minh (có thể sửa số) → ghi nhận → chụp nước → xác minh → ghi nhận → lập hóa đơn → QR → SePay đối soát.

- OCR đạt chỉ tạo `tenant_meter_photos` chờ xác minh; không gọi RPC confirm trong request OCR.
- Ảnh không đạt, sai loại, nhiều công tơ, số thấp hơn số cũ hoặc vượt ngưỡng không được xác nhận.
- Thao tác confirm dùng token thuộc tài khoản/hợp đồng/kỳ/loại công tơ và còn hạn; RPC kiểm tra lại dưới khóa. Sửa số giữ nguồn `manual`.
- Backend chỉ trả thành công khi có token xác nhận hoặc ID hóa đơn hợp lệ. Kết quả concurrent đã có hóa đơn không giả thành công ghi số.
- Bộ đếm OCR thất bại, giới hạn nhập thủ công và phân quyền vẫn giữ nguyên.

## Lỗi phát hiện và đã sửa trong review

1. CSP chặn ảnh QR SePay: cho phép đúng host `https://qr.sepay.vn` trong img-src, giữ hạn chế camera cùng origin và các quyền khác.
2. Tài khoản BIDV ảo có chữ bị kiểm tra sai: nhận số tài khoản alphanumeric như cấu hình Electron/SePay; không bỏ chữ.
3. Poll cũ có thể làm mất refresh sau khi lưu: mutation chờ snapshot cũ rồi tải snapshot mới; poll không xóa cảnh báo lỗi nghiệp vụ.
4. Lập hóa đơn thất bại sau khi ghi nước: giữ chỉ số đã xác nhận, về summary để thử lập lại; không bắt chụp lại.
5. Ghi chú release cũ nói luồng thật chưa kết nối: cập nhật mô tả deployment để khớp hiện trạng.

## Bằng chứng

- `npm run build`/typecheck đạt; kiểm tra public bundle không có khóa riêng đạt.
- 36 regression checks: token, chờ xác minh, RPC lỗi/concurrent, sai loại công tơ, mức tăng, manual fallback, QR/recipient và security headers đạt.
- `qa/tenant-payment-database.json`: 21 SQL assertions trên project test riêng, rollback toàn bộ dữ liệu giả.
- `qa/tenant-payment-e2e.json`: Gemini thật đọc 12692 và 287; state trước confirm vẫn null, sau confirm đúng số; hóa đơn 4159400đ; create idempotent; sự kiện SePay test → paid → queue receipt. Schema tạm được dọn; không gửi email/chuyển tiền thật.
- Browser sandbox: hiện “Xác minh số điện”, chỉ số 12692 và 92 kWh; API state trước confirm trả electric_new=null, water_new=null, invoiceCount=0. Xác nhận điện mới sang nước. Nước hiện 00287 và 7 m³; bấm xác nhận mới lập hóa đơn 4159400đ.
- `qa/tenant-payment-restored-electric-review.png`: màn xác minh trên viewport 390×844.
- `qa/tenant-payment-flow-release.json`: production bundle giống byte-for-byte bản build đã kiểm thử, có cả nút xác nhận điện/nước, không còn autoConfirmed; ảnh mẫu đúng, CSP camera/QR đúng, request không đăng nhập trả 401, BIDV/Đỗ Kim Ngân đúng, schema test không còn.
- `qa/tenant-payment-production-verification.json`: health, CSRF 403, quyền RPC/bảng riêng tư, scheduler/mail worker đạt.
- `qa/tenant-payment-production-deployment.json`: chỉ deploy payment edge; không sửa schema, provider secrets hay tạo hóa đơn test trong production. Mail worker hiện có được giữ nguyên.

## Giới hạn kiểm chứng

Camera vật lý trên iPhone chưa được điều khiển trực tiếp trong review. HTTP LAN vẫn dùng camera gốc iOS và có hai nút native; production HTTPS có camera trong trang. OCR phụ thuộc dịch vụ Gemini và độ rõ ảnh, không bảo đảm mọi ảnh đọc đúng; màn xác minh đã khôi phục để khách đối chiếu. Không chuyển tiền thật hay gửi email test trong lần review này.
