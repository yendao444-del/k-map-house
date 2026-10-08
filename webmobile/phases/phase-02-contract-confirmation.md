# Phase 02 — Lập hợp đồng và xác nhận qua Gmail

Ngày cập nhật: 06/10/2026.

## Luồng đã chốt

1. Chọn phòng trống trong tab **Hợp đồng**.
2. Mở **trang lập hợp đồng** toàn màn hình; không mở popup nhập hợp đồng.
3. Chọn hồ sơ khách thuê đã tạo trên Electron. Tên, CCCD, ngày/nơi cấp, địa chỉ, số điện thoại và email lấy từ hồ sơ đó.
4. Nhập/kiểm tra giá thuê, tiền cọc, ngày vào, thời hạn, ngày chốt hóa đơn, số người ở và chỉ số điện/nước đầu kỳ.
5. Xem bản xem trước hợp đồng bên phải, gồm nội dung hợp đồng, thông tin phòng và tài sản bàn giao.
6. Lưu bản nháp. Bản nháp chưa kích hoạt hợp đồng, chưa đổi phòng sang Đang ở và chưa tạo hóa đơn.
7. Khi có website xác nhận công khai, bật **Gửi Gmail xác nhận**. Khách mở link, xem toàn bộ hợp đồng và xác nhận; sau xác nhận mới kích hoạt hợp đồng. Việc tạo/liên kết tài khoản website và gửi link kích hoạt chỉ chạy sau khi kích hoạt thành công, theo Phase 10.

## Bảo vệ dữ liệu

- `contract_drafts` là bảng riêng, mỗi phòng chỉ có một bản nháp đang mở.
- RLS chỉ cho quản trị viên đang hoạt động đọc/ghi.
- Cập nhật dùng `revision` để tránh ghi đè bản nháp thay đổi ở nơi khác.
- Snapshot không chứa ảnh CCCD, token SePay/Gmail, số dư ví hoặc lịch sử người thuê cũ.
- Database chặn phòng không còn trống, khách ngừng hoạt động, phòng/khách đã có hợp đồng active và snapshot sai room/tenant.
- Hủy bản nháp là trạng thái `cancelled`, không xóa vật lý.

## Trạng thái gửi Gmail

**Cập nhật 07/10/2026:** website người thuê đã có tại `https://pay.phongtroankhang.com`. Trang/API xác nhận hợp đồng và luồng Gmail vẫn chưa hoàn thiện; có domain chưa đủ để bật gửi xác nhận. Đoạn dưới ghi lại trạng thái khi bắt đầu phase. Luồng tài khoản tự động và đề xuất môi trường test xem `phase-10-automatic-tenant-account-lifecycle-and-test-environment.md`.

Website công khai chưa có nên nút gửi Gmail đang khóa có giải thích. Không gửi link giả hoặc link localhost cho khách. Khi có domain, cần chốt URL xác nhận, token một lần có hạn dùng, trạng thái `sent/viewed/confirmed/expired/revoked`, nhật ký gửi và API kích hoạt hợp đồng trước khi mở nút.

Quy hoạch website và hạ tầng được ghi trong `phase-03-webmobile-infrastructure.md`. Website người thuê có thể dùng subdomain `payment.ankhanghome.vn`, để dành domain chính cho website giới thiệu/home. Đây là ví dụ quy hoạch của người dùng, chưa xác nhận quyền sở hữu/khả dụng hay đăng ký domain. Link xác nhận hợp đồng thuộc website người thuê.

## Kiểm thử

- `webmobile/contract-draft.test.mjs`: 3 kiểm thử snapshot, ngày tháng và validation.
- `webmobile/contract-draft-database.test.cjs`: 3 kiểm thử RLS, revision, dữ liệu nhạy cảm, room/tenant guards và hủy bản nháp.
- `npm run typecheck` và `npm run build`: passed.
- Migration production `20261005210000_contract_drafts.sql` đã áp dụng; API schema đã xác nhận bảng và trigger guard tồn tại.
- QA trình duyệt với component thật và dữ liệu giả biệt lập: trang chọn phòng chỉ hiển thị phòng trống; chọn phòng mở trang lập hợp đồng; khách đang có hợp đồng không xuất hiện trong danh sách chọn.
- Đã kiểm tra hồ sơ tiếng Việt tự điền vào preview, thay đổi giá thuê/điện/nước/điều khoản cập nhật trong hợp đồng, lưu và mở lại giữ nguyên dữ liệu. Nút Gmail bị khóa đúng trạng thái; không có lỗi console.
- Ảnh kiểm tra: `webmobile/qa/contract-page.png`. Harness lưu trong localStorage riêng, không ghi Supabase và không gửi email.

## Cập nhật 07/10/2026 — TEST đã nối

Đã có backend xác nhận và website TEST riêng. Nút Gmail dùng kiểm tra backend/Gmail thực tế trong phiên Electron TEST thay vì khóa cứng. Xem `phase-11-contract-confirmation-test.md` để chạy; production chưa bật.
