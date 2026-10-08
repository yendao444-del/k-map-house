# Đối soát ví một lần và bảo vệ số dư

## Trạng thái

Migration đã áp dụng lên Supabase project `wtrycmiojsiliyjxsewz` ngày 05/10/2026,
được ghi vào bảng theo dõi migrations. Bản đối soát một lần đã được tạo theo xác
nhận của chủ tài khoản: BIDV **6.814.063 đ**, tiền mặt **0 đ**, tổng **6.814.063 đ**.
Đã khóa 224 mã lịch sử trước mốc chốt, giữ nguyên 82 giao dịch thủ công và 195 hóa đơn.

### Mốc vận hành mới — nguồn số dư đang dùng

Theo yêu cầu dùng sổ giao dịch kỳ vận hành, migration
`20261005140000_wallet_accounting_basis.sql` đã được áp dụng sau bản chốt trên.
Mốc tính là **01/10/2026**. Khoản điện 2.954.124 đ được phân loại vào BIDV vì
quỹ tiền mặt thực tế bằng 0; phân loại này lưu riêng, không ghi đè chứng từ.
Bản chốt cũ vẫn được lưu nhưng **không còn là nguồn số dư**. Ví, kiểm tra chi,
và chuyển giữa các ví cùng dùng tổng giao dịch từ mốc mới (không tự reset tháng).

Kết quả xác nhận trực tiếp trên database: BIDV **7.834.876 đ**, tiền mặt **0 đ**,
tổng **7.834.876 đ**, `wallet_guard_version()` = **2**. Không tạo thu/chi bù;
các giao dịch/hóa đơn và checkpoint cũ giữ nguyên. Các bước đối soát bên dưới
là quy trình cũ, không áp dụng lại cho project đã có mốc vận hành mới.

Lỗi kết nối ban đầu là token môi trường khác token đúng trong `.env`; triển khai
đã dùng cấu hình workspace. Các bài kiểm thử database chạy trong PostgreSQL WASM
(PGlite) biệt lập, không tạo giao dịch thử trên production.

## Áp dụng

Quy trình dưới đây dành cho môi trường khác; **không chạy lại trên project đã chốt**.

1. Sao lưu database hiện tại trước khi áp dụng migration.
2. Chạy `supabase/migrations/20261005120000_wallet_reconciliation_and_guards.sql`
   trong SQL Editor của đúng Supabase project. File tự bao trong một transaction.
   Không chạy lại nếu đã áp dụng thành công.
3. Mở phiên bản app mới, đăng nhập quản trị viên, vào **Tài chính > Ví > Đối soát ngay**.
4. Kiểm tra tổng sổ vẫn là **6.814.063 đ**. Nếu đã có giao dịch mới làm tổng thay đổi,
   app/database sẽ chặn; không ép chạy hoặc tạo khoản bù.
5. Xác nhận BIDV **6.814.063 đ**, tiền mặt **0 đ**, chọn ô xác nhận rồi bấm
   **Xác nhận và khóa**. Đây là sửa phân bổ sổ, không phải chuyển tiền thật.

Chỉ có một bản đối soát, lưu người xác nhận, thời điểm, số trước/sau, lý do và
danh sách mã giao dịch cũ. Tổng tiền không đổi. Không sửa/xóa dữ liệu cũ và không
tạo thu/chi kinh doanh. Gửi lại cùng yêu cầu trả bản đã có, không điều chỉnh lặp.

## Bảo vệ sau chốt

- Mỗi khoản chi dùng một ví; thiếu tiền phải ghi chuyển ví thật trước khi chi.
- Trigger database kiểm tra mọi thay đổi ảnh hưởng số dư (thu/chi, hoàn cọc,
  sửa/xóa giao dịch, hủy hóa đơn, thay lịch sử thanh toán).
- Khóa chung ở database tuần tự hóa các thao tác ghi. Kết quả âm bị từ chối và
  toàn bộ thao tác được rollback; không tự đổi nguồn và không cộng gộp ví.
- Chuyển ví ghi hai phần trong một transaction, có mã chống ghi lặp; không được
  sửa/xóa riêng từng phần.
- Mã giao dịch trước mốc chốt đã khóa. Không được sửa số dư đầu kỳ sau chốt.
- App từ chối ghi luồng tài chính nếu database chưa có migration bảo vệ, thay vì
  cho thao tác bằng kiểm tra giao diện không đủ an toàn.

## Kiểm thử

`node --test scripts/wallet-accounting.test.cjs scripts/invoice-payment-flow.test.mjs scripts/performance-cache.test.cjs scripts/investment-funding.test.mjs scripts/investment-wallet.test.mjs`

Kiểm thử database cần `@electric-sql/pglite`, cài ở thư mục tạm riêng (không thêm
runtime vào app). Đặt `WALLET_PGLITE_MODULE` tới module đó rồi chạy:

`node --test scripts/wallet-database.test.cjs`

Không dùng bài kiểm thử này với production. Cần kiểm tra thêm schema và migration
trên Supabase staging trước rollout nếu schema thực tế khác schema chuẩn.
