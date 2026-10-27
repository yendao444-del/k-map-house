# PWA quản lý AN KHANG HOME — tiến độ và bằng chứng

Mục tiêu giữ nguyên: toàn bộ nghiệp vụ Electron, giao diện mobile khoảng 90% tương đồng, kiểm tra chức năng và đối chiếu hình ảnh trước bàn giao. Không coi build thành công hoặc sao chép màn hình là hoàn thành.

Trạng thái: domain production đã hoạt động; đang nghiệm thu toàn bộ tính năng mobile và workflow.

## Phạm vi và nguyên tắc

- Dự án riêng `adminpwa/`; Electron chỉ được đọc để tham chiếu.
- Không thay thế `webmobile/` hoặc tên miền `pay.phongtroankhang.com`.
- Phòng dùng ảnh duyệt `tmp-product-design/rooms-mobile-20261008/electron-like-revision.png`.
- Đăng nhập dùng Supabase và tài khoản quản lý hiện có, không tạo lại kho mật khẩu.
- Không dùng thao tác thanh toán, gửi thư hoặc hợp đồng thật để thử nghiệm.
- Google Maps và vị trí ghim được tạm hoãn; không thuộc đợt hoàn thiện PWA mobile hiện tại.

## Ma trận công việc toàn bộ tính năng

| Hạng mục | Hiện trạng | Bằng chứng còn cần |
| --- | --- | --- |
| Nền PWA riêng | Có React/Vite, tài nguyên thương hiệu, manifest, biểu tượng, shell service worker và cơ chế cập nhật có xác nhận | Kiểm tra cài đặt, offline và đổi build trên bản production preview; Android/iOS thật |
| Phase 01 — đăng nhập | Giữ form Electron; mobile responsive; cùng Auth; hồ sơ thiếu/inactive/vai trò lạ bị từ chối; ghi nhớ tùy chọn; logout local, bỏ cache và dialog của tài khoản trước | Đăng nhập tài khoản cũ end-to-end, recovery callback, quyền API và đa thiết bị |
| Phase 02 — phòng | Danh sách liên tục, tìm kiếm, trạng thái, kỳ hóa đơn động; tổng nợ và kỳ hiện tại tách riêng; bottom nav; menu thao tác phòng, dùng lại guard nghiệp vụ; đã có QA ảnh đối chiếu Phase 02 | Kiểm tra thêm/sửa/xóa phòng an toàn trên schema thử; mọi trường hợp bàn giao, nợ nhiều kỳ, tất toán, dữ liệu backend thực tế |
| Khách thuê | Đã chuyển toàn bộ màn xem/sửa, ảnh mặt trước/mặt sau, phóng to và biểu mẫu vào dự án riêng; danh sách có layout card riêng cho mobile, không ép bảng desktop trên màn nhỏ | Kiểm tra layout từng màn, tải ảnh, lỗi mạng, quyền và thao tác ghi trên schema thử |
| CCCD | Adapter web đọc QR/OCR tại thiết bị; mô hình và worker tự phục vụ từ ứng dụng | Kiểm tra ảnh QR/OCR thực sự, iOS/Safari, camera/file/clipboard, timeout |
| Hợp đồng | Có các màn lập, nháp, xác nhận, sửa, lịch sử, hủy, chuyển phòng và trả phòng từ Electron; danh sách hợp đồng có card mobile riêng | Đối chiếu bản hiện hành của dịch vụ hợp đồng; email tenant phía server; thao tác end-to-end trên môi trường thử |
| Điện/nước và hóa đơn | Đã chuyển đầy đủ biểu mẫu, điều chỉnh chỉ số, kỳ thu và lịch sử; danh sách hóa đơn có card mobile riêng, giữ bảng desktop ở màn lớn | Kiểm tra lập kỳ, prorata, cọc, nợ, hợp nhất, tất toán và các guard; layout mobile |
| Thu tiền/SePay | Các màn đối soát và thanh toán được chuyển; đã cập nhật PWA copy để tránh client tự thu khi SePay server đang hoạt động | Test tiền thiếu/thừa/đúng, idempotency, hoàn tiền và đồng bộ song song với Electron |
| Ví/công nợ/dòng tiền | Có đầy đủ module gốc và truy cập từ điều hướng mobile | Kiểm tra quyền, số dư, sổ giao dịch, đối soát và ghi nhận tài chính trên test |
| Báo cáo | Chuyển tổng quan, kết quả kinh doanh, cọc, điện/nước, dòng tiền, công nợ | So sánh số liệu và bố cục, thử filter/kỳ, xuất/in |
| Tài sản/phương tiện | Chuyển module, bàn giao/thu hồi, kiểm kê, khấu trừ, phương tiện | Kiểm tra mọi nhánh nghiệp vụ và layout mobile |
| Đầu tư | Backend PWA riêng đã áp dụng 3 migration additive: snapshot/version, lưu danh mục và chứng từ nguồn vốn atomic, nhập Electron admin-only vào danh mục trống; NAV proxy riêng đã triển khai | Kiểm tra bất biến toàn danh mục khi sửa/xóa nhiều giao dịch mua/bán, phiên HTTP thật, UI import và đối soát dữ liệu cũ. Web chưa đồng bộ ngược vào JSON Electron |
| Email/thông báo | Dùng lớp web, không dùng OAuth localhost trên điện thoại | `admin-pwa-bridge` đã triển khai: quản trị viên đã xác thực 2FA có thể gửi email xác nhận/hủy hợp đồng qua Resend, có CORS giới hạn và khóa chống trùng; lịch sử gộp mail hệ thống, mail người thuê và mail kỳ thanh toán |
| Xuất ảnh/in/chia sẻ | Có adapter tải ảnh PNG và share sheet/Zalo link, không tuyên bố tin đã gửi | Kiểm tra ảnh xuất thực sự, nội dung dài, ảnh tải chậm, Safari, cancel và browser permissions |
| Cài đặt/tài khoản | Màn Electron đã chuyển, updater không chạy installer Windows | Điều chỉnh UI/nhãn PWA, kiểm tra quyền và mọi chức năng settings |
| Phát hành/rollback | `app.phongtroankhang.com` đã active trên Pages; chưa nghiệm thu toàn bộ tính năng | Project riêng, security headers, Auth callback, smoke test production và rollback evidence |

## Bằng chứng đã có

- `npm run typecheck`: kiểm tra PWA copy qua TypeScript (kiểm tra lại sau mỗi thay đổi).
- `npm run build`: đã có bản build thành công, service worker sinh theo build ID; bundle scan không thấy service-role JWT hoặc dấu khóa quản trị. Cần chạy lại ở revision cuối.
- `npm test`: 97/97 test gồm quyền hồ sơ, các trạng thái tài chính phòng, tổng nợ/kỳ hiện tại, phân biệt tiền cọc, filter, hủy/xóa theo lịch sử, trạng thái thu/hoàn hóa đơn có dấu, quyền menu, guard service worker, snapshot CAS/idempotency/import, auth/cache/fail-closed NAV và guard SePay server-side. Không đại diện cho toàn bộ nghiệp vụ đã nghiệm thu.
- `qa/backend-readonly-audit.json`: kiểm tra backend thật chỉ đọc; không lấy mật khẩu/token/contact/giấy tờ.
- 38 bảng public bật RLS; có 2 admin active và 1 user active. Bật RLS không tự chứng minh các policy đúng.
- Auth backend giữ nguyên `site_url=http://localhost:3000` để không làm thay đổi Electron/tenant; đã thêm đúng redirect `https://app.phongtroankhang.com/**` theo kiểu additive và đọc lại xác nhận. Bằng chứng: `qa/auth-redirect-production.json`.
- Migration restrictive cho `app_settings` và `debt_entries` đã áp dụng sau role-simulation; active admin/staff vẫn đọc được, unknown authenticated bị 0 row và anonymous không có table grant. Bằng chứng: `qa/management-rls-guard-verification.json`.
- Ảnh phòng 390 × 844 trong `qa/` là browser-rendered component với fixture tương ứng ảnh duyệt, không phải dữ liệu hay phiên production. `?qa=rooms` chỉ có ở DEV; không mở vùng quản lý thật.
- Card hóa đơn dùng chung component với `InvoicesTab` đã được render tại 320/390/430 × 844 px trong `?qa=invoices` (DEV-only). `qa/invoices-card-{320,390,430}.png` ghi nhận nhãn cần hoàn/hoàn một phần, số dư có dấu, tên dài xuống dòng, không tràn ngang và nút 44 px. Đã thử mở chi tiết khoản cọc và callback hoàn tiền giả lập. **Chưa kiểm chứng menu thật, modal thu/hoàn hoặc thao tác backend qua harness này.**
- Responsive sweep 2026-10-09: added scoped mobile rules for invoices, tenants, wallet, reports, investments, assets, contracts and settings. Wide data tables remain contained in their own scroll areas; module headers, action groups, settings/assets navigation and mobile cards reflow without changing desktop presentation. Typecheck/build passed and the current build is deployed to the active custom domain. Authenticated captures for the non-room modules remain a release gate because the production browser is currently at login.
- Đã bỏ điều kiện sai `remaining <= 0` để suy ra đã thu; hóa đơn hủy/gộp không mở thao tác tiền. Menu mobile nối lại menu hiện hữu, giữ guard quản trị và chốt nợ, có giới hạn trong viewport. Bản build hiện tại `754141297d636d83` thành công, 76 tài nguyên shell; cảnh báo bundle lớn vẫn còn.

## Cập nhật kiểm chứng 2026-10-08 — backend và DNS

- Luồng SePay PWA đã tách sang `admin-pwa-sepay` version 1 ACTIVE. Trình duyệt chỉ gửi mã giao dịch (+ hóa đơn), không gửi số tiền/tài khoản nhận; server đọc lại giao dịch từ SePay, kiểm tra tài khoản, chiều tiền vào, số tiền nguyên VND, thời gian, mã trùng và ghi sổ atomic. Guard provenance chặn ghi `source=sepay` giả từ authenticated client. `qa/sepay-backend-deployment.json` và `qa/sepay-security-verification.json` ghi nhận function online, rollback test production không làm đổi payment_events/invoices/cash/fingerprint.
- Đã áp dụng restrictive RLS guard cho `app_settings` và `debt_entries`; `qa/management-rls-guard-verification.json` xác nhận active admin/user đọc được, unknown authenticated profile bị 0 row và anonymous không có table grant. Đây là migration additive, không sửa Electron hay dữ liệu.
- `qa/bank-reconciliation-rollback.json` có 22/22 assertion trong schema rollback-only: thu một phần/đủ, retry, sai hóa đơn, quá tiền, ambiguous, wrong account, hóa đơn hủy, bank receipt chưa ghép, settlement và quyền service-only đều đạt. Không gọi provider, không gửi email, không giữ tiền thử.
- `qa/npm-audit-production.json`: 77 production dependencies, 0 vulnerability theo npm audit tại thời điểm kiểm tra.
- Frontend PWA đã deploy riêng lên Pages preview [`ankhanghome-admin-pwa.pages.dev`](https://ankhanghome-admin-pwa.pages.dev) và custom domain [`app.phongtroankhang.com`](https://app.phongtroankhang.com) đang active. `qa/pages-preview-verification.json` và `qa/production-domain-verification.json` xác nhận entry JavaScript, manifest, service worker và CSP/X-Frame/nosniff headers.

- Build production-preview `5729f0bd24e50f7a`: typecheck/build và scan khóa riêng trong bundle thành công, 76 tài nguyên shell. Cảnh báo main bundle > 500 kB vẫn còn; custom domain đã active.
- Build preview đã được phát hành lại lúc 2026-10-08T10:39:44Z sau kiểm tra Auth; `qa/pages-preview-deployment.json` và `qa/pages-preview-verification.json` xác nhận entry, manifest, service worker và header bảo vệ trên Pages.
- `qa/auth-redirect-production.json` xác nhận cập nhật Auth chỉ thêm `https://app.phongtroankhang.com/**`, giữ nguyên `site_url` và không ghi đè redirect khác.
- `qa/production-domain-verification.json` xác nhận domain thật `https://app.phongtroankhang.com` đã active: DNS công cộng resolve, TLS được xác minh, HTML/asset/manifest/service worker trả 200, HTTP chuyển 301 sang HTTPS và header bảo vệ đầy đủ. DNS resolver nội bộ của máy vẫn cache âm; đây không ảnh hưởng public resolver.
- Đầu tư dùng RPC thực, không còn phụ thuộc `admin-pwa-bridge` cho đọc/lưu danh mục. Ba migration PWA riêng đã được áp dụng trong một transaction; không sửa policy hoặc tệp Electron hiện hữu. Tables PWA bật RLS và cấm truy cập trực tiếp từ anon/authenticated.
- `qa/investment-storage-verification.json`: 29/29 assertion database thật bằng role simulation, transaction rollback-only. Kiểm tra admin/user/anon, CAS, retry/payload/actor binding, chứng từ atomic, hoàn tác khi snapshot lỗi, trùng ID/symbol, khóa chứng từ và import. Sau test: 0 danh mục, 0 lịch sử commit; 86 chứng từ vận hành và fingerprint trước/sau giống nhau. Không giữ lại giao dịch thử, không chuyển tiền thật.
- Import chỉ admin, danh mục web trống, không ghi nhận nguồn vốn lần nữa; chưa nhập tệp của người dùng. Web thay đổi không tự ghi về JSON Electron. UI file-picker và đồng bộ lịch sử cần nghiệm thu riêng.
- `admin-pwa-market` version 1 ACTIVE; `qa/market-proxy-deployment.json` xác nhận anonymous/invalid session bị 401, origin lạ bị 403, các function khác giữ nguyên version/status. Đọc và parse được NAV công bố thật VFF/SSIBF/VNDBF/VLBF; chưa kiểm chứng phiên quản lý HTTP thành công qua function. Không dùng giá mô phỏng khi upstream lỗi.
- Đã xử lý lỗi lưu mục tiêu đầu tư để không phát sinh promise rejection không được bắt. Chưa chứng minh mọi bất biến tồn kho khi sửa/xóa nhiều giao dịch đồng thời; đây vẫn là release gate.
- Người dùng cho biết mua tên miền ở Spaceship. `qa/hosting-readonly-audit.json` xác nhận DNS authoritative ở Cloudflare (`aurora.ns.cloudflare.com`, `rudy.ns.cloudflare.com`), không phải Spaceship DNS. Token hiện có đọc được Pages nhưng trả 0 zone `phongtroankhang.com`; cần đúng Cloudflare account/token để thêm record, không tự đổi nameserver.
- `app.phongtroankhang.com` đã resolve qua các DNS công cộng và Pages báo `active`; record duy nhất được thêm là `app CNAME ankhanghome-admin-pwa.pages.dev`. Auth redirect PWA đã cấu hình additive; pay/root/www được giữ nguyên.

## Bảo vệ mã Electron và thay đổi đồng thời

`qa/electron-source-baseline.json` chụp SHA-256 của 163 file nguồn/config Electron trước khi tạo bản sao. Các patch trong công việc PWA chỉ nhắm `adminpwa/` và tài liệu `phase/`.

Khi kiểm tra lại, `src/renderer/src/App.tsx` và `src/renderer/src/lib/db.ts` ở Electron có thay đổi ngoài các patch PWA (thêm kiểm tra email/SePay server). Không khôi phục hoặc sửa chúng. Chỉ mang thay đổi tương thích đó vào **bản sao PWA**. Vì workspace có công việc đồng thời, không tuyên bố toàn bộ nguồn Electron giữ nguyên hash; giữ baseline và báo mọi khác biệt để truy vết.

## Bước tiếp theo, giữ đủ phạm vi

1. Hoàn tất browser QA của danh sách/login và các card mobile ở 320/390/430 px; ghi đối chiếu và các gap thật.
2. Nghiệm thu backend đầu tư/NAV đã có, bổ sung bất biến tồn kho và hoàn thiện email hợp đồng; không để adapter báo thành công khi dịch vụ chưa thực hiện.
3. Kiểm tra mọi module kế tiếp ở mobile, sửa layout trong PWA copy và viết test nghiệp vụ.
4. Xác minh quyền backend, callback và các integrations ở môi trường thử, rồi mới chuẩn bị phát hành tên miền.
5. Nghiệm thu yêu cầu toàn bộ scope và báo cáo đối chiếu cuối; goal chỉ hoàn thành khi mọi ô được chứng minh.
