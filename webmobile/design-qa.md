# Design QA — Website người thuê mobile · 06/10/2026

final result: passed

## 07/10/2026 — Electron contract confirmation history

Added a compact clock icon and Lịch sử button beside the contract status in NewContractPage. The actual React modal uses existing Electron navy/emerald tokens, a chronological timeline, GMT+7 timestamps with seconds, recipient/send attempt metadata and five-second refresh while open. Old recorded milestones are explicitly marked; no historic view times are fabricated. Cloud logs distinguish link opened, contract displayed and confirmed.

Browser QA used the actual component and built Electron CSS with synthetic events only. Verified all six main milestones, no clipping in the observed viewport, loading/empty/error states, Escape close and reopening. Screenshot: `qa/contract-history-preview.png`. Eight backend tests, 21 live TEST checks and production read-only guard checks passed. Production room/tenant/contract/draft counts stayed 25/30/48/2. Electron build and deployed website/edge passed. Display telemetry does not prove complete reading; sent status does not prove Inbox delivery.

## 07/10/2026 — Contract amendments and cancellation

Replaced hover-only direct editing with an always-visible ellipsis menu on each contract row. Actions are view/print, history, edit, cancel due to mistake; closed contracts show view/history. Edit uses the established full-page contract editor with a reason and old→new summary, fixed tenant/room/handover data and pending confirmation. Cancellation dialog shows consequences, backend eligibility, required reason and acknowledgement; financial blockers disable submission. Applied original Electron navy/emerald tokens, compact white panels and existing type hierarchy.

Actual components were rendered with synthetic data and a non-mutating QA API adapter at 1280×720. Verified menu placement without table clipping, dialog disabled/enabled states, blocked invoice case, editing page/read-only tenant and visible old/new rent summary. Evidence: `qa/contract-lifecycle-menu.png`, `qa/contract-lifecycle-cancel.png`, `qa/contract-lifecycle-edit.png`. 18 live TEST lifecycle checks, 21 original flow checks, 9 backend unit checks and 21 email checks passed. Production migration counts stayed 25 rooms/30 tenants/49 contracts/2 drafts; no real contract or financial action was performed. See Phase 13 for guards and limits.

## 07/10/2026 — Electron production contract/Gmail connection

The approved contract editor and option 1 email design remain in use. The obsolete TEST launcher control is removed from the editor; the Gmail panel now identifies the configured sender. Production confirmation runs on pay.phongtroankhang.com with manual staff JWT validation and service-only RPCs. User completed Google consent for phongtroankhang.com@gmail.com; encrypted token binding, identity, send scope and offline refresh verified. 27 focused checks, 14 isolated live flow checks and Electron/web builds passed. Public route/gateway isolation and online health verified. No email sent or production contract/account created during verification. Scope/status: phases/phase-12-contract-production-gmail.md.

## Cập nhật responsive — yêu cầu mới 06/10/2026

- Người dùng đã chọn: **Thông tin phòng và nút chụp luôn thấy; lịch sử mở khi bấm**. Đây là thay đổi có chủ đích so với hai hàng lịch sử ngay trang chủ trong ảnh gốc.
- Home đổi thành một nút `Lịch sử thanh toán` mở màn lịch sử hiện có; khách mới vẫn không có nút này.
- Thu gọn header, room title và spacing ở viewport thấp (760/680 px), không giấu nội dung bằng overflow.
- Bằng chứng: `qa/home/compact-home-359x757.png`, `qa/home/compact-home-320x568.png`. 359 × 757 không tràn ngang/dọc; 320 × 568 thấy đầy đủ CTA và history launcher. Đã giảm đệm dưới từ 12 xuống 8 px để loại bỏ 3 px dư ở viewport nhỏ.
- Đã bấm history launcher → hóa đơn tháng 08/2026 → trang chủ; chi tiết số tiền chính xác theo fixture. Build/typecheck passed.
- Báo cáo ảnh bên dưới ghi nhận lần build trước; không còn coi danh sách lịch sử ngay home là target sau quyết định mới.

## Nguồn, viewport và bằng chứng

- Source visual truth: `G:/PHONG TRO/app/webmobile/approved-option-1.png`, kích thước 1448 × 1086.
- Nguồn có ba vùng app 443 × 1014 tại x=27, 502, 978; y=48. Cắt bỏ nhãn board, normalize 393 × 900.
- Browser-rendered implementation: `qa/home/public-existing.png`, `qa/home/public-new.png`, `qa/home/public-capture.png`.
- CSS viewport 393 × 900, `devicePixelRatio=1`; hình trang chủ 393 × 900. Hình chụp full page có thêm nút thử ảnh mẫu bên dưới; phần so sánh lấy 393 × 900 từ đầu, không scale chiều ngang.
- Full-view comparisons (source trái, implementation phải): `qa/home/compare-existing-tenant.png`, `qa/home/compare-new-tenant.png`, `qa/home/compare-capture-electric.png`.
- Focused room/task comparison: `qa/home/compare-focused-room-task.png` (802 × 375). Nhãn, số tiền, badge và CTA đọc được để so typography/baseline.
- View website: `https://ankhanghome-payment.pages.dev/`.
- Mobile template: `qa/home/prototype-screen.png`; đo màn hình 393 × 852 ở scale 1, viewport browser 1400 × 1200. Device chrome là runtime; UI website public chạy trực tiếp trên mobile theo yêu cầu, không kèm khung thiết bị.

## Findings và lịch sử sửa

1. **P2 đã sửa — wrap tiêu đề task và hàng thông tin ở mobile.** Ban đầu `existing-initial.png` có task hai dòng và mất lịch sử khỏi viewport. Giảm badge/title phù hợp, kiểm tra lại 393 px và 320 px; bản cuối không cắt chữ, không tràn ngang.
2. **P2 đã sửa — logo xanh đậm khó đọc trên header.** Đổi bản màu cho nền tối từ logo PNG gốc: chữ trắng, phần xanh sáng; giữ nguyên hình/logo có sẵn. Bản cuối tại `public-existing.png`.
3. **P2 đã sửa — ảnh công tơ nhỏ hơn source.** So board vòng 1 thấy gutter hẹp không đúng kích thước ảnh. Đổi capture gutters 16 px, giữ aspect ratio 410/473, điều chỉnh khoảng cách hướng dẫn; `compare-capture-electric.png` là hậu sửa.
4. **P1 đã sửa — prototype blank do duplicate React.** Source đồng bộ vào thư mục app-owned của prototype, cài icon dependency tại prototype, reoptimize; phiên browser mới không có error/warn. Giữ nguyên file runtime được bảo vệ.
5. **P2 đã sửa — prototype app viewport cao hơn màn điện thoại.** Override ở `prototype/src/prototype.css` giới hạn app 393 × 852, giữ header ngoài vùng scroll. Đo lại đạt đúng màn và thử CTA/quay lại.
6. **Comparison normalization.** Không dùng các screenshot desktop bị resize như bằng chứng fidelity mobile. `scripts/compose-qa.mjs` bắt buộc capture rộng đúng 393 px, crop phần 900 px đầu, dùng bản public sau deploy làm bằng chứng.

Không còn P0/P1/P2 cần sửa trong phạm vi demo UI đã chốt.

## Năm bề mặt fidelity

| Bề mặt | Kết quả |
| --- | --- |
| Font/typography | Inter Việt/Latin từ Electron; tên khách, phòng, số tiền và nút giữ hierarchy. Font-generated reference có khác biệt nhỏ ở nét/condensation; dùng font thật của app là lựa chọn có chủ đích. |
| Spacing/layout | Header 99 px, title lớn, ba hàng tóm tắt, task mint và lịch sử dạng hàng. Source và implementation cùng thứ tự và tỷ lệ vùng chính. Gutter capture và task không lồng card thừa. |
| Colors/tokens | Header #064A31, action #00AB60, nền #F7FAF8, mint #EDF9F1, border #E5EEE8. Badge pending cam nhạt, paid xanh; giữ nhận diện Electron. |
| Imagery/icons | Dùng logo nguồn, ảnh công tơ được generate bằng 9Router từ crop tham chiếu; ảnh sắc, số rõ, tỷ lệ đúng. Icon outline Lucide được chọn vì hình/cỡ nét phù hợp home/currency/calendar/camera/zap/drop/menu. Khung ngắm là icon Scan thư viện, không vẽ SVG tay. |
| Copy/content | Tên/phòng/ngày/giá/lịch sử khớp fixture trong mock. Khách mới không có lịch sử hay dữ liệu người trước. Có thêm nhãn ảnh minh họa và thông báo demo ở luồng thử để không giả lập OCR/hoàn tất nghiệp vụ thật. |

## Interaction và responsive

- Đã thử home → capture điện → review → retake → capture nước → review → complete → home bằng in-app browser.
- Đã thử file chooser với WebP mẫu, preview blob và tệp Markdown sai loại; nhận alert đúng, không chuyển bước khi sai loại.
- Đã mở từng hóa đơn, lịch sử, menu, đổi khách và đóng menu. Chuyển khách reset ảnh và completion; lịch sử lọc theo `contractId` của fixture hiện tại.
- Sau đổi sang khách mới, DOM không chứa tên cũ, tiền hóa đơn cũ hay heading lịch sử; không có chỉ số/ảnh/cong nợ của người trước.
- Thử 320 px: các hàng room summary không overflow. 393 × 900: không overflow document; ảnh được tải đầy đủ.
- UI dùng button ngữ nghĩa, label/alt text, alert khi lỗi, focus-visible cho website và CTA cao ít nhất 44 px. Prototype status bar, picker, keyboard và home indicator được giữ nguyên.
- Public URL/deep links tải qua HTTPS; error/warn console rỗng trong phiên kiểm tra public. Response có CSP, noindex và nosniff; scan build không phát hiện server keys hay endpoint database thật.

## Build và giới hạn

- `webmobile`: typecheck/build/check-public-build passed; `npm run deploy` thành công.
- `prototype`: runtime integrity 28 file protected, build và smoke browser passed.
- Chưa kiểm tra camera bằng thiết bị iOS/Android vật lý. File input dùng `capture="environment"`; chooser đã kiểm tra qua browser. Đây là giới hạn kiểm tra phần cứng, không là lỗi UI đã thấy.
- Fixture filter không phải phân quyền production. API/RLS theo người thuê/hợp đồng phải có trước khi nối dữ liệu thật.
- Chưa có backend upload/OCR, hóa đơn, thanh toán, xác nhận hợp đồng hoặc Gmail automation theo phạm vi trang chủ trước.

## Follow-up polish P3

- Source header có hiệu ứng ánh sáng nhẹ từ ảnh sinh; UI giữ màu header đặc đúng token Electron.
- Bản logo raster nguồn hơi mềm ở zoom cao, có thể thay asset vector nếu chủ sản phẩm cung cấp sau.
- Có khác biệt nhỏ ở độ dày chữ/badge và công tơ minh họa; không đổi luồng/thứ bậc và không cắt nội dung.

## Checklist hoàn thành

- [x] Ba trạng thái approved image được triển khai.
- [x] Core interactions và trạng thái lỗi/chụp lại/hoàn tất đã thử.
- [x] So sánh full view và focused region cùng scale, sửa P0/P1/P2.
- [x] Build, public bundle scan, deploy, browser public và runtime smoke.
- [x] Hạ tầng/phase/report cập nhật, source nằm trong webmobile.

final result: passed

---

# Báo cáo trước đó — Phase 01 hồ sơ khách thuê (giữ nguyên)

final result: passed

## Nguồn và trạng thái

- Source visual: `design/tenant-profile/approved-ocr-option-2.png`.
- Rendered implementation: `qa/` local verification page using `TenantFormModal` at 1440 × 1024.
- State compared: two CCCD images loaded, QR read, extracted fields visible, phone/email filled, confirmation checkbox checked.

## Evidence comparison

- `qa/design-comparison.jpg`: approved modal cropped from 1024 × 1536 and actual desktop modal cropped from 1440 × 1024, displayed together at equal width.
- `qa/implementation-populated.jpg`: populated desktop capture.
- `qa/implementation-empty.jpg`: empty state.
- `qa/tenant-two-sides.png`: current empty state with separate Mặt trước/Mặt sau controls.
- Intentional differences: two real photo previews replace the mock's single illustration, explicit **Mặt trước** and **Mặt sau** upload buttons are added, clipboard actions remain available per side, and a review confirmation protects Vietnamese names.

## Findings and fixes

- Layout: two-column scan panel and editable tenant fields match the approved direction. The footer remains visible and the modal scrolls inside its body.
- Typography and tokens: Inter, existing Electron green tokens, restrained borders and mint scan surface are used.
- Interaction: file picker, two image previews, QR/OCR status, editable fields, confirmation checkbox and save validation were exercised.
- Privacy and correctness: no image is sent to an external OCR service; a save is blocked without both images and a valid QR result. Conflicting identity numbers are blocked.
- Responsive behavior: at a narrow viewport the form body scrolls without losing the footer controls; at desktop width the two-column hierarchy is preserved.

## Verification evidence

- `npm run typecheck` passed.
- `npm run build` passed.
- `node --test webmobile/identity-reader.test.mjs webmobile/tenant-save.test.cjs` passed (6 tests).
- `node webmobile/test-identity-backend.mjs` passed for original, resized and rotated back images; all returned the exact Vietnamese name and 12-digit identity number.
- Packaged Electron smoke test passed for both QR and OCR paths (`qa/packaged-runtime-results.json`).
- Browser QA loaded both real fixture images and displayed the exact fixture name with Vietnamese accents and 12-digit identity number, `Mặt sau · QR`, and an enabled save control only after review confirmation.

## Follow-up gate

Windows package built and package verification passed. Electron smoke loaded dependencies from the built `app.asar` and local OCR models from packaged resources; both QR and OCR returned the fixture's exact name and identity number. Actual compiled preload/main-handler IPC also passed in a sandboxed Electron window (`qa/ipc-runtime-results.json`). The installer was built, but was not installed during verification. Both photos are composed into the existing `identity_image_url` field. A later production schema check found the address/issue-date/issue-place columns missing: migration `20261005200000_tenant_identity_details.sql` has now added them as nullable fields and reloaded PostgREST schema. API schema verification and inserts into a temporary table with rollback passed; no real tenant was created/modified during verification. Build/typecheck and the six tests passed again after the fix. The existing installer predates this subsequent form fix.

Recognition evidence covers one supplied identity, with original/resized/rotated QR images and front OCR. It does not establish universal accuracy for every card or photo. Saving currently requires two distinct images, a valid QR result and review confirmation; an unreadable QR requires a clearer photo. OCR alone cannot prove that every Vietnamese accent is correct.

---

## Local meter OCR follow-up — 06/10/2026

Functional addition to the previously approved tenant website direction. Existing Inter, dark-green header, emerald CTA, mint cards, room context and electricity → water hierarchy remain. The review now includes a readable numeric proposal and explicit confirmation; it uses a contained image so the uploaded meter is not cropped. Review may scroll; the compact home behavior is preserved.

At 390 × 844, Vietnamese labels and CTA text remained readable with no horizontal overflow. Real-photo review captures: `qa/private/ocr-electric-12692.png`, `qa/private/ocr-water-00287.png`; completion and rejected wrong meter are in the same private QA directory. UI shows manual input separately from AI results. The added numeric card is an intentional functional extension, not a claim that it existed in the original mock.

Verified local upload, loading lock, proposed readings, explicit confirmations, wrong-meter rejection, retake/cancellation and manual validation/source labels. Detailed findings and accuracy limits: `qa/meter-ocr-local.md`. Public Pages has not been redeployed with OCR.

final result: passed for local demo; production OCR/auth/persistence remain pending.

### Strict image and consumption policy update

Following the user's feedback, failed/unclear/wrong-meter images require a retake and expose no manual bypass. A sample previous-value/usage comparison now appears on readable reviews, clearly labelled as demo data. Invalid/regressive or unusually high changes disable confirmation and explain the issue. The source image direction's typography, tokens and electric → water order are retained.

390 × 844 browser checks verified a rejected real image with no manual control and no horizontal overflow. An isolated, visibly labelled synthetic-provider page verified the old/new warning and spike warning, then normal server confirmation → water. These synthetic captures demonstrate interaction only, not OCR accuracy. Evidence and limitations: `qa/meter-ocr-local.md`.

### Readability/speed fix

Real upload now preserves higher source detail; the server generates an enlarged central region, retains full-device context and runs two reads concurrently. UI styling is unchanged. A new real water upload displayed `00287 m³` and the existing comparison/confirmation controls at 390 × 844 with no horizontal overflow (`qa/private/ocr-optimized-water.png`). Speed and small-sample rejection evidence are documented in `qa/meter-ocr-local.md`; these are not universal accuracy claims.

### Invoice / SePay local demo follow-up — 06/10/2026

Functional continuation of the approved tenant website: Inter, dark green header, mint surfaces, emerald actions and room context remain. After both readings are confirmed, the website automatically opens its invoice/payment screen. Payment adds an explicitly labelled demo QR, amount, transfer code, expandable invoice details, automatic status and receipt. Test-source controls are in a separate expandable area. These added payment states extend the approved flow; they are not asserted to be present in the original generated mock.

Real-photo upload → confirmations → 3.392.000đ invoice → insufficient-amount review → exact demo transaction → receipt was exercised in the local browser. No horizontal overflow at 390px or on the 320px receipt; Vietnamese labels remained readable. Reload restores the current contract's invoice and paid history; switching to a new tenant hides all former history/readings. Private captures: `qa/private/sepay-demo-invoice.png`, `qa/private/sepay-demo-partial.png`, `qa/private/sepay-demo-receipt.png`, `qa/private/sepay-demo-new-tenant.png`.

Detailed validation and production limits: `qa/sepay-demo.md`, `phases/phase-05-sepay-demo.md`. No live SePay API, real payment, database write or Pages deployment was performed.

final result: passed for local demo.

### Meter selection and complete invoice fields — 06/10/2026

Functional follow-up authorized by the user to the existing approved green/Inter tenant direction. Camera guidance and a dedicated meter crop step now precede OCR. Crop tools preserve the source image, allow pointer/keyboard adjustments, and review provides an expandable full-size preview. AI failure locks confirmation and exposes retake/reselection, without a manual bypass. Original compact home behavior is retained.

Monthly invoice/receipt extends the existing payment screen with the Electron data fields: billing dates, current tenant, old/new readings or new-tenant handover only, usage/rates, WiFi/cleaning/debt/adjustments, totals/amount in words, payment fields and recipient/contact details. Existing mint cards, dark green header and emerald controls remain. These functional extensions do not assert pixel identity with the original mock or implement settlement/transfer flows.

Real-image rejection evidence: `qa/private/meter-multiple-rejected.png`, `qa/private/meter-zoom-rejected.png`; crop UI: `qa/private/meter-crop-electric.png`. Invoice evidence uses a visibly labelled synthetic OCR provider: `qa/private/invoice-fields-mobile.png`, `qa/private/invoice-fields-receipt.png`, `qa/private/invoice-fields-new-tenant.png`. Invoice 390px / new-tenant invoice 320px checks had no horizontal overflow. Details/limits: `qa/meter-framing-invoice-fields.md`.

final result: passed for local crop/invoice demo; real OCR still rejects some zoomed images and is not guaranteed universally accurate. Physical mobile camera verification remains pending.


## 06/10/2026 — Bỏ chọn vùng thủ công, khung scan cố định

Theo yêu cầu mới, bỏ màn hình kéo/chỉnh vùng và nút chọn lại vùng. Giữ màu xanh/Inter và luồng hóa đơn đã duyệt. Camera có khung vuông cố định/vạch quét hướng dẫn; bấm chụp lấy ảnh đúng khung từ video gốc. Vạch quét không đại diện cho tự phát hiện hoặc tự chụp. File/ảnh mẫu chuyển thẳng OCR review.

390px: không tràn ngang, không còn điều khiển crop; screenshot `qa/private/meter-fixed-scan-mobile.png` (camera vật lý chưa kiểm chứng). Chọn file điện → xác nhận → nước → hóa đơn 3.472.000đ đã kiểm tra bằng OCR mô phỏng có banner, `qa/private/meter-no-selection-invoice.png`. 20 tests/build/prototype typecheck/runtime integrity pass. Giao diện không tạo phương án thiết kế mới; thực hiện simplification theo chỉ dẫn của người dùng.


## 06/10/2026 — Website trên tên miền thật

Giao diện giữ phương án đã duyệt. Bản hiện tại ở `https://phongtroankhang.com/`, `www` và Pages; cả ba host có entry asset khớp build. Trang chủ 390×844/320×568 không tràn ngang/dọc; thông báo API chờ cấu hình nằm trong mô tả có sẵn để giữ nút chụp/lịch sử trong viewport. Khách mới không có lịch sử fixture của hợp đồng cũ. Ảnh mẫu trên cloud đi thẳng review, báo thiếu cấu hình AI và khóa xác nhận, không yêu cầu chụp lại vì chất lượng ảnh. Evidence: `qa/public-domain-home-390.png`, `qa/public-domain-home-320.png`, `qa/public-domain-new-tenant.png`, `qa/public-domain-ocr-pending.png`. Chưa xác minh camera phần cứng và OCR thật online vì người dùng hoãn API key.


## 07/10/2026 — Responsive capture actions

The capture screen uses the dynamic viewport height and safe-area insets. The illustration shrinks with the available height; camera and gallery controls keep their touch targets. Dark green, emerald, Inter and the approved screen hierarchy are preserved. At 390×844, 390×650, 320×568 and landscape 844×390, the document height matches the viewport and both controls remain fully visible. The public 390×650 check confirms button bottoms at 550px and 604px. Screenshot: `qa/capture-responsive-public-390.png`. Physical iPhone Safari has not been tested on this host.

Build, typecheck and public secret scan passed. Latest asset `index-oeMqZ4B1.js` is verified on the domain, www and Pages.


## 07/10/2026 — Compact tenant invoice

Follow-up to the approved green/Inter payment screen. QR and transfer reference now share one compact card; the default invoice shows four charge groups, with WiFi/cleaning aggregated accurately. Nonzero debts, adjustments and deposit/damage fields remain visible when present. Full metadata, meter old/new/usage/rates, bank and contact fields remain behind a closed-by-default “Xem chi tiết hóa đơn” disclosure. Demo simulation controls also live inside that disclosure. Payment status, warnings, copy feedback and demo labeling remain visible.

Build/typecheck/public secret scan pass. Browser verified 390×844 and 320×568 without horizontal overflow, disclosure expansion preserved all fields, and simulated exact payment updated to a receipt. New tenant fixture shows only the current-contract charges. On short screens the compact invoice can still scroll vertically; capture-screen viewport rules are unchanged. Physical Safari has not been tested. Screenshots: `qa/payment-compact-390.png`, `qa/payment-compact-320.png`, `qa/payment-compact-receipt.png`. Isolated local QA harness: `qa/payment-compact/`; it is not deployed and does not write production business data.

Public deployment verified latest entry asset on domain, www and Pages; evidence: `deployment.json`.


Follow-up: compact summary now shows `Tiền điện · 92 kWh × 3.500đ` and `Tiền nước · 7 m³ × 10.000đ` (or the current invoice values), including zero-charge handover lines when usage exists. Verified at 320px with no horizontal overflow and redeployed to domain/www/Pages.


## 07/10/2026 — Visible invoice fields and Electron BIDV recipient

Removed the full-details disclosure at the user request. Visible fields now include invoice number/date/billing period, old→new electric/water readings, usage/rate/cost, separate WiFi/cleaning, nonzero adjustments/debt/deposit/damage, total/paid/remaining when applicable, amount in words, due date and note. Property address/contact are read from Electron settings. Printed template labels, signatures and tenant telephone (not connected to real tenants) are not fabricated.

Recipient/QR now use trusted server settings copied from `app_settings` during backend deployment. Name normalized to Đỗ Kim Ngân, BIDV/account from Electron. The SePay QR request uses the exact account, outstanding invoice amount and existing Electron transfer code helper; real public PNG decoded to verify BIDV BIN/account/amount/content. Existing demo snapshots regenerate their old non-bank QR when recipient configuration changes. QR failure never becomes a fabricated bank QR. Future Electron bank-setting changes require backend redeployment to resync the server configuration.

The invoice and reconciliation remain synthetic; QR can initiate a real bank transfer. The UI explicitly says “Hóa đơn demo · QR tài khoản thật” and warns not to transfer during demo. The recipient warning requires exact name/bank/account and unchanged transfer reference. No bank transaction or production business write was performed.

14 relevant backend tests/build/typecheck/secret scan pass. Browser at 320px has no horizontal overflow, no invoice-details control; 390px screenshot: `qa/private/invoice-bidv-mobile.png`. Public flow/decoded evidence: `qa/public-bidv-payment.json`. `deployment.json` verifies the newest source on domain/www/Pages.

## 07/10/2026 — Subtle utility text colors

User clarified that the compact invoice layout must remain unchanged, with only a small text-color accent. Electricity label/amount now use the existing emerald #007749; water label/amount use muted teal #16758A. No added cards, icons, borders, font-size or spacing changes. The approved compact invoice hierarchy, old/new readings and usage/rates are preserved.

Browser check at 320px: no horizontal overflow, amount text remains 14px, rows retain 4px 0 padding and transparent backgrounds. Screenshot: qa/private/invoice-meter-colors.png. Typecheck/build/public secret scan and prototype runtime integrity pass. Latest build verified on Pages/domain/www in deployment.json.

## 07/10/2026 — Remove tenant-facing SePay simulation controls

Removed the demo scenario disclosure and all five fake-transaction buttons from PaymentScreen, along with the unused component handler/state/imports. Tenant invoice now goes directly from charge summary to property contact and the home button. Existing compact layout, utility text accents, bank QR/recipient warning and demo status labels remain accurate. Browser verified zero simulation controls and the home button present; screenshot: qa/private/invoice-no-demo-controls.png. Build/typecheck/public secret scan and protected runtime integrity passed.

## 07/10/2026 — Supabase demo sign-in and pay subdomain

Added a compact email/password login screen using the existing approved dark green/emerald/Inter brand. Preserved room home, meter capture and invoice layouts. Password toggle, pending/error states and logout are available. Supabase verifies credentials server-side; each account maps to one demo tenant. Authenticated menus omit demo tenant switching; new tenant 102 has no prior history. Browser proof: qa/public-login-390.png and qa/public-login-new-tenant.png. At 320×568 the login button ends at 491px and no horizontal overflow occurs. Reload retained the correct account. Forgot-password UI explicitly states that email recovery awaits configuration; it does not claim an email was sent.

20 public auth/session/isolation/redirect checks and 11 backend/gateway tests pass. Browser verified login101 → menu → logout → login102 → reload. pay.phongtroankhang.com custom domain/HTTPS active; old root/www temporarily redirect. Credentials stay in ignored qa/private/demo-login-accounts.md. Scope and access model: phases/phase-08-demo-login-and-pay-subdomain.md. Protected mobile runtime remains unchanged.

## 07/10/2026 — Contract confirmation email, approved option 1

Implemented the user-selected emerald apartment/document/key banner, using the original Electron AK logo in navy/green. Body and CTA remain live HTML. Browser verified desktop and 390px mobile with no horizontal overflow. Gmail MIME includes the real banner as an inline CID image; 18 email/delivery checks and typecheck passed, Electron TEST rebuilt/restarted. Full normalized comparison and five fidelity surfaces documented in `design-references/contract-confirmation-email-20261007/design-qa.md`. No new email was sent during design QA; the next send uses this template. Existing contract-confirmation links and database state remain intact.

final result: passed

## 07/10/2026 — Chính sách hủy do lập nhầm

- Giữ component và màu nhận diện Electron hiện tại; bổ sung hai dropdown lý do và hồ sơ đối chiếu, lý do chi tiết, checkbox admin. Đây là cập nhật nghiệp vụ theo yêu cầu triển khai, không có direction thiết kế mới.
- Hộp hủy giữ tiêu đề và hàng nút hành động cố định; nội dung giữa cuộn khi chiều cao cửa sổ thấp. Chỉ bật Hủy và gửi thông báo khi backend cho phép và đã nhập đủ.
- Giao diện QA dùng dữ liệu giả và adapter không ghi backend/không gửi thư. Ảnh `qa/contract-cancellation-policy.png`.
- Hợp đồng hủy có màn trạng thái Gmail, nút gửi lại khi lỗi chắc chắn chưa gửi và lịch sử gửi riêng. Không có bước đồng ý của khách.
- 18 live policy checks, 18 lifecycle regression checks, 21 initial contract/history checks và 37 unit checks về backend/Gmail/feedback đều đạt. Source policy production khớp project test; không tác động hợp đồng hoặc email thật trong QA.
