# Kế hoạch bảo vệ dữ liệu trước khi sửa app đang vận hành

Ngày: 27/08/2026. Trạng thái: đề xuất, chưa kích hoạt dịch vụ trả phí hoặc thay đổi production.

## 1. Điều kiện trung thực

Không thể bảo đảm dữ liệu an toàn 100% trước mọi tình huống, bất kể ngân sách. Phải xác định phạm vi sự cố, mức mất dữ liệu cho phép, thời gian khôi phục và chứng minh bằng diễn tập. Không dùng cụm “an toàn 100%” để mô tả việc mới có file backup hoặc mới bật PITR.

Mục tiêu thiết kế ưu tiên: không mất giao dịch đã được hệ thống xác nhận thành công trong các kịch bản sự cố được xác định và kiểm thử; chấp nhận tạm dừng ghi nếu điều kiện bảo vệ không còn đáp ứng. Đây là tiêu chí cần xây dựng và nghiệm thu, CHƯA phải khả năng của hệ thống hiện tại.

Khả năng hoạt động liên tục, tính đúng đắn của số tiền, bảo mật thông tin và khả năng khôi phục là những vấn đề khác nhau. Backup không sửa được công thức tính sai, và sao chép đồng bộ vẫn có thể sao chép cả thao tác sai.

## 2. Hiện trạng đã kiểm tra

- Dự án `k-map-house` đang ACTIVE_HEALTHY, thuộc tổ chức `yenkingstore's Org`, gói Free.
- Chưa có development branch trong danh sách trả về. Chưa xác minh một môi trường staging độc lập khác đã tồn tại.
- Có file backup mã hóa local ngày 24/08/2026. Chưa chứng minh file này bao phủ đầy đủ database/Auth/Storage/cấu hình, chưa diễn tập phục hồi độc lập trong lượt làm việc này.
- Các file migration local có nội dung; tuy nhiên khôi phục phải lấy schema thực tế và lịch sử migration để đối chiếu, không mặc định local khớp toàn bộ production.
- Chưa bật PITR, tạo staging, mua lưu trữ, chạy migration hoặc sửa bản ghi production trong các lượt triển khai vừa rồi. CLI chỉ được kiểm tra phiên bản/hướng dẫn; đã cập nhật file cache phiên bản local `supabase/.temp/cli-latest`.
- Những rủi ro của bản hiện hành vẫn còn; xem [báo cáo audit](<G:/PHONG TRO/app/phase/APP-REVIEW-2026-08-27.md>).

Theo [bảng giá Supabase](https://supabase.com/pricing), Free không bao gồm automatic backups/PITR. Đây là thiếu hụt cần giải quyết trước khi coi hệ thống có khả năng phục hồi production đã được bảo đảm.

## 3. Các lớp bảo vệ đề xuất

### A. Bản sao đầy đủ, không chỉ xuất các bảng nghiệp vụ

Phạm vi cần kiểm kê và phục hồi:

- Schema, bảng/dữ liệu, sequences, constraints, indexes, functions, triggers, RLS, grants và lịch sử migration.
- Dữ liệu Auth cần thiết để phục hồi tài khoản; không chỉ danh sách profile hoặc kết quả API list users.
- File ảnh/tài liệu trong Storage, manifest đường dẫn/phiên bản/checksum và cấu hình bucket.
- Edge Functions, cấu hình Auth/redirect/provider, công việc nền và tích hợp; secrets lưu trong kho riêng được bảo vệ.
- Source đang sử dụng, phiên bản bộ cài, cấu hình triển khai và quy trình phục hồi.

Database backup của Supabase **không chứa file Storage**, chỉ chứa metadata; phải có lớp sao lưu file riêng. Xem [Database Backups](https://supabase.com/docs/guides/platform/backups).

### B. Nhiều bản sao độc lập

- Production và khả năng khôi phục theo thời điểm tại nhà cung cấp.
- Bản sao mã hóa ngoài nhà cung cấp/tài khoản production, có khóa chống sửa/xóa trong thời gian lưu giữ.
- Bản sao offline hoặc kho độc lập thứ ba, cùng kiểm tra tính toàn vẹn định kỳ.
- Khóa giải mã có phương án lưu giữ/khôi phục riêng; mất cả khóa thì backup mã hóa không dùng được. Không đặt khóa trong bộ cài, repository hoặc cùng quyền truy cập ứng dụng.
- Tài khoản backup tách khỏi tài khoản chạy app; app không có quyền xóa backup. Tài khoản quản trị bật MFA và có thủ tục phục hồi khi người phụ trách vắng mặt.

Khóa lưu trữ bất biến có thể ngăn sửa/xóa phiên bản trong thời gian lưu giữ; không tự bảo vệ khỏi mất khóa, cấu hình sai trước khi khóa hoặc dữ liệu vốn đã sai. Ví dụ cơ chế [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html). Chưa chọn nhà cung cấp hoặc mua dịch vụ.

### C. Không coi PITR là cam kết không mất giao dịch mới nhất

PITR giúp khôi phục theo thời điểm trong cửa sổ lưu giữ. Nó không tự chứng minh mọi giao dịch vừa xác nhận đã có bản sao ngoài miền sự cố.

Nếu mục tiêu bắt buộc là không mất giao dịch đã xác nhận khi một máy chủ/miền sự cố mất hoàn toàn, cần thẩm định kiến trúc ghi bền đồng bộ hoặc quorum, và chỉ báo thành công sau khi đạt điều kiện bền vững. Khi không đạt điều kiện thì dừng xác nhận ghi, không âm thầm chuyển sang chế độ bảo vệ yếu hơn.

Không giả định Supabase hiện tại cung cấp sẵn cấu hình này. Không tự chuyển database hoặc triển khai hai lần ghi riêng rẽ và gọi đó là “đồng bộ an toàn”. Cần thiết kế giao dịch, chống lặp, failover và tránh hai máy chủ cùng nhận ghi, rồi thử lỗi thực tế. [PostgreSQL giải thích khác biệt giữa sao chép bất đồng bộ và đồng bộ](https://www.postgresql.org/docs/current/warm-standby.html#SYNCHRONOUS-REPLICATION).

### D. Bảo vệ tính đúng đắn của tiền

- Thu/hoàn/điều chỉnh có lịch sử không bị ghi đè; thay đổi sai phải có phiếu điều chỉnh/đảo riêng.
- Mỗi thao tác có mã chống lặp; mất mạng rồi gửi lại không tạo khoản thu lần hai.
- Chuyển phòng/tất toán thực hiện trong giao dịch database: hoàn tất toàn bộ hoặc không thay đổi gì.
- Đối soát ngân hàng, tiền mặt, cọc, công nợ và số dư. Không tự suy diễn giao dịch tiền mặt từ sao kê.
- Giữ nguyên 8 hóa đơn đã hủy có lịch sử thanh toán cho đến khi đối soát và được chủ dữ liệu duyệt cách xử lý.

## 4. Quy trình triển khai nhiều chốt kiểm soát

### Bước 1 — Lập bản sao và chứng minh có thể khôi phục

1. Xác định đầy đủ các nguồn dữ liệu và các nơi đang ghi: tất cả máy app, SePay, tác vụ nền, thao tác Dashboard/API.
2. Tạo snapshot nhất quán và bản sao file tương ứng; có mốc thời gian/điểm chốt rõ ràng. Việc đọc nhiều bảng qua REST lần lượt không tự tạo snapshot transaction nhất quán và không thay cho backup đầy đủ.
3. Khôi phục vào môi trường cách ly. Không ghi đè production để thử backup.
4. So sánh dữ liệu/checksum theo mốc snapshot, khóa chính, số bản ghi, quan hệ, tổng thu/chi/cọc/nợ và manifest file; thử đăng nhập và các luồng đọc.
5. Tắt/cách ly email, webhook, SePay và tác vụ nền trên bản thử để không phát sinh hành động thật. Dữ liệu khách trên bản thử vẫn phải được bảo vệ như production.

Supabase có chức năng phục hồi sang dự án mới, nhưng không sao chép đầy đủ Storage, Edge Functions hay cấu hình Auth; cần kiểm tra/bổ sung riêng. Xem [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project).

**Chốt:** chưa phục hồi thành công và đối chiếu đạt thì không chạy migration production.

### Bước 2 — Sửa và kiểm thử trên bản riêng

- Bản sửa không dùng credential production khi chạy test.
- Thử mất mạng, gửi lặp, hai nhân viên thao tác đồng thời, lỗi giữa quá trình, app cũ và mới cùng kết nối.
- Kiểm thử quyền người chưa đăng nhập, nhân viên, admin và người đã bị vô hiệu hóa.
- Diễn tập mất máy chủ/kho file/tài khoản và khôi phục; ghi lại mức mất dữ liệu và thời gian thực đo.

**Chốt:** các ca thu/hoàn, cọc, hủy/gộp hóa đơn, chuyển phòng và tất toán phải đạt trước khi phát hành.

### Bước 3 — Chuyển đổi có kiểm soát

- Chủ dữ liệu duyệt danh sách thay đổi và cửa sổ bảo trì trước.
- Tạm dừng ghi trong thời điểm chốt nếu cần; đóng tất cả đường ghi, không chỉ một cửa sổ app. Giao dịch ngân hàng đến trong thời gian đó phải được giữ ở nguồn và nhập lại bằng mã chống lặp sau đối soát.
- Snapshot cuối, kiểm tra lại khả năng khôi phục và bản app cũ.
- Ưu tiên thêm schema/hàm tương thích; không drop bảng/cột, truncate hoặc sửa hàng loạt lịch sử tiền.
- Đối chiếu dữ liệu không đổi đối với migration chỉ thay schema/quyền. Mở lại sau khi đạt kiểm tra.
- Không tự động phát hành/cập nhật mọi máy trong khi người dùng đang chốt tiền.

**Chốt:** không có phép so sánh/khôi phục rõ ràng thì dừng triển khai; không thử trực tiếp trên dữ liệu đang hoạt động.

### Bước 4 — Hoàn tác không làm mất giao dịch mới

- Ưu tiên quay lại phiên bản app tương thích thay vì phục hồi database đè lên bản đang có dữ liệu mới.
- Nếu phải phục hồi database: dừng ghi, lưu lại trạng thái hiện tại và các giao dịch sau mốc backup, phục hồi sang nơi riêng, đối chiếu/replay chống lặp, rồi mới chuyển kết nối theo kế hoạch được duyệt.
- Không dùng “restore backup cũ” như nút hoàn tác tự động; cách đó có thể xóa các giao dịch phát sinh sau backup.

### Bước 5 — Vận hành và nghiệm thu

- Giám sát tuổi backup, khoảng phục hồi thực tế, lỗi sao lưu/file thiếu, độ trễ bản sao và sai lệch sổ tiền; có người chịu trách nhiệm tiếp nhận cảnh báo.
- Diễn tập khôi phục định kỳ và trước thay đổi lớn; kiểm tra được cả khi mất máy/tài khoản vận hành thường ngày.
- Định nghĩa phạm vi sự cố và đo RPO (khoảng dữ liệu có thể mất) / RTO (thời gian khôi phục). RPO 0 chỉ được ghi nhận cho kịch bản đã chứng minh, không áp dụng vô điều kiện cho mọi thảm họa.
- Chính sách lưu giữ và lịch kiểm tra được chủ dữ liệu duyệt. Chưa tạo lịch tự động/monitor hay bật bất kỳ dịch vụ nào trong lượt lập phương án này.

## 5. Ngân sách tham khảo, không phải báo giá đã duyệt

Giá công khai kiểm tra ngày 27/08/2026:

| Thành phần | Chi phí tham khảo |
| --- | ---: |
| Supabase Pro | Từ 25 USD/tháng |
| Compute Small cho production | Khoảng 15 USD/tháng, PITR yêu cầu ít nhất Small |
| Compute credit của gói trả phí | Trừ 10 USD/tháng theo điều kiện gói |
| Staging Micro | Từ 10 USD/tháng; bản clone có thể dùng cấu hình lớn hơn |
| PITR lưu 28 ngày | Khoảng 400 USD/tháng |
| Tổng nền tảng theo cấu hình trên | Khoảng 440 USD/tháng |

Các mức compute/gói/credit theo [bảng giá Supabase](https://supabase.com/pricing); mức PITR và yêu cầu Small theo [tài liệu backup](https://supabase.com/docs/guides/platform/backups). Chưa gồm thuế, vượt hạn mức, lưu trữ ngoài, backup offline, hạ tầng đồng bộ, giám sát hay nhân sự vận hành. Giá thực tính theo giờ và cấu hình xác nhận tại thời điểm bật.

Đây **chỉ là ngân sách nền tảng backup/staging, không phải giá mua cam kết RPO 0 hoặc an toàn 100%**. Kiến trúc không mất giao dịch đã xác nhận cần thẩm định khả năng nhà cung cấp và dự toán riêng; không thể báo giá chính xác khi chưa chọn hạ tầng và phạm vi sự cố.

## 6. Các quyết định cần chủ dữ liệu xác nhận

1. Chấp nhận tiêu chí đo được và diễn tập thay cho lời hứa “100% trong mọi tình huống”.
2. Xác nhận tổ chức `yenkingstore's Org` là nơi triển khai production/staging trả phí.
3. Duyệt cấu hình và chi phí thực tế trước khi tạo tài nguyên/nâng gói; chọn nơi lưu backup độc lập và người giữ khóa.
4. Duyệt khung bảo trì có thể tạm ngừng ghi và người phụ trách đối soát khi triển khai.

Trong khi chưa hoàn thành các chốt trên, không thay đổi production để triển khai bản sửa nghiệp vụ. Hiện trạng này không có nghĩa bản cũ đã an toàn; các lỗ hổng đã phát hiện vẫn cần được xử lý theo quy trình bảo vệ trước.
