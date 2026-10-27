# Phase 17 — Môi trường Staging E2E phòng 999

Ngày chốt phương án: 13/10/2026.

## Mục tiêu

Cho phép chủ nhà kiểm thử toàn bộ vòng đời bằng giao diện Electron và website thật trên điện thoại:

**Electron staging → lập hợp đồng → website staging → chụp điện/nước → Gemini OCR → khách xác nhận → lập hóa đơn → SePay Simulator → trạng thái đã thanh toán → tất toán.**

Giao diện, component và quy tắc nghiệp vụ dùng cùng source với bản vận hành. Dữ liệu staging có thể ghi, sửa và xóa như giao dịch thật nhưng chỉ tồn tại trong môi trường TEST. Không dùng bản ghi phòng 999 của production làm dữ liệu kiểm thử.

## Quyết định kiến trúc

```text
Electron production                         Electron staging
  └─ profile production                       └─ profile .staging-test-profile
  └─ Supabase production                      └─ Supabase TEST + schema staging
  └─ pay.phongtroankhang.com                 └─ test.phongtroankhang.com
  └─ SePay thật                               └─ SePay Simulator
  └─ Gmail/worker production                  └─ mail sink hoặc allowlist TEST
```

- Production và TEST dùng project, key, Auth, Storage, Edge Function, Pages project và secret khác nhau.
- Bản staging dùng cùng source code; chỉ thay cấu hình môi trường và profile Electron. Không duy trì một giao diện giả thứ hai.
- Supabase TEST hiện có project `gsianbstkmyutnhromwc` và schema `ankhang_contract_test`. Ưu tiên mở rộng schema này cho cả hợp đồng và thanh toán để Electron, Auth, RPC và website nhìn cùng bản ghi. Nếu chọn schema mới, phải chuyển toàn bộ luồng staging vào cùng schema đó; không chia hợp đồng và thanh toán sang hai schema không liên kết.
- Project TEST hiện có những bảng ứng dụng khác trong `public`. Reset chỉ tác động fixture được đăng ký trong schema staging; không xóa project hay schema khác.
- Nếu quota hoặc chính sách tài khoản không phù hợp, chuyển payment staging sang một Supabase project TEST mới. Script phải từ chối mọi ref production.

## Trạng thái nền hiện tại

- `test/room999-payment` là sandbox RAM, đã thử được camera/OCR/UI nhưng không đồng bộ với Electron.
- `ankhanghome-contract-test.pages.dev` và Electron TEST đã tách khỏi production cho hợp đồng/tài khoản; website này hiện chưa bật payment staging.
- `pay.phongtroankhang.com` đang là production, có SePay/worker thật; không dùng để kiểm thử.
- `test.phongtroankhang.com` chưa có DNS và chưa được gắn vào Pages project. Phase này mới là kế hoạch triển khai, chưa tạo domain hay ghi dữ liệu mới.

## Phạm vi triển khai

### 1. Electron staging

Tạo launcher riêng, ví dụ `start-staging-test.bat` và `webmobile/scripts/start-staging-test.mjs`:

- `KMAP_STAGING_TEST=1` bắt buộc.
- `KMAP_STAGING_PROFILE=webmobile/.staging-test-profile`.
- Build output riêng `webmobile/.staging-test-out`.
- App name/title riêng: `AN KHANG HOME · STAGING TEST · Phòng 999`.
- `app.getPath('userData')`, `sessionData`, Gmail token và file `phongtro_db.json` không trùng production.
- Không bật auto-update, Telegram, SePay thật hoặc Gmail production trong profile TEST.
- Khởi động thất bại nếu `SUPABASE_URL`, schema, Pages origin hoặc environment marker không đúng allowlist TEST.
- Renderer vẫn import component Electron hiện tại; không tạo bản UI khác để demo.
- `ensureDBLocation()` hiện có đường sao chép legacy `appData/app/phongtro_db.json` vào profile mới. Trong staging phải tắt đường sao chép này và khởi tạo file rỗng/fixture tổng hợp; thư mục profile riêng chưa đủ để bảo đảm không đọc dữ liệu cũ.
- Build frontend/backend dùng cùng commit nguồn và manifest phiên bản; không thay phiên Electron đang chạy hay build ghi đè thư mục `out`/bộ cài production.
- Kiểm tra các RPC quản trị/2FA mới mà source hiện tại gọi. Schema TEST phải có migration tương ứng; thiếu RPC thì báo lỗi cấu hình, không bỏ 2FA hay nới phân quyền để demo chạy được.

### 2. Database và backend staging

Tạo migration/schema staging từ các migration đã được kiểm thử:

- Phòng mẫu `999`, khách test, hợp đồng test, đơn giá và tài sản tổng hợp.
- Bảng hợp đồng, tenant account, payment cycle, meter photo/manual entry, invoice, payment event và receipt queue nằm trong schema TEST.
- RLS và RPC giống production, nhưng dữ liệu chỉ ở project TEST.
- Không seed CCCD, số điện thoại, email hoặc lịch sử thanh toán thật.
- Có `seed-staging-room999.mjs` để tạo lại fixture và `reset-staging-room999.mjs` để dọn theo một transaction.
- Mỗi bộ fixture có `run_id` và registry chứa room/tenant/contract/invoice/Auth user/storage object ID thuộc lượt thử. Các ID khác với dữ liệu production; tên hiển thị vẫn là phòng 999.
- Reset phải kiểm tra đúng project/schema/registry, khóa lượt thử và xóa fixture trong một transaction. Auth/Storage là tài nguyên ngoài transaction database: thu hồi phiên và chặn worker trước, thực hiện dọn có thể chạy lại rồi xác minh từng loại tài nguyên. Nếu chưa dọn đủ thì báo lỗi, không thông báo thành công.
- Giao dịch SePay giả lập đã lưu không ngăn reset; phải có bằng chứng chúng được tạo bởi simulator của lượt thử. Phát hiện event không rõ nguồn hoặc ngân hàng thật thì dừng reset.
- Giữ tối thiểu hai tenant giả ở hai phòng TEST để kiểm tra truy cập chéo; phòng phụ là fixture QA, không thêm vào production.

### 3. Website `test.phongtroankhang.com`

- Tạo Pages project staging riêng hoặc mở rộng Pages project TEST hiện có nhưng không dùng project production.
- Gắn custom domain `test.phongtroankhang.com`, bật HTTPS và `X-Robots-Tag: noindex`.
- Backend gateway chỉ chấp nhận origin chính xác của domain test; Pages URL phụ phải có chính sách riêng hoặc chuyển về canonical domain, không mở wildcard.
- Hiển thị banner rõ: `MÔI TRƯỜNG KIỂM NGHIỆM · DỮ LIỆU KHÔNG PHẢI PRODUCTION`.
- Website chạy cùng `TenantHome`, `TenantPayment`, camera input, màn xác minh OCR và menu tenant hiện tại.
- Session/Auth cookie, gateway secret và Supabase anon key của TEST tách khỏi production. Cookie là host-only, không dùng `Domain=.phongtroankhang.com`; localStorage, cache/service worker và refresh token cũng không dùng chung origin/profile.
- Subdomain chỉ là địa chỉ truy cập: DNS `test` gắn vào Pages TEST riêng, không CNAME tới project `ankhanghome-payment` rồi cho rằng dữ liệu đã cách ly.

### 4. Chụp điện/nước trên thiết bị thật

Luồng dùng HTTPS để camera hoạt động trên iPhone Safari, Android Chrome và trình duyệt phổ biến:

1. Đăng nhập tenant TEST trên `test.phongtroankhang.com`.
2. Bấm **Chụp điện**; camera gốc điện thoại mở qua `input type=file`, `accept=image/*`, `capture=environment`.
3. Gửi JPEG `multipart/form-data` tới backend TEST; không đưa service key vào browser.
4. Gemini TEST dùng cùng model, prompt, hai lượt đối chiếu và bộ kiểm tra với production. Giữ độ phân giải/chất lượng JPEG hiện tại; không giảm độ chính xác để tăng tốc. Backend kiểm tra loại công tơ, dãy số, độ rõ và mức tiêu thụ.
5. Ảnh đạt vẫn dừng ở màn xác minh; khách phải đối chiếu ảnh, số cũ/mới và bấm **Xác nhận**.
6. Lặp lại với nước; ảnh sai/không rõ bị từ chối. Sau hai lỗi mới mở nhập thủ công và vẫn bắt buộc xác nhận.
7. Ảnh chỉ lưu trong bảng/bucket riêng tư TEST theo adapter hiện tại và được xóa khi reset/hết hạn; không lưu vào storage production. Không đổi cách lưu của nghiệp vụ chỉ để dựng demo.

Số đầu kỳ của fixture phải phù hợp ảnh công tơ sẽ chụp, có thể cấu hình trong bảng điều khiển QA. Ví dụ điện `12600 → 12692` là 92 kWh, nước `280 → 287` là 7 m³; fixture có giá thuê 3.500.000đ, điện 3.200đ/kWh, nước 35.000đ/m³, internet 50.000đ và vệ sinh 70.000đ thì tổng là 4.159.400đ. Các chỉ số chỉ dùng để thử, không điều chỉnh công tơ/phòng thật.

Giữ quy tắc tách phần thập phân như parser hiện tại: không xóa chữ số cuối một cách máy móc với mọi loại đồng hồ. Chỉ số sau OCR phải nhất quán với cách Electron ghi số nguyên và ảnh mẫu đã kiểm chứng.

Màn **Chụp lại / Sử dụng ảnh** do camera gốc iOS cung cấp có thể vẫn xuất hiện; website không điều khiển được giao diện của hệ điều hành. Màn xác minh chỉ số của ứng dụng luôn được giữ. Nếu trình duyệt nhúng không hỗ trợ camera thì hướng dẫn mở bằng Safari/Chrome hoặc đi qua fallback manual có kiểm soát.

Gemini có thể dùng key TEST để kiểm tra độ chính xác thực tế. Regression test dùng provider fixture để không tốn quota; hai loại test không được trộn kết quả.

### 5. SePay Simulator

Không gọi API ngân hàng/SePay production. Tạo module `staging-sepay-simulator` có quyền chỉ dành cho admin TEST:

- Tạo event có `transaction_key`, tài khoản nhận, số tiền, nội dung chuyển khoản và timestamp.
- Chuyển event vào cùng hàm đối soát `process_server_sepay`/RPC tương đương của payment staging.
- Không có nút đánh dấu paid trực tiếp trên giao diện tenant.
- Các kịch bản bắt buộc, kỳ vọng bám đúng chính sách production hiện tại:
  - Đúng tài khoản + đúng nội dung + đúng số tiền còn thiếu → `paid`.
  - Thiếu tiền → giữ chờ/đối soát nếu hệ thống hiện chỉ tự ghi nhận khi đủ tiền. Không tự đổi thành `partial` bằng simulator. Kiểm tra `partial` qua nghiệp vụ thu một phần của admin nếu phần mềm hỗ trợ.
  - Sai nội dung hoặc sai tài khoản → không gắn hóa đơn.
  - Giao dịch trùng → không cộng lần hai.
  - Chuyển thừa → chờ đối soát theo chính sách hiện tại; không tự cộng vượt hóa đơn hoặc đổi nghiệp vụ để demo.
  - Event đến trễ hoặc retry → idempotent.
- QR staging dùng payload phi ngân hàng và ghi rõ `TEST`; không tạo mã chuyển tiền vào STK production. Bố cục hóa đơn vẫn dùng component hiện tại, số tài khoản hiển thị là giá trị kiểm nghiệm. Đối soát dùng account fixture nội bộ.
- Simulator endpoint không được bundle vào production và bị backend production từ chối.
- Endpoint admin TEST bắt buộc xác thực, kiểm tra quyền, môi trường, `run_id`, số tiền/nội dung và chống lặp event. Backend simulator tạo payload cùng cấu trúc đầu vào đối soát hiện tại; không giả chữ ký/secret của SePay thật.
- Luồng gửi event thử đi qua cùng bước normalize, match, ghi payment event và cập nhật hóa đơn của backend đang vận hành. Nếu dùng adapter riêng, phải kiểm chứng không bỏ qua bước xác thực môi trường/đối soát nghiệp vụ. Simulator chỉ kiểm tra phần mềm; nó không chứng minh kết nối ngân hàng hoặc webhook SePay thực tế.

### 6. Email và worker

- Email hợp đồng/biên lai chỉ tới allowlist TEST hoặc mail sink.
- Không dùng OAuth token Gmail production trong profile staging.
- Worker staging có queue riêng; chạy khi Electron tắt để kiểm tra đúng kiến trúc cloud.
- Không gửi thông báo tới khách thuê thật.
- Mặc định mail sink giữ HTML và link thật của TEST trong hộp thư QA riêng có đăng nhập. Chủ nhà có thể mở thư test/xác nhận hợp đồng trên điện thoại.
- Thử nhận Gmail thật là chế độ riêng: chỉ bật sau khi có địa chỉ allowlist được người dùng đồng ý; dùng phiên TEST đã kết nối, không gửi thư để chứng minh UI.
- Scheduler TEST không poll API SePay thật. Clock/kỳ thử dùng driver QA giới hạn TEST để mở kỳ đến hạn; không sửa thời gian hay ngày thanh toán production.

## Hàng rào an toàn bắt buộc

1. **Fail closed:** `ENVIRONMENT=staging` nhưng ref/schema/domain production thì không khởi động/deploy.
2. **Project allowlist:** TEST chỉ cho phép ref đã định danh; production ref bị cấm cứng trong script.
3. **Secret tách biệt:** gateway, anon/service key, Gmail và simulator không dùng lại secret production. Gemini ưu tiên project/key/quota TEST; nếu tái dùng key AI phải ghi nhận rõ dùng chung chi phí/hạn mức và chưa đạt cách ly quota. Credential triển khai cloud không được đưa vào Electron/browser/worker.
4. **Profile tách biệt:** Electron TEST không đọc/copy file `userData` production và không kế thừa session.
5. **Origin allowlist:** website TEST không gọi gateway production; website production không nhận cờ simulator.
6. **Quyền tối thiểu:** browser không có quyền gọi RPC ghi trực tiếp; service key chỉ nằm trong Edge Function.
7. **Kiểm chứng độc lập:** staging không giữ credential production, kể cả chỉ để đọc fingerprint. Công cụ audit riêng do người triển khai chạy có thể so sánh số lượng, hash dữ liệu nghiệp vụ và file/profile production trước/sau. Worker thật có thể tạo thay đổi hợp lệ trong lúc thử; khác biệt cần điều tra theo actor/log, không tự hoàn tác dữ liệu thật. Row count bằng nhau không đủ chứng minh an toàn.
8. **Không dùng mã phòng để bypass:** cờ test phải nằm ở backend/configuration, không phải chỉ dựa vào tên `999`.
9. **Reset có kiểm tra:** chỉ dọn registry của lượt thử trong schema TEST, có lock/transaction cho database và báo cáo riêng Auth/Storage đã dọn. Không `DROP` schema/project chứa dữ liệu TEST khác.
10. **Không quảng bá:** domain staging `noindex`, banner TEST và tài khoản chỉ dành cho QA.

## Kế hoạch thực hiện

### Phase 17.1 — Khóa môi trường

- Bổ sung guard staging cho Electron, Vite, Pages gateway và Edge Function.
- Tạo profile/output riêng, app identity riêng và kiểm tra không kế thừa local DB/Gmail.
- Tạo file cấu hình staging mẫu không chứa secret.
- Nghiệm thu trước khi mở luồng: cố tình trộn URL/key/schema/domain/profile production phải bị từ chối trước mọi thao tác ghi. Chạy đồng thời hai phiên Electron không chia sẻ khóa phiên hay folder.

### Phase 17.2 — Database/seed/reset

- Tạo schema payment staging và áp dụng migration.
- Viết seed/reset/health script.
- Kiểm tra RLS, RPC, duplicate invoice, tenant scope và reset rollback.
- Không chuyển nguyên dump production sang TEST. Mỗi migration áp dụng vào schema TEST cần kiểm tra mọi tên bảng/function/trigger/search_path, Auth/Storage và các URL gọi HTTP; không chỉ dùng replace `public.` rồi coi đã cách ly.

### Phase 17.3 — Website/domain

- Tạo Pages project TEST payment.
- Gắn `test.phongtroankhang.com` và HTTPS.
- Cấu hình backend edge TEST, cookie và origin.
- Kiểm tra production domain không nhận simulator.
- Thêm bước kiểm tra cấu hình live sau deploy; mỗi script phải nhận diện cố định Pages project TEST và Supabase TEST. Không chạy script deploy production với một cờ tùy chọn dễ bỏ quên.

### Phase 17.4 — Nối Electron ↔ website

- Electron staging tạo hợp đồng/tenant test.
- Website staging nhận đúng tenant và hợp đồng active.
- Dữ liệu điện/nước xác nhận từ điện thoại xuất hiện đúng trong Electron staging.
- Tài khoản tenant mới không thấy lịch sử tenant cũ.

### Phase 17.5 — OCR thiết bị thật

- Test iPhone Safari, Android Chrome, Chrome/Edge desktop.
- Test ảnh rõ, mờ, lóa, sai công tơ, số tăng bất thường, nhập thủ công sau hai lỗi.
- Đo thời gian upload, hai lượt Gemini và phản hồi UI.

### Phase 17.6 — SePay Simulator và reset

- Chạy toàn bộ kịch bản event ở trên.
- Kiểm tra idempotency, receipt queue và trạng thái Electron/website.
- Reset staging, chạy lại từ đầu ít nhất ba lần.

### Phase 17.7 — Vòng đời và lỗi thực tế

- Chưa đến kỳ: hiển thị ngày kỳ tiếp theo; đến kỳ: thông báo test có link đúng trang Thanh toán.
- Thêm khách và hợp đồng tháng đầu: kiểm tra khoản cọc/hóa đơn bàn giao như Electron; mở kỳ hằng tháng chỉ sau khi đạt điều kiện của nghiệp vụ thật.
- Khách xác nhận rồi thoát/reload: chỉ số chưa xác nhận không được lưu; chỉ số đã xác nhận tiếp tục được.
- Lập hóa đơn đồng thời từ Electron và website: chỉ tạo một hóa đơn của cùng hợp đồng/kỳ.
- Web mất mạng, Gemini timeout/quota, backend retry, double click, session/token hết hạn: không tạo thanh toán/hóa đơn trùng.
- Khách cũ trả phòng, chốt thanh toán/tất toán, thu hồi quyền; khách mới được cấp tài khoản mới và không thấy lịch sử thuê cũ.
- Các tiêu chí camera thiết bị thật có người kiểm thử xác nhận model điện thoại, phiên bản OS/browser và ảnh kết quả. Responsive emulator chỉ kiểm tra bố cục, không được ghi nhận đã test camera vật lý.

## Tiêu chí nghiệm thu

- Giao diện staging dùng đúng component Electron/tenant hiện tại.
- Có thể hoàn tất từ lập hợp đồng đến paid trên điện thoại thật.
- Camera hoạt động qua HTTPS trên iPhone Safari và Android Chrome.
- OCR đạt vẫn phải xác nhận; OCR lỗi mở manual đúng sau hai lần.
- SePay Simulator đi qua logic đối soát thật, không đổi trạng thái trực tiếp.
- Không có request staging nào tới production Supabase, production SePay hoặc Gmail khách thật.
- Audit không phát hiện thao tác TEST ghi/sửa/xóa production; khác biệt hợp lệ do vận hành thật phải được giải thích theo log. Không dựa riêng vào row count.
- Reset xóa toàn bộ dữ liệu phòng 999 staging nhưng không tác động production.
- Tắt Electron vẫn để worker staging hoạt động.
- `test.phongtroankhang.com` có banner TEST, HTTPS và không được index.

## Hồ sơ giao nhận và vận hành

- `webmobile/test/staging-e2e/README.md`: cách mở Electron TEST, mở website trên điện thoại, đăng nhập, chạy kịch bản và reset.
- Manifest đã triển khai: commit nguồn, phiên bản build, project ref, schema, Pages project, origin, profile và các job TEST; không chứa secret.
- Báo cáo nghiệm thu: kết quả guard môi trường, truy cập chéo, OCR, đối soát, tháng đầu/tất toán, audit và reset. Test chưa chạy phải ghi **chưa kiểm chứng**.
- Tài khoản/mật khẩu QA nằm trong file riêng đã ignore Git, không đưa vào phase hoặc bundle public.
- Khi đổi source: build lại staging, nghiệm thu rồi mới đưa thay đổi đã kiểm chứng lên production bằng quy trình release riêng. Việc dùng chung source không tự bảo vệ production khỏi một bản release lỗi.

## Chi phí và giới hạn

- Domain con không phát sinh phí riêng nếu domain chính đã có; DNS/Pages dùng Cloudflare hiện tại.
- Supabase TEST có thể dùng project hiện có trong hạn mức, hoặc tạo project riêng nếu cần cách ly/quota tốt hơn.
- Free tier có thể nghỉ khi không hoạt động và có giới hạn request/storage/worker; kiểm tra hạn mức hiện tại lúc triển khai, không cam kết chi phí bằng 0 hoặc uptime tuyệt đối. Cùng tài khoản cloud có thể dùng chung giới hạn/billing nên cần theo dõi budget.
- Gemini đọc ảnh thật có thể phát sinh phí; regression fixture không phát sinh phí AI.
- SePay Simulator không phát sinh phí giao dịch ngân hàng.
- Đây là môi trường staging có dữ liệu test; không gọi là “an toàn tuyệt đối”. Mục tiêu là fail closed và không có đường ghi production khi cấu hình đúng.
- Test trên thiết bị thật qua HTTPS hỗ trợ các trình duyệt phổ biến, không cam kết mọi thiết bị/trình duyệt đều có camera. Kiểm tra Safari iPhone, Chrome Android và một trình duyệt Android khác trên thiết bị thật; device farm trả phí chỉ bổ sung khi có nhu cầu.

## Trạng thái

**Chưa triển khai Phase 17.** Chưa tạo DNS `test.phongtroankhang.com`, chưa bật payment staging trên Pages TEST và chưa nối simulator vào website. Sandbox RAM và Electron/website contract TEST hiện tại vẫn giữ nguyên, không dùng chung dữ liệu production.
