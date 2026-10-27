# Rà soát bảo mật website và Electron — 09/10/2026

## Phạm vi

- PWA quản lý: https://app.phongtroankhang.com/
- Website người thuê: https://pay.phongtroankhang.com/
- Mã nguồn Electron, preload, IPC, xuất tài liệu, auto update và bộ cài Windows.
- Metadata Supabase production, các endpoint public và kiểm thử dữ liệu giả.

Giữ cơ chế admin/staff/người thuê và auto update hiện tại. Workspace có các tác vụ
khác đang sửa đồng thời; không reset, commit hoặc phát hành GitHub release.

## Những điểm đã sửa trong đợt này

| Điểm | Tác động | Xử lý và trạng thái |
| --- | --- | --- |
| Tenant portal thiếu header transport trên HTML/API | Thiếu bảo vệ trình duyệt khi truy cập hoặc nhúng website | HSTS một năm, X-Frame-Options DENY và nosniff. API bổ sung CSP riêng, no-referrer và no-store. Đã deploy Pages, kiểm tra cả HTTP 200 và lỗi. |
| Renderer Electron chưa khóa navigation/nguồn IPC | Nếu renderer bị điều hướng ra ngoài hoặc IPC đến từ iframe/cửa sổ phụ, các API đặc quyền có thể bị sử dụng sai | Chỉ chấp nhận IPC từ main frame của cửa sổ đã đăng ký và đúng URL ứng dụng. Chặn navigation, redirect ra ngoài và webview. HTTPS mở bằng trình duyệt hệ thống. Tất cả module đăng ký IPC dùng cùng adapter. Đã build bộ cài và smoke test packaged. |
| Cấu hình Electron đóng gói quá rộng | Dự án adminpwa mới có file gateway secret; lần đóng gói tiếp theo có thể kèm mã nguồn/credential/profile từ workspace | Đổi sang danh sách cho phép gồm out, resources và package.json; runtime dependencies do builder xử lý. Loại các dự án web, docs và mọi file .env ở mọi cấp. Thêm kiểm tra gói và gitignore cho snapshot gateway riêng tư. |
| Manual SePay chuẩn hóa tài khoản chỉ bằng số | Tài khoản ảo chữ/số bị từ chối; SQL cũ làm mất phần chữ khi đối chiếu | Chuẩn hóa uppercase chữ/số, hỗ trợ sub_account; vẫn lấy giao dịch từ SePay trên server và giữ kiểm tra actor, số tiền, provenance, idempotency. Function admin-pwa-sepay version 5 ACTIVE, SQL production xác nhận có logic mới. |
| Pages contract gateway thiếu secret binding | Token giả nhận 503, luồng xem hợp đồng không hoạt động | Edge trực tiếp trả 410 đúng. Khôi phục hai gateway secret hiện có sau khi xác minh chúng và deploy lại Pages. Token giả hiện trả 410. |

Gói Electron cũ được kiểm tra trước khi rebuild không chứa file gateway secret
của adminpwa. Không có bằng chứng từ kiểm tra đó rằng credential đã được phát hành.
Bản mới được quét 438 file văn bản trong payload: không tìm thấy giá trị private
đã biết hoặc JWT service_role; không có file .env/dự án web ngoài danh sách cho phép.

## Các chặn bảo mật vẫn có hiệu lực trên production

- Public signup bị tắt.
- 46 bảng public có RLS; không tìm thấy bảng public thường nào thiếu RLS.
- Anon không được gọi resolve_login_email hoặc đọc app_secrets.
- admin_pwa_reconcile_verified_sepay chỉ có quyền EXECUTE cho service_role,
  không cấp cho anon/authenticated; function vẫn kiểm tra admin active.
- Tenant state chưa đăng nhập trả 401; request từ origin lạ trả 403.
- SePay list chưa đăng nhập trả 401; lịch sử hợp đồng chưa đăng nhập trả 401.
- advance_room_meter_on_invoice_payment trả kiểu trigger: không phải RPC có thể
  gọi như function thường để cập nhật chỉ số. Không đổi grant của trigger này.
- Cookie tenant dùng HttpOnly, Secure, SameSite=Lax và tiền tố __Host-.
- Scope phòng/hợp đồng tenant lấy từ server, không tin room/contract ID do browser
  gửi. Các test thử đổi contract và gửi số tiền giả vẫn bị chặn.
- CSP và sandbox ở tài liệu contract và cửa sổ xuất Electron vẫn được giữ.
  EmailNotificationSandbox hiện chỉ render các fixture nội bộ và có sandbox rỗng;
  không tìm thấy đường dữ liệu khách thuê tùy ý vào preview này.
- Auto update Electron vẫn bật: nguồn HTTPS được giới hạn, checksum bắt buộc,
  ZIP có kiểm tra traversal/symlink/kích thước. Không sửa logic tự kiểm tra update.

Header CORS `*` trên bộ khung HTML/tài nguyên public chưa cho thấy đường đọc dữ
liệu tenant: các API tenant có no-store, không phản chiếu origin lạ và chặn CSRF.
Không dùng CORS như một biện pháp xác thực thay cho kiểm tra session/server.

## Kiểm thử

| Kiểm tra | Kết quả |
| --- | --- |
| Test PWA quản lý tại lần chạy cuối | 114/114 pass, gồm các test mới từ workspace đang làm song song |
| Tenant backend/contract/OCR/manual fallback | 67/67 pass |
| Electron IPC/Gmail/OAuth/startup | 27/27 pass |
| SQL bank reconciliation trong schema tạm, rollback | 24/24 pass; fingerprint hóa đơn/sổ tiền trước và sau giống nhau |
| Build/typecheck Electron, PWA quản lý, tenant | Pass tại các thời điểm chạy trong đợt rà soát |
| Build Windows NSIS và kiểm tra payload | Pass; bộ cài local 1.0.100 |
| Smoke test Electron packaged với profile riêng | Complete: màn hình đăng nhập, code module và icon style sẵn sàng |
| npm audit --omit=dev | 0 lỗ hổng đã biết ở ba dự án tại lần kiểm tra tương ứng |
| Production probe sau khôi phục gateway | 5/5 đạt status kỳ vọng |
| Lint module IPC mới | 0 lỗi, 0 cảnh báo |
| Lint toàn workspace | Chưa đạt: lượt chạy báo 624 lỗi và 17.437 cảnh báo; module IPC mới đã được sửa sau lượt đó. Không chạy --fix diện rộng. |

Một test tenant cũ còn giả định tenant thật không được dùng OCR. Đã cập nhật test
để kiểm tra tenant không thể truy cập hợp đồng khác hoặc demo storage, phù hợp với
luồng OCR thật đang có; không sửa handler để vô hiệu hóa chức năng này.

Script deploy-contract-production đầy đủ có guard so với snapshot QA lịch sử.
Nó đã chạy lại các migration trước khi dừng tại guard số dòng đã cũ; không deploy
Edge bằng lượt script đó. Việc khôi phục 503 cuối cùng dùng sửa binding Pages và
redeploy Pages. Không tạo hợp đồng, tài khoản hay email thật để kiểm tra luồng này.

## Bằng chứng

- `docs/security/qa/production-verification-2026-10-09.json`
- `docs/security/qa/electron-package-security-2026-10-09.json`
- `docs/security/qa/electron-packaged-smoke-2026-10-09.json`
- `docs/security/qa/trusted-ipc-lint-2026-10-09.json`
- `adminpwa/qa/sepay-backend-deployment.json`
- `adminpwa/qa/bank-reconciliation-rollback.json`
- `webmobile/qa/contract-production-verification.json`
- `webmobile/deployment.json`

Các bằng chứng của đợt trước về signup/Storage/login gateway vẫn ở adminpwa/qa.

## F12 và giới hạn kết luận

F12 cho phép chủ phiên xem dữ liệu đã được ứng dụng trả về cho họ, request và
token của chính phiên đó. API URL và khóa Supabase anon được thiết kế để public.
Bảo vệ nằm ở kiểm tra server, RLS, token hợp lệ và scope dữ liệu; không thể bảo mật
bằng cách giấu JavaScript hoặc khóa DevTools.

Chưa kiểm thử end-to-end bằng tài khoản admin/tenant thật trên production; chưa
thử payload XSS trong dữ liệu thật, upload/delete Storage thật hay đối soát tiền
thật qua HTTP. Smoke test packaged chưa thay thế bài adversarial runtime đầy đủ.
Không kết luận toàn hệ thống không còn lỗ hổng hoặc đã/không từng bị xâm nhập.

Website/gateway và manual SePay đã deploy. Bản Electron mới là artifact local tại
`dist/DBYHOME-1.0.100-setup.exe`; chưa cài lên máy người dùng, chưa publish release
hay đổi version để phát tán qua auto update. Máy đang dùng bản cũ cần cài bộ này
hoặc nhận một release mới được phát hành sau đó.
