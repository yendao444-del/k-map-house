# Rà soát bảo mật, tiền và thông tin — AN KHANG HOME / DBY HOME

Ngày kiểm tra: 27/08/2026. Phiên bản trong package.json: 1.0.66.

## Kết luận

Có các vấn đề ưu tiên cao về cấp quyền tài khoản, tính tiền cọc/hóa đơn và tính nhất quán khi chuyển phòng/tất toán. Nên xử lý các mục P1 trước khi phát hành tiếp hoặc dựa hoàn toàn vào những chức năng bị ảnh hưởng để chốt tiền.

Đáng chú ý nhất: Supabase đang bật đăng ký email công khai, tài khoản mới mặc định được kích hoạt, và tài khoản kích hoạt có quyền đọc/sửa dữ liệu nghiệp vụ. Ngoài ra, dữ liệu hiện tại có **8 hóa đơn đã hủy vẫn chứa bản ghi thanh toán**, trong khi các báo cáo tiền loại bỏ hóa đơn đã hủy.

Đây không phải kết luận đã xảy ra xâm nhập hay thất thoát tiền. Các số tiền trong ví dụ bên dưới là dữ liệu giả lập, không phải số tiền thất thoát được xác nhận trên production.

## Phạm vi và cách kiểm tra

- Đọc mã Electron main/preload, React, đăng nhập/phân quyền, phòng/khách thuê/hợp đồng, hóa đơn/cọc/thu chi/SePay, tài sản, AI định giá, cập nhật và cấu hình đóng gói.
- Đối chiếu Supabase dự án khớp cấu hình ứng dụng: Auth settings, RLS, quyền cột, trigger, hàm thanh toán, Storage, migrations và truy vấn đếm bất thường. Chỉ đọc; không đăng ký tài khoản thử, không sửa dữ liệu, không thu/hoàn tiền, không tải lên/xóa file Storage.
- Thực thi các hàm TypeScript thực tế được biên dịch trong bộ nhớ với Supabase giả lập, gồm mô phỏng lỗi ở giữa chuỗi thao tác. Không dùng giao dịch thật để thử lỗi.
- Kiểm tra gói local `dist/win-unpacked` và nội dung ZIP portable 1.0.66. Không xác minh trực tiếp phiên bản đang chạy trên máy production khác.
- Không sửa mã ứng dụng, cấu hình Supabase hoặc các thay đổi có sẵn trong worktree. Chỉ thêm báo cáo này.

P1: cần sửa ưu tiên cao. P2: vấn đề cụ thể cần sửa tiếp, ảnh hưởng phụ thuộc luồng sử dụng.

## Các phát hiện ưu tiên cao

### F01 — P1: Đăng ký công khai tự cấp quyền vào dữ liệu nội bộ

**Vị trí:** [AUTH-PROFILE-SCHEMA.sql:8](<G:/PHONG TRO/app/AUTH-PROFILE-SCHEMA.sql:8>), [trigger tạo profile:37](<G:/PHONG TRO/app/AUTH-PROFILE-SCHEMA.sql:37>), [chính sách nghiệp vụ:90](<G:/PHONG TRO/app/phase/SECURITY-P0-MIGRATION.sql:90>).

**Đã xác nhận trực tiếp:** `disable_signup=false`, provider email bật, yêu cầu xác minh email. Trigger `handle_auth_user_created` tự chèn profile, mặc định `role=user`, `status=active`. RLS các bảng nghiệp vụ chỉ yêu cầu người dùng đang `active`, không yêu cầu tài khoản do quản trị viên mời/phê duyệt.

**Ảnh hưởng:** một tài khoản tự đăng ký, sau khi hoàn tất xác minh email và đăng nhập, được đối xử như nhân viên đã được cấp quyền; có thể đọc/sửa dữ liệu phòng, khách thuê, hợp đồng và hóa đơn. Việc không có nút đăng ký trong giao diện không chặn được API đăng ký.

**Hướng sửa:** nếu đây là ứng dụng nội bộ, tắt đăng ký công khai; giữ luồng tạo/mời tài khoản của admin. Đồng thời thay mặc định cấp quyền bằng trạng thái chờ phê duyệt hoặc cơ chế cấp quyền server-side. Rà soát tài khoản đã được tạo; không tự xóa tài khoản khi chưa xác định chủ sở hữu.

**Giới hạn:** chưa tạo tài khoản để thử trọn luồng gửi email, chưa xác nhận có người ngoài đã truy cập. Ý nghĩa của đăng ký/xác minh email đối chiếu theo [tài liệu cấu hình Auth của Supabase](https://supabase.com/docs/guides/auth/general-configuration).

### F02 — P1: Có thể sửa trực tiếp trạng thái/số tiền thanh toán, bỏ qua sổ giao dịch

**Vị trí:** [SECURITY-P0-MIGRATION.sql:92](<G:/PHONG TRO/app/phase/SECURITY-P0-MIGRATION.sql:92>); giới hạn chỉ ở UI tại [InvoicesTab.tsx:1223](<G:/PHONG TRO/app/src/renderer/src/components/InvoicesTab.tsx:1223>).

**Đã xác nhận trực tiếp:** tài khoản `authenticated` có quyền INSERT/UPDATE các cột `total_amount`, `paid_amount`, `payment_status`, `payment_records`; RLS chỉ kiểm tra `active`. Không có trigger nghiệp vụ trên bảng hóa đơn để chặn đường ghi này.

**Ảnh hưởng:** tài khoản thường có thể gọi API để sửa/hủy hóa đơn đã thu hoặc thay lịch sử/số tiền thanh toán, dù UI giới hạn một số thao tác cho admin. Việc này không bắt buộc tạo `payment_events`, không đi qua kiểm tra số tiền và khóa chống đối soát trùng của `record_invoice_payment_atomic`.

**Hướng sửa:** giới hạn ghi cột tiền/trạng thái ở database; thực hiện thu, hoàn, hủy và sửa tiền qua các hàm server có kiểm tra quyền, lưu người thao tác và lịch sử bất biến. Không chỉ thêm điều kiện ở UI.

### F03 — P1: Sửa hóa đơn có thể xóa phần công nợ và biến phải thu thành phải hoàn

**Vị trí:** [EditInvoiceModal.tsx:93](<G:/PHONG TRO/app/src/renderer/src/components/EditInvoiceModal.tsx:93>), phần lưu tại dòng 102.

**Nguyên nhân:** tổng tiền khi lưu chỉ cộng tiền phòng, Wi-Fi, rác, điện, nước, cọc và điều chỉnh. Công thức bỏ `old_debt`, `merged_debt_total` và các khoản chuyển phòng, dù các trường đó vẫn nằm trên hóa đơn. Hóa đơn tất toán chưa thu có thể mở trong modal này.

**Tái hiện:** tiền phòng 1 triệu + nợ gộp 5 triệu − cọc 3 triệu = phải thu 3 triệu. Mở sửa và lưu, kể cả chỉ sửa ghi chú, tổng được tính lại thành **−2 triệu**, tức phải hoàn.

**Hướng sửa:** một hàm tính tổng dùng chung cho mọi loại hóa đơn, bảo toàn đủ thành phần; xác thực lại ở server. Cần ca kiểm thử cho hóa đơn thường, tất toán, chuyển phòng và hóa đơn âm.

### F04 — P1: Hoàn cọc rồi nhưng hệ thống vẫn tính là đang giữ cọc

**Vị trí:** [db.ts:63](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:63>), đặc biệt bộ lọc dòng 67–69; dùng khi tất toán tại dòng 660.

**Nguyên nhân:** `getCollectedDepositAmount` bỏ qua hóa đơn có `deposit_amount` âm; nhánh `deposit_pre_collected` trả thẳng tiền cọc hợp đồng. Tiền đã hoàn không được trừ khỏi số dư cọc.

**Tái hiện:** đã thu 3 triệu, sau đó đã hoàn đủ 3 triệu; hàm vẫn trả **đang giữ 3 triệu**, thay vì 0. Lần hoàn/tất toán sau có thể đề xuất hoàn hoặc cấn trừ lại cùng khoản cọc.

**Hướng sửa:** tính số dư cọc ròng theo hợp đồng từ thu, hoàn, khấu trừ và cấn trừ; không dùng tổng cọc dương làm số dư.

**Dữ liệu hiện tại:** truy vấn đếm bảo thủ chưa thấy hợp đồng đang active có bản ghi hoàn cọc thỏa điều kiện kiểm tra. Điều này không phủ định lỗi đã tái hiện, cũng không chứng minh đã có lần hoàn hai lần.

### F05 — P1: Hủy/gộp hóa đơn làm tiền đã thu biến mất khỏi báo cáo

**Vị trí:** [CashFlowTab.tsx:339](<G:/PHONG TRO/app/src/renderer/src/components/CashFlowTab.tsx:339>), [WalletTab.tsx:199](<G:/PHONG TRO/app/src/renderer/src/components/WalletTab.tsx:199>), [BusinessReport.tsx:738](<G:/PHONG TRO/app/src/renderer/src/components/BusinessReport.tsx:738>).

**Nguyên nhân:** các báo cáo bỏ toàn bộ hóa đơn `cancelled` hoặc `merged`, bao gồm bản ghi tiền từng thu. Khi tất toán, hóa đơn gốc có thể đã thu một phần; hệ thống chỉ gộp phần còn nợ, không chuyển lịch sử tiền đã thu sang hóa đơn mới.

**Tái hiện:** hóa đơn 3 triệu đã thu 1 triệu. Trước gộp, báo cáo ghi thu 1 triệu; sau gộp, khoản thu trở thành **0**, dù không phát sinh hoàn tiền.

**Đã thấy trên dữ liệu thật:** có **8 hóa đơn `cancelled` có bản ghi thanh toán số tiền khác 0**, bị điều kiện báo cáo trên loại bỏ. Không thấy hóa đơn `merged` có bản ghi tiền trong phép đếm hiện tại. Cần đối soát 8 trường hợp với thực tế và các phiếu bù/hoàn; chưa suy ra số tiền thất thoát.

**Hướng sửa:** báo cáo dòng tiền từ sổ giao dịch thu/chi độc lập với trạng thái hóa đơn. Hủy/điều chỉnh phải có giao dịch đảo hoặc bút toán điều chỉnh rõ ràng, không làm biến mất lịch sử.

### F06 — P1: Thu nợ hóa đơn cũ làm lùi chỉ số điện/nước

**Vị trí:** [db.ts:1026](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:1026>); chỉ số dùng cho kỳ sau tại [InvoiceModal.tsx:242](<G:/PHONG TRO/app/src/renderer/src/components/InvoiceModal.tsx:242>).

**Nguyên nhân:** mỗi hóa đơn không phải tất toán khi chuyển sang đã thu sẽ ghi đè chỉ số phòng bằng chỉ số trên hóa đơn đó, không kiểm tra kỳ mới hơn hay hợp đồng hiện tại. Hóa đơn chỉ thu cọc cũng nằm trong nhánh này. Không có trigger database bù lại hành vi này.

**Tái hiện:** phòng đang ở chỉ số 300; thu muộn hóa đơn cũ kết thúc ở 200 làm chỉ số phòng về **200**. Chốt kỳ tiếp ở 350 sẽ tính 150 đơn vị thay vì 50.

**Hướng sửa:** quản lý mốc chỉ số theo lịch sử chốt kỳ, không theo thứ tự khách thanh toán; chặn cập nhật ngược kỳ và tách hóa đơn cọc khỏi luồng đồng hồ.

### F07 — P1: Chuyển phòng chưa chuyển sổ cọc/công nợ và có thể báo thành công dù hỏng giữa chừng

**Vị trí:** [db.ts:793](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:793>); cam kết UI tại [ChangeRoomModal.tsx:433](<G:/PHONG TRO/app/src/renderer/src/components/ChangeRoomModal.tsx:433>).

**Nguyên nhân:** `changeRoom` chỉ thực hiện bốn lần ghi phòng/hợp đồng. Không tạo hóa đơn điện nước cuối phòng cũ, không chuyển liên kết cọc đã thu/công nợ, không cập nhật `rooms.base_rent` theo giá mới; cả bốn lần ghi đều bỏ qua `{error}` của Supabase. Không có trigger production thực hiện thay các bước thiếu.

**Tái hiện thành công:** với cọc thu bằng hóa đơn, không phải nhánh cọc nhập sẵn, cọc đã ghi nhận 3 triệu ở phòng cũ trở thành **0** khi tính cọc cho hợp đồng mới; không phát sinh thao tác hóa đơn; giá trên phòng vẫn 2,5 triệu trong khi hợp đồng mới là 3,5 triệu.

**Tái hiện lỗi INSERT hợp đồng:** phòng cũ đã trống, hợp đồng cũ đã đóng, phòng mới bị đánh dấu có người nhưng **không có hợp đồng active**; hàm không ném lỗi, UI có thể báo thành công.

**Hướng sửa:** một thao tác chuyển phòng có giao dịch database bao trọn, kiểm tra phòng đích, chốt chỉ số/phí, chuyển nghĩa vụ cọc/nợ và cập nhật thông tin đồng bộ. Chỉ báo thành công khi mọi bước hoàn tất.

### F08 — P1: Lưu kiểm kê trả phòng hai lần làm khấu trừ tài sản hai lần

**Vị trí:** [TerminateContractModal.tsx:245](<G:/PHONG TRO/app/src/renderer/src/components/TerminateContractModal.tsx:245>); lưu từng đợt tại [AssetsTab.tsx:466](<G:/PHONG TRO/app/src/renderer/src/components/AssetsTab.tsx:466>) và [db.ts:1231](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:1231>).

**Nguyên nhân:** mở lại kiểm kê rồi lưu sẽ INSERT thêm một đợt snapshot có ID mới. UI tài sản hiển thị lần mới nhất, nhưng tất toán cộng tất cả các lần của hợp đồng hiện tại.

**Tái hiện:** hư hại 500.000 đồng, lưu rồi mở lại và lưu không đổi → tiền khấu trừ khi tất toán thành **1.000.000 đồng**. Sửa lần sau về 0 cũng không xóa khoản 500.000 cũ khỏi tổng.

**Hướng sửa:** dùng phiên bản đánh giá hiện hành theo tài sản/hạng mục, tách lịch sử chỉnh sửa khỏi giá trị dùng để tính tiền. Phép đếm hiện tại chưa thấy nhóm snapshot khấu trừ dương lặp trong dữ liệu thật.

### F09 — P1: Tất toán không nguyên tử, lỗi giữa chừng tạo công nợ kép và chặn thử lại

**Vị trí:** [db.ts:740](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:740>); tạo hóa đơn bắt đầu dòng 701, kiểm tra hóa đơn đã có tại dòng 661.

**Nguyên nhân:** INSERT hóa đơn tất toán, gộp các hóa đơn nguồn và đổi trạng thái phòng/hợp đồng là các yêu cầu độc lập. Không rollback toàn bộ nếu một bước sau thất bại.

**Tái hiện:** tạo tất toán 3 triệu thành công, bước gộp hóa đơn nợ 3 triệu bị lỗi → cả hai còn phải thu, tổng hiện **6 triệu**. Thử lại bị chặn vì đã có hóa đơn tất toán.

**Hướng sửa:** RPC server dùng transaction và khóa các hợp đồng/hóa đơn liên quan; tính nợ tại thời điểm ghi; dùng khóa chống lặp để thử lại an toàn. Hàm atomic payment hiện tại không bao trùm luồng tất toán này.

## Các vấn đề cần sửa tiếp

### F10 — P2: Storage cho phép tải ảnh lên khi chưa đăng nhập

**Vị trí cấu hình:** policy live `Allow public upload room-images` trên `storage.objects`; mã sử dụng tại [db.ts:1637](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:1637>).

Policy INSERT dành cho `public`, chỉ kiểm tra `bucket_id='room-images'`, không kiểm tra người dùng. Bucket công khai, giới hạn 5 MiB/file và MIME `image/*`, nhưng không hạn chế chủ thể tải lên. Người ngoài có thể dùng dung lượng/băng thông và lưu nội dung ảnh không thuộc ứng dụng.

Nên giới hạn người dùng active và đường dẫn/chủ sở hữu phù hợp. [Supabase xác nhận upload mới chỉ cần quyền INSERT](https://supabase.com/docs/guides/storage/security/access-control). Có policy DELETE rộng tương tự, nhưng thiếu SELECT policy nên **không khẳng định đã có đường xóa ảnh ẩn danh hoạt động**. Không thử tải lên hoặc xóa file thật.

### F11 — P2: CCCD/email khách cũ có thể hiển thị dưới tên khách mới

**Vị trí:** [db.ts:512](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:512>), nhánh trả phòng dòng 759; nơi hiển thị [RoomDetailsModal.tsx:707](<G:/PHONG TRO/app/src/renderer/src/components/RoomDetailsModal.tsx:707>).

Thông tin CCCD/email có thể lưu trên bản ghi phòng, nhưng trả/chuyển/nhận phòng chỉ xóa hoặc thay tên và số điện thoại. Khách mới kế thừa các trường định danh cũ. Đã thấy trường định danh phòng đích còn nguyên trong phép thử chuyển phòng giả lập.

Nên lấy thông tin người đang ở qua `tenant_id`, hoặc thay/xóa đầy đủ mọi trường người ở trong cùng giao dịch lifecycle.

### F12 — P2: Bỏ chọn “Ghi nhớ đăng nhập” vẫn lưu phiên

**Vị trí:** [LoginScreen.tsx:191](<G:/PHONG TRO/app/src/renderer/src/components/LoginScreen.tsx:191>), checkbox tại dòng 340; [supabase.ts:34](<G:/PHONG TRO/app/src/renderer/src/lib/supabase.ts:34>).

`rememberMe` chỉ đổi giao diện, không được truyền vào logic đăng nhập/lưu phiên. Supabase client dùng mặc định `persistSession=true`; đóng và mở app có thể tự đăng nhập lại dù người dùng đã bỏ chọn. Rủi ro rõ nhất trên máy dùng chung. Cần triển khai lưu phiên tạm hoặc bền đúng lựa chọn.

### F13 — P2: Đăng xuất gặp lỗi mạng thì vẫn để nguyên dữ liệu và phiên

**Vị trí:** [App.tsx:1611](<G:/PHONG TRO/app/src/renderer/src/App.tsx:1611>), [db.ts:1586](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:1586>).

UI đợi `signOutUser` thành công rồi mới xóa cache/currentUser. Khi remote logout lỗi, SDK hiện tại chưa xóa phiên local, hàm ném lỗi trước khi UI khóa. Kiểm thử giả lập lỗi mạng cho kết quả `cacheCleared=false`, người dùng vẫn đăng nhập trên giao diện.

Cần khóa giao diện và dọn trạng thái/phiên local ngay cả khi thu hồi phiên từ xa lỗi; xử lý lỗi thu hồi riêng. Chỉ chuyển `scope` sang `local` chưa đủ với đường xử lý lỗi của SDK đang cài.

### F14 — P2: Tài khoản đã vô hiệu hóa vẫn đọc được danh bạ và thông tin chủ nhà/ngân hàng

**Vị trí:** [AUTH-PROFILE-SCHEMA.sql:88](<G:/PHONG TRO/app/AUTH-PROFILE-SCHEMA.sql:88>), [SECURITY-P0-MIGRATION.sql:69](<G:/PHONG TRO/app/phase/SECURITY-P0-MIGRATION.sql:69>), [db.ts:1464](<G:/PHONG TRO/app/src/renderer/src/lib/db.ts:1464>).

Hai policy SELECT trên `users` và `app_settings` cho mọi `authenticated` đọc bằng điều kiện `true`. Vô hiệu hóa chỉ sửa trạng thái profile, không khóa Supabase Auth. Do đó người bị vô hiệu hóa còn có thể dùng JWT/đăng nhập trực tiếp để đọc những bảng này. Các bảng nghiệp vụ khác có chặn `inactive` đúng; không khẳng định họ vẫn đọc được tất cả dữ liệu.

Nên kiểm tra active khi đọc settings và thiết kế quyền đọc users theo self/admin sao cho không phá các kiểm tra role nội bộ.

### F15 — P2: Gói phát hành kèm ảnh báo cáo nội bộ và backup không cần thiết

**Vị trí:** [electron-builder.yml:5](<G:/PHONG TRO/app/electron-builder.yml:5>).

Cấu hình đóng gói dùng danh sách loại trừ nhưng bỏ sót `tmp-product-design`, `_backups`, `_backup_work`. Đã xác nhận các thư mục này nằm trong `dist/win-unpacked/resources/app` và ZIP portable 1.0.66; ảnh bao gồm màn hình bảng giá/cọc/phòng và báo cáo tài chính nội bộ.

File backup kèm theo **có mã hóa**, không phải bằng chứng database plaintext đã bị lộ; không giải mã hoặc kết luận đã lộ khóa. Tuy vậy backup và ảnh báo cáo không nên đi kèm phần mềm cho mọi người nhận bộ cài. Nên đóng gói bằng danh sách cho phép runtime cần thiết và kiểm tra nội dung artifact trước phát hành.

### F16 — P2: Nhánh cập nhật dự phòng luôn từ chối checksum hợp lệ

**Vị trí:** [update-handlers.ts:437](<G:/PHONG TRO/app/src/main/update-handlers.ts:437>), bộ kiểm tra tại dòng 126.

Khi GitHub API lỗi và chuyển sang `latest.yml`, code truyền chuỗi SHA-512 base64 trần. `verifyFileChecksum` lại bắt buộc định dạng có tiền tố `sha256:`/`sha512:` hoặc dấu gạch ngang.

Đã chạy hai hàm thật với `dist/latest.yml` và bộ cài local: giá trị hiện tại báo `Checksum bản cập nhật không hợp lệ.`; cùng checksum thêm tiền tố `sha512:` xác minh thành công. Nhánh dự phòng vì thế không cài được bản vá.

Cần chuẩn hóa checksum trước xác minh, không bỏ kiểm tra checksum để né lỗi.

### F17 — P2: Đối soát SePay thủ công có thể ghi tiền vào sai kỳ

**Vị trí:** [SePaySyncModal.tsx:310](<G:/PHONG TRO/app/src/renderer/src/components/SePaySyncModal.tsx:310>), so với đối soát nền [App.tsx:1938](<G:/PHONG TRO/app/src/renderer/src/App.tsx:1938>).

Luồng thủ công dùng thời điểm đối soát làm ngày thanh toán, thay vì ngày giao dịch ngân hàng. Giao dịch tháng trước được chấp nhận tháng này sẽ vào tháng này, trong khi luồng nền dùng ngày ngân hàng. Cần thống nhất ngày kế toán từ giao dịch gốc và quy tắc múi giờ Việt Nam.

### F18 — P2: Dữ liệu định giá cũ nhiều năm vẫn có thể được gắn độ tin cậy 92%

**Vị trí:** [RoomPricingPanel.tsx:276](<G:/PHONG TRO/app/src/renderer/src/components/RoomPricingPanel.tsx:276>).

Điều kiện đáng tin chủ yếu dựa số mẫu/số nguồn; dữ liệu quá 30 ngày vẫn được điểm, không có hạn sử dụng mẫu hoặc cảnh báo dữ liệu quá cũ. Tái hiện với 12 tin cùng diện tích từ 3 nguồn, ngày năm 2023, kết quả trong năm 2026 vẫn `isReliable=true`, `confidence=92`.

Nên loại/giảm trọng số mẫu quá cũ và hiển thị thời điểm dữ liệu. Đây là rủi ro chất lượng đề xuất, không phải chứng cứ app tự thay tiền thuê.

## Điểm bổ sung và giới hạn chưa nâng thành phát hiện chính

- [NewContractModal.tsx:114](<G:/PHONG TRO/app/src/renderer/src/components/NewContractModal.tsx:114>) ưu tiên chỉ số của hóa đơn mới nhất bất kể loại/trạng thái hơn chỉ số hiện tại của phòng. Với hóa đơn cọc nhập liệu cũ có chỉ số 0, hợp đồng tiếp theo có thể khởi tạo và khóa chỉ số 0. Các hóa đơn cọc thông thường không phải lúc nào cũng có chỉ số 0. Nên xử lý cùng F06 bằng nguồn lịch sử đồng hồ có thẩm quyền.
- [ContractPrintTemplate.tsx:58](<G:/PHONG TRO/app/src/renderer/src/components/ContractPrintTemplate.tsx:58>) có giá trị dự phòng định danh/tài khoản chủ nhà cụ thể. Thiếu cấu hình có thể in sai người/tài khoản; không chép lại các giá trị cá nhân vào báo cáo. Nên để trống có cảnh báo hoặc yêu cầu cấu hình trước in.
- Nhiều truy vấn hóa đơn/thu chi dùng `select('*')` không phân trang. Hiện dữ liệu có 154 hóa đơn và 58 giao dịch thu chi; chưa xác định cấu hình giới hạn dòng API nên không kết luận báo cáo hiện tại đã bị cắt ở 1.000 dòng.
- `meter_reading_adjustments` chưa có trong schema public live. File schema local thiếu RLS, nhưng không coi đây là bảng production đang lộ dữ liệu.
- Chưa xác minh cấu hình redirect/password-recovery và SMTP/hook ngoài database. Không báo các điểm này thành lỗi production chắc chắn.
- Chưa có bằng chứng SSRF/RCE khả dụng từ crawler: host chính cố định, filename snapshot được chuẩn hóa, nội dung render dưới dạng React text. Không kết luận thiếu một biện pháp phòng thủ là đã có khai thác.

## Kết quả kiểm tra kỹ thuật

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| `npm run typecheck` | Pass cả main và renderer. Không thay thế kiểm thử nghiệp vụ. |
| ESLint, chạy trực tiếp với `src --no-cache` | Không chạy hết: `TypeError: expand is not a function` trong minimatch/brace-expansion. Chưa có kết quả lint sạch. |
| `npm audit --json` | Báo 3 mục high: electron qua extract-zip, extract-zip, nanoid. |
| `npm audit --omit=dev --json` | Báo 2 mục high: electron và extract-zip; metadata lock khiến việc phân loại chỉ bằng cờ omit không đủ. |
| Kiểm tra package đã đóng gói | Không thấy thư mục package electron/extract-zip/nanoid trong `resources/app/node_modules`. Không coi số mục audit là số đường khai thác runtime đã được chứng minh. |
| Quét secret trong nội dung text gói local | Không tìm thấy exact-match các secret dài trong env đang dùng hoặc JWT service-role trong phạm vi quét. Không phải chứng nhận không còn mọi loại secret; không quét nội dung đã mã hóa như plaintext. |
| Supabase security advisor | Có cảnh báo password-leak protection tắt và function privileges. Đã kiểm tra ngữ cảnh: `SECURITY DEFINER` hoặc RLS không có policy không tự động là lỗi. |
| Cấu hình Electron cơ bản | Main window bật sandbox/contextIsolation, tắt nodeIntegration; có CSP và hạn chế link mở ngoài thành HTTPS. |

`extract-zip <=2.0.1` có advisory về symlink path traversal; cần xử lý dependency/build chain với kiểm thử tương thích, không tự chạy `npm audit fix --force`. Đây không phải bằng chứng updater hiện tại dùng thư viện đó để giải nén. Xem [advisory GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv).

Các cấu hình Electron được đối chiếu với [hướng dẫn bảo mật chính thức](https://www.electronjs.org/docs/latest/tutorial/security). Việc có những cấu hình đúng không phủ định các lỗi nghiệp vụ/quyền backend ở trên.

## Thứ tự xử lý đề nghị

1. Khóa đường tự đăng ký/cấp quyền F01; kiểm tra các tài khoản đã tạo. Siết quyền ghi tiền và Storage ở server F02/F10.
2. Đối soát riêng 8 hóa đơn đã hủy có lịch sử thanh toán, không tự sửa dữ liệu hàng loạt trước khi xác định phiếu bù/hoàn và số thực thu.
3. Sửa công thức hóa đơn/số dư cọc/báo cáo/đồng hồ; bổ sung ca thử từ F03–F06.
4. Đưa chuyển phòng và tất toán vào transaction, xử lý retry; tránh tính trùng kiểm kê F07–F09.
5. Sửa phiên đăng nhập và thông tin khách, làm sạch nội dung gói phát hành, sửa updater, rồi kiểm tra lại trên môi trường thử trước khi tạo bộ cài mới.

Chưa thực hiện các thay đổi trên trong lượt review này.
