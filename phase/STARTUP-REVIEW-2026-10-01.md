# Rà soát loading toàn bộ module — 2026-10-01

## Kết luận và tiêu chí

**Chưa chứng minh đạt dưới 3 giây cho toàn bộ module.** Mục tiêu bao gồm
giao diện có thể thao tác và dữ liệu cần thiết tải thành công, không chỉ mở cửa
sổ hoặc tải xong JavaScript. Cần đo cả khởi động đầu tiên và lần mở sau, từng
tab chính, các phần báo cáo/đầu tư, modal, lỗi mạng và tập dữ liệu lớn.

Đợt này triển khai các thay đổi ở đường tải code/cache đọc và công cụ đo.
Không triển khai migration, không đổi công thức tiền/nợ, không restore dữ liệu,
không chạy BAT phát hành, không commit/push/publish. Có một sự cố cô lập trong
benchmark ban đầu, được mô tả riêng phía dưới; vì vậy không khẳng định tuyệt
đối rằng toàn bộ quá trình chạy thử ban đầu không thể tác động dữ liệu.

## Phase A — Sửa độ tin cậy của phép đo và cô lập kiểm thử (đã làm)

Vấn đề:

- Benchmark cũ có safe-window/sleep; số 2.09s/2.04s chỉ là kiểm tra tiến trình.
- Mốc `renderer-mounted` được gửi ngay sau `createRoot.render`, trước commit.
- `data-ready` chỉ kiểm tra hết loading; truy vấn lỗi cũng có thể hết loading.
- Chỉ đặt APPDATA/LOCALAPPDATA không đảm bảo Electron trên Windows chuyển
  profile. Lượt đo ban đầu nhận được một phiên đăng nhập thật.
- Thiếu cleanup/finally và khôi phục biến môi trường.

Cách thực hiện:

- `StartupPaint` đo sau effect và hai animation frame; đó là cơ hội paint của
  renderer, không phải bằng chứng rằng từng màn hình đã hoàn thành dữ liệu.
- `login-painted`, `authenticated-painted`, `rooms-data-painted` tách riêng.
  Mốc dữ liệu phòng yêu cầu rooms/invoices/activeContracts/serviceZones/
  moveInReceipts/appSettings và workflow tài sản thành công (hoặc không có phòng).
- `module-code-ready` chỉ phát nếu cả 19 import tab/modal thành công. Có mốc
  lỗi riêng; không biến lỗi thành ready. Các phần import tĩnh bên trong tab
  được tải cùng tab; API giá, ảnh/font và dữ liệu chi tiết không được tính là ready.
- Benchmark đặt rõ `appData`, `userData`, `sessionData`, `temp` của Electron,
  trước khóa instance/migration/handlers/window. Chỉ nhận thư mục tên GUID do
  script tạo trực tiếp trong OS temp; thiếu/sai đường dẫn phải dừng.
- Preload truyền chế độ benchmark; renderer bỏ khôi phục phiên thật và chặn
  auto-post SePay. Auto-update và Telegram bị tắt trong chế độ này.
- Script yêu cầu mốc `profile-isolated`, login và code module; nếu thấy phiên
  authenticated thì đánh lỗi. Dọn cây tiến trình, kiểm tra đường dẫn trước khi
  xóa thư mục test, khôi phục mọi biến môi trường bằng finally.
- Kết quả lưu scope, hash ASAR, thời gian từng mốc, timeout/error tách biệt;
  working set chỉ của main process, không phải RAM toàn bộ Electron.

Sự cố lượt đo ban đầu: sáu lần chạy khoảng 19:13–19:14 giờ máy nhận phiên có
sẵn thay vì profile mới. Đã đóng toàn bộ tiến trình test và loại các số liệu
đó. App có auto-sync SePay khi giao dịch khớp đúng số tiền; không có audit log
ghi DB trong phép đo đó, nên **chưa đủ bằng chứng để xác nhận có/không phát sinh
ghi dữ liệu trong lượt chạy sai**. Không tự restore hoặc ghi đè dữ liệu để xử lý.
Các kiểm thử an toàn mới kiểm tra rằng benchmark không gọi khôi phục session
hoặc auto-post SePay. Phép đo được giữ lại bên dưới dùng bản đã sửa.

## Phase B — Giảm công việc startup và dung lượng đóng gói (đã làm)

Vấn đề: Google SDK chỉ cần cho Gmail dev nhưng import sớm; đưa googleapis vào
devDependencies mà không externalize vẫn có thể bundle gần 30 MB. Import bằng
đường dẫn ghép không tạo module build, làm hỏng dev. Bỏ toàn bộ Gmail handlers
trong production cũng làm thiếu IPC. TTS và demo không cần ở đường startup.

Cách thực hiện:

- Giữ static import module Gmail nhỏ và đủ ba IPC handler; production trả
  unavailable như thiết kế. Google SDK external và chỉ import khi OAuth/send
  dev thực sự chạy. Không đổi tính năng email Edge Function.
- `node-edge-tts` chỉ import khi cần tạo audio chưa có cache.
- Loại Google dependency tree và `generated_demos`, `design-demos` khỏi ASAR.
- Verifier chuẩn hóa dấu phân cách Windows khi tìm file cấm, dùng đường dẫn
  native khi thống kê file bytes. Kiểm tra version và installer hiện tại.

Kiểm chứng: build/typecheck đạt. Test Gmail production không tải SDK/đọc token;
dev availability vẫn có handler và không tải SDK. Dependency graph từ require
và dynamic import của main có 40 manifest (utils, adm-zip, asar, TTS và nhánh
con), không phụ thuộc các Google package bị loại. Đây không thay cho thử gửi
Gmail, TTS qua mạng hoặc cập nhật thực tế; các thao tác đó chưa chạy.

Artifact 1.0.97 / Electron 44.4.5:

- Installer: **114,205,203 bytes** (~114.21 MB).
- ASAR: **8,486,401 bytes** (~8.49 MB); tổng file trong ASAR 8,400,902 bytes.
- Renderer entry: ~655.59 KB; CSS chính ~308.22 KB.
- Đầu tư: ~344.01 KB JS + 140.99 KB CSS; chart dependency ~365.55 KB JS.
- Không có entry Google/demo bị cấm. Không cắt locale/DLL/sandbox để giảm size.

Installer vẫn chủ yếu chứa Electron/Chromium; không suy ra phần trăm tăng tốc
từ số MB giảm. Các version/source trước khác nhau nên chưa có A/B tương đương.

## Phase C — Giảm độ trễ mở tab lần đầu (đã làm một phần)

Vấn đề: lazy tab giảm entry, nhưng lần mở đầu phải import thêm code và tải thêm
dữ liệu. Cache dùng chung đã có nhưng tenants/contracts/cashTransactions/
allRoomAssets chưa được làm ấm khi màn hình phòng sẵn sàng.

Cách thực hiện: import nền 19 tab/modal sau 250ms, không mount component;
sau khi dữ liệu chính thành công, prefetch bốn nhóm đọc trên bằng chính cache
key của tab. QueryClient chia sẻ request đang chạy khi người dùng mở tab cùng
lúc. Chỉ đánh `shared-data-prefetched` nếu cả bốn query có status success.

Giới hạn: chưa prefetch từng tháng hóa đơn, snapshot từng phòng, người dùng
admin, số dư đầu tư, ảnh hay giá thị trường. Prefetch tăng lượng đọc/RAM nền;
chưa đo trên dữ liệu lớn. Không mount tất cả màn hình để chạy các effect/mutation.
Không lưu bản dữ liệu persistent mới và không dùng cache để bỏ kiểm tra tài khoản.

### Cập nhật Phase C2 — trì hoãn dịch vụ main không cần cho màn hình đầu

`src/main/index.ts` trước đây nạp tĩnh crawler thị trường, cập nhật, Telegram
và fund NAV cùng main entry. Các dịch vụ này không cần để vẽ màn hình phòng/
đăng nhập. Đã đổi thành dynamic import: handler fund NAV/crawler chỉ nạp khi
IPC được gọi; updater và Telegram khởi tạo sau `createWindow()`. Gmail IPC vẫn
đăng ký ngay vì renderer cần biết availability, còn Google SDK chỉ nạp khi OAuth
hoặc gửi mail dev.

Kết quả build source: main entry giảm từ **132.58 KB xuống 58.84 KB** (~55.6%
ít byte entry, chưa phải 55.6% thời gian toàn app). Các chunk tùy chọn được tạo
riêng: market crawler 37.39 KB, updater 33.45 KB, Telegram 3.95 KB, fund NAV
2.38 KB. Đây là giảm parse/evaluate lúc mở; lần đầu dùng các tính năng đó sẽ
có thêm độ trễ import. Đã kiểm tra typecheck, package smoke benchmark và test
bảo đảm không còn static import các module này.

### Cập nhật Phase C3 — dùng cache đọc chung an toàn

Đã thêm `invoice-summary-query.ts`: counts/tổng hợp tháng dùng query `invoices`
đầy đủ trong QueryClient, dedupe request đồng thời và seed page đầu khi cache
còn mới. Thuật toán được đối chiếu với hàm cũ trên 10.006 hóa đơn fixture.
Realtime invalidation xóa cả hai summary key. Không cắt lịch sử: export/paging
vẫn tải đủ trang.

Đã thêm `wallet-summary-query.ts`: đầu tư và các màn hiển thị dựng số dư từ
cache `cashTransactions`/`invoices`/`appSettings`, tránh ba lượt đọc trùng lúc
mở tab. Trước khi ghi chuyển tiền, `readOperating: getWalletBalanceSummary`
vẫn đọc remote mới; `getWalletBalanceSummary` cũ không bị thay semantics. Đầu
tư có dedupe load, giữ portfolio cũ khi lỗi và nút Thử lại; không còn hiển thị
số dư 0 như thể tải thành công khi query lỗi.

Đã thêm test ledger và cache (10.000+ invoice, trạng thái cancelled/merged/
settlement, số dư âm, invalidation, concurrent request, lỗi mạng). Không test
với Supabase production.

### Cập nhật Phase C4 — loại dependency renderer khỏi runtime và chia idle preload

Supabase client/query cache, chart, icon, lightweight chart và print chỉ được
bundle vào renderer; main/preload không import chúng. Đã chuyển chúng sang
`devDependencies` để electron-builder không copy node_modules dư vào ASAR.
Dependency main thực sự dùng (TTS, ZIP/ASAR, crawler khi gọi) vẫn giữ. ASAR
giảm từ **8.486.401 xuống 5.171.141 bytes**; tổng file ASAR hiện 5.238.282
bytes theo verifier; installer hiện **113.806.908 bytes**. Không xóa locale,
Chromium DLL, sandbox hay dữ liệu người dùng.

Font Awesome CSS/font không còn import đồng bộ trước renderer. Nó được nạp sau
hai animation frame, có marker thành công/lỗi; icon legacy vẫn được giữ. 19
tab/modal không còn import đồng thời sau 250ms: chia hai wave trong
`requestIdleCallback` (fallback 1,2s), cách nhau 400ms. Mục tiêu là không chiếm
main thread trước paint; `module-code-ready` vẫn kiểm tra đủ tất cả wave.

Artifact mới tạo các chunk main riêng: index **58.84 KB**, market crawler
37.39 KB, updater 33.45 KB, Telegram 3.95 KB, fund NAV 2.38 KB. Renderer entry
**655.42 KB**, CSS chính **217.39 KB**. Build/typecheck/package verifier đạt.

Phép đo software trên artifact cuối (3 profile test cô lập): lần 1 sau package
paint 5.801s/code 6.251s; 2 lần sau paint **0.332–0.369s**, code
**0.775–0.807s**, main working set **99.2–102.0 MB**. Lần đầu vẫn vượt 3s do
cold process/OS/package extraction trên máy đo (profile marker đã mất 3.958s
trước renderer), không đủ bằng chứng quy lỗi cho JavaScript. Vì vậy mục tiêu
cold-start dưới 3s chưa đạt; lần mở nóng đạt ở phạm vi login + module code.

Profile đăng nhập hiện cũng dùng projection rõ ràng thay cho `select('*')`,
không tải `password_hash` hoặc cột không dùng trong lần khôi phục phiên. Việc
này giữ nguyên kiểm tra trạng thái active/role nhưng giảm payload và tránh đọc
dữ liệu nhạy cảm; thời gian Supabase/auth thực tế vẫn cần đo trên mạng thật.

### Cập nhật Phase C5 — rebuild artifact và kiểm tra A/B đóng gói

Đã rebuild từ source sau khi thử nghiệm `out/renderer/**/*` trong `asarUnpack`.
Cấu hình cuối unpack `out/main/**/*`, `out/preload/**/*` và riêng renderer entry
`out/renderer/assets/index-*.js`; các chunk renderer còn lại vẫn ở ASAR. Unpack
toàn bộ renderer đã được loại bỏ vì thử nghiệm làm cold login tăng khoảng 4.60s
và module code khoảng 5.05s. Artifact hiện tại khớp source config.

Verifier hiện tại ghi nhận installer **113,813,192 bytes**, ASAR payload
**4,378,405 bytes**, tổng file logic trong ASAR **5,242,434 bytes**, Electron
runtime **44.4.5**, forbidden entries **0**. SHA-256 ASAR benchmark là
`E455E1110F671270FF962F1DFDF82C1A3E0E1DFE471EEAFC5633EEDDCC2417E0`.

Benchmark profile mới không khôi phục phiên đăng nhập và không gửi mutation:
software lần 1 sau package login paint **5.57s**, module code **6.01s**; software
lần 2–5 login **0.33–0.40s**, module **0.76–0.85s**. Lượt smoke cuối cùng
`-Mode both -Runs 3` trên artifact sau Phase C9 có software lần cold login
**6.18s**, module **6.66s**; hai lượt warm login **0.38–0.40s**, module
**0.85–0.88s**; GPU login **0.40–0.87s**, module **0.83–1.29s**. Main working
set quan sát được khoảng **100.7–104.3 MB**; đây chỉ là main process. Cold
process/OS cache vẫn khiến lượt software đầu vượt 3 giây, nên chưa chứng minh
cold startup hoặc authenticated data của từng module dưới 3 giây.

Đoạn này là số liệu lịch sử trước C10; bảng “Phép đo bản cuối” ở cuối tài liệu
và `electron-start-benchmark.json` mới là artifact hiện tại.

### Cập nhật Phase C6 — giảm CPU khi dựng danh sách phòng

`getRoomListSummary` trước đây tạo nhiều mảng trung gian (`filter`/`find`/
`some`) và sort danh sách nợ riêng cho từng phòng. Đã đổi sang một vòng quét
read-only, vẫn giữ nguyên các quyết định: hóa đơn nợ cần chặn, hóa đơn tháng đầu,
khả năng hủy hợp đồng, xóa phòng và trạng thái đã bắt đầu tính tiền. Không đổi
truy vấn, công thức tiền hoặc dữ liệu. Test đối chiếu giữ nguyên kết quả trên
fixture hiện có; benchmark CPU tổng hợp 10.000 hóa đơn × 100 lượt giảm từ khoảng
**186ms xuống 116ms** (chỉ là phép đo hàm, không phải thời gian mở app).

Truy vấn `activeContracts` của dashboard cũng được chuyển từ `select('*')` sang
projection 11 cột cần thiết; truy vấn lịch sử `getContracts()` của tab Hợp đồng
giữ nguyên đầy đủ trường. Đây là tối ưu payload đọc, không phải giới hạn lịch sử.

### Cập nhật Phase C7 — đọc lịch sử hóa đơn theo wave song song

Đã thêm `fetchAllPages`: lấy trang đầu để xác định có dữ liệu tiếp, sau đó đọc
 tối đa 3 trang 1.000 dòng song song trong mỗi wave và chỉ kết thúc ở trang ngắn
 đầu tiên. Các trang vẫn được ghép theo offset, nên không bỏ dòng, không giới
 hạn lịch sử và không thay đổi thứ tự. Áp dụng cho `getInvoices()` không giới
 hạn, hóa đơn công nợ, đếm tháng và tổng hợp tháng; các truy vấn có `limit` của
 màn hình vẫn giữ nguyên.

Test mô phỏng 10.005 dòng xác nhận đủ dữ liệu và thứ tự; với độ trễ 25ms/request,
thời gian đọc mô phỏng giảm khoảng **275ms xuống 159ms**. Đây là mức giảm số
round-trip lý thuyết; tốc độ thực tế phụ thuộc Supabase, mạng và giới hạn API.

### Cập nhật Phase C8 — unpack riêng renderer entry

Đã thử unpack toàn bộ renderer trước đó và loại bỏ vì làm startup xấu. A/B mới
chỉ unpack `out/renderer/assets/index-*.js`, còn các chunk tab và chart vẫn ở
ASAR. Artifact smoke benchmark tải đủ 19 module thành công, không có lỗi lazy
chunk. So với artifact chỉ unpack main/preload, ASAR payload giảm khoảng **656 KB**;
cold login giảm **5.58→5.49s**, module code **6.13→5.96s** trong lượt đo này.
Mức giảm nhỏ và cold vẫn vượt 3 giây, nhưng không có trade-off runtime quan sát
được nên cấu hình này được giữ lại.

### Cập nhật Phase C9 — phân trang đầy đủ cho ví

`getCashTransactions()` không giới hạn trước đây dựa vào một response có thể bị
Supabase cắt ở 1.000 dòng. Đã dùng chung `fetchAllPages` cho chế độ không giới
hạn, đồng thời giữ nguyên `limit/offset` cho các màn hình phân trang. Ví giờ đọc
đủ lịch sử và đọc theo wave; không dùng số liệu thiếu để hiển thị số dư hoặc kiểm
tra giao dịch.

### Cập nhật Phase C10 — khóa tính đúng của phân trang song song

Rà soát phát hiện hai rủi ro trước đây: bộ đếm tháng và tổng hợp tháng sửa
accumulator ngay trong callback. Những trang speculative sau trang ngắn có thể
được cộng dù `fetchAllPages` bỏ chúng. Đã chuyển cả hai hàm sang cộng trên danh

sách trang được chấp nhận sau khi reader trả về. Các truy vấn này và công nợ
được thêm `order('id')` ổn định để các dòng có cùng thời gian không đổi vị trí.

`fetchAllPages` nay ghi rõ điều kiện: fetcher không có side effect, thứ tự phải
ổn định và duy nhất, dữ liệu không thay đổi trong lúc đọc. Đây là offset paging,
không phải snapshot transaction; concurrent insert/delete vẫn cần RPC hoặc
cursor nếu hệ thống yêu cầu tính nhất quán tuyệt đối. Test mới bao phủ 0, 1.000,
3.000 và 10.005 dòng, trang cuối đúng biên, hoàn thành không theo thứ tự, lỗi
giữa wave, loại trang speculative và giới hạn concurrency.

Projection active contract được gắn kiểu `ActiveContractListItem` để trình biên
dịch bắt lỗi khi consumer đòi trường không được đọc. Điều này giảm payload
dashboard nhưng không ảnh hưởng lịch sử hợp đồng.

Lịch sử hóa đơn mở từ phòng/modal (`getRoomInvoices`, `getInvoicesByRoom`) cũng
được đưa qua reader có thứ tự `created_at,id`; một phòng có hơn 1.000 hóa đơn
không còn bị giới hạn ngầm ở trang đầu.

### Cập nhật Phase C11 — bảo toàn các danh sách lớn khi làm ấm module

Các danh sách `tenants`, `contracts`, `activeContracts`, `room_assets` và tham chiếu biên lai nhận
phòng trước đây còn đọc một response không giới hạn. Đã chuyển chúng sang các
wave có giới hạn, thứ tự ổn định và đầy đủ trang. Việc này tránh mất dữ liệu khi
vượt ngưỡng PostgREST, đồng thời cho phép cache dùng chung của các tab nhận đúng
tập dữ liệu. Không thay đổi các truy vấn ghi hoặc dữ liệu production.

Cập nhật phạm vi kiểm thử: reader/cache và fixture database đạt **18/18**.
Fixture dùng chính export của `db.ts`, mô phỏng PostgREST cắt response ở 1.000
dòng và xác nhận đủ 2.505 dòng từng reader. Không tính mốc `<3s` cho dữ liệu sau
đăng nhập, DOM hay thao tác từng module cho tới khi có e2e cô lập tương ứng.

### Cập nhật Phase C12 — giảm chờ preload và sửa chứng cứ đo

Vấn đề: sau paint, code tab có thể bị chậm thêm giây khi chờ idle và nạp chunk.
Đã bỏ requestIdleCallback/fallback 1,2s, nạp nền 19 import bằng task sau React
commit. Không mount tab hoặc chạy effect nghiệp vụ. Task này không đảm bảo
paint chạy trước import; vì vậy hai mốc được đo riêng. Phiên nóng cho thấy
code không còn chờ 400ms giữa hai wave. Biến thiên giữa các lượt đầu vẫn lớn,
không quy toàn bộ cải thiện cold cho thay đổi preload.

Benchmark lưu bản riêng trong `phase/benchmarks` mỗi lần, ngoài file kết quả
mới nhất. Hash ASAR/EXE/unpacked được tính sau các lượt đo để tránh chủ động
đọc và làm nóng file trước launch. Verifier ghi cả tổng dung lượng cài đặt,
không coi chuyển byte từ ASAR sang unpacked là giảm dung lượng tổng.

Version source đổi sang 1.0.98 trong lúc đóng gói; verifier đã từ chối artifact
1.0.97 thiếu đồng bộ. Đã đóng gói lại và verifier xác nhận bản 1.0.98 hiện tại.

### Đo lại sau C10

Sau khi đóng gói lại source C10, benchmark cô lập `-Runs 3 -Mode both` ghi nhận:

| Chế độ / lần | Login sau paint (s) | Module code ready (s) |
|---|---:|---:|
| Software 1 | 3.01 | 3.02 |
| Software 2–3 | 0.36–0.37 | 0.39–0.40 |
| GPU 1–3 | 0.39–0.63 | 0.40–0.63 |

Lượt software đầu đã gần mốc nhưng vẫn cao hơn khoảng 0,02 giây; đây vẫn là
profile mới trong OS cache, không phải cold boot toàn máy. Các mốc trên chỉ là
login/module code, chưa có phiên xác thực hay dữ liệu từng module, nên chưa thể
chốt mục tiêu toàn bộ module dưới 3 giây.

## Phase D — Rà soát từng module và phần còn lại (chưa triển khai)

| Phần | Vấn đề cụ thể / bằng chứng source | Cách thực hiện và gate kiểm chứng |
|---|---|---|
| Launcher | `start.bat` vẫn chạy `npm run dev`, có Vite/build/watchers. | Đo mục tiêu trên launcher production. Dev phục vụ sửa code; không dùng thời gian dev làm chuẩn cho bản cài. |
| Đăng nhập | `getCurrentSessionUser` chờ profile `users`; timeout UI 6s. Refresh token có thể thêm lượt mạng. | Đo DNS/TLS/auth/profile riêng. Tối ưu payload/hạ tầng khi có bằng chứng; giữ xác minh status/role và hành vi khóa tài khoản. Không giảm timeout để giả vờ đã ready. |
| Phòng | Root gọi `getInvoices()` full history trước khi sẵn sàng. Hàm đọc từng trang 1.000 dòng nối tiếp, select toàn bộ trường. Workflow assets phụ thuộc room IDs nên thêm một bước sau rooms. CPU dựng summary từng phòng đã được tối ưu một vòng quét; tải mạng full history vẫn là điểm nghẽn cần fixture riêng. | Tách projection/tổng hợp đọc cho danh sách phòng, nợ và SePay; tải chi tiết khi cần. Snapshot fixture 1k/10k/50k hóa đơn, so sánh đủ dư nợ/partial/merged/cancelled/khách cũ trước khi đổi truy vấn. Không thêm limit cắt lịch sử. |
| Khách thuê | Cần tenants, rooms, contracts, invoices. Prefetch mới hỗ trợ nhưng dữ liệu tenants/contracts đọc không phân trang toàn bộ rõ ràng. | Lập row budget và test giới hạn PostgREST; phân trang đầy đủ hoặc projection. Cache theo key có invalidation và clear khi logout. Không coi default `[]` là dữ liệu thật. |
| Hóa đơn | Tab có phân trang, nhưng đồng thời tải month counts bằng quét toàn lịch sử và month summary bằng quét tháng. Root vẫn tải full invoices. | Dùng tập full cache đã xác minh hoặc RPC tổng hợp đọc, cùng một snapshot/semantics. Giữ bộ lọc, số đếm, tổng tiền và export toàn bộ. Đo request/bytes/first page khi mở tháng mới. |
| Hợp đồng | Đọc full contracts ngoài activeContracts; rooms/invoices/settings chia sẻ cache. | Dùng summary projection và phân trang danh sách; load template/chi tiết khi mở hợp đồng. Test trạng thái kết thúc/chuyển phòng và in. Không dùng activeContracts thay toàn bộ lịch sử. |
| Tài sản/xe | Tab cần allRoomAssets và snapshot move_in theo occupied IDs; mở chi tiết cần thêm room_assets, ba loại snapshot và xe. | Prefetch theo hover/chọn phòng, dedupe request cụ thể; batch có giới hạn danh sách ID. Đo ảnh và DOM; không tải sớm ảnh mọi phòng. Test đầy đủ bàn giao/hư hỏng/khấu trừ. |
| Ví | Cần cashTransactions/invoices/settings; opening_balance ảnh hưởng kết quả. Đã bổ sung đọc đủ trang cho cash_transactions; cần vẫn kiểm thử dữ liệu thật lớn và tổng RAM. | Kiểm tra completeness trước tối ưu; pagination hoặc aggregate read-only, không hạn chế history để lấy số dư nhanh. Thử >1.000 bút toán và đối chiếu cả tiền mặt/chuyển khoản/hoàn cọc. |
| Báo cáo | BusinessReport đọc sáu nhóm và dùng nhiều default `[]` nhưng chưa có gate loading/error đầy đủ. Số 0 có thể xuất hiện trước khi dữ liệu đủ. Range cash query lại đọc riêng. | Bổ sung readiness/loading/error theo dependency của từng subtab; tách tổng hợp khỏi DOM. So sánh overview/P&L/cọc/thu chi/điện nước/nợ trên cùng fixture; số 0 chưa chứng minh đã load xong. |
| Đầu tư | Load dùng Promise.all local store + getWalletBalanceSummary, một nhánh chậm chặn cả hai. Nhánh reject không có finally/error trong load. Mỗi 30s/focus gọi lại summary đọc cash/invoices/settings. | Tách trạng thái local và số dư online; lỗi phải có retry, không kẹt loading hoặc giả số dư 0. Chia sẻ các query đọc, giữ refresh số dư trước giao dịch; không dùng số dư cache để quyết định ghi tiền. Đo lần mở tổng quan và từng tracker. |
| Vàng/cổ phiếu/quỹ | API báo giá/history riêng; code tracker import tĩnh cùng InvestmentsTab. Tải JS chưa có nghĩa API thành công. | Cache báo giá có timestamp/TTL và nhãn dữ liệu cũ, hủy request không dùng; prefetch có ưu tiên khi chọn tracker. Tách trạng thái dữ liệu mới/chưa có/lỗi. Không hứa API bên thứ ba luôn dưới 3s. |
| Cài đặt/email | General, users/admin, Gmail availability có dependency khác nhau. Làm ấm SettingsTab không đọc các nhóm này. | Đo từng section; chỉ tải users sau xác thực quyền. Giữ handler availability production; gửi mail chỉ kiểm thử trên môi trường riêng với người nhận test. |
| Modal/in/xuất/TTS | Import modal đã làm ấm, nhưng room/invoice detail, font/ảnh, capture/export và giọng nói vẫn cần công việc riêng. | Đo click-to-interactive riêng; prefetch đọc theo phòng chọn. Tài liệu/ảnh phải đủ font và đủ dữ liệu; cache audio theo nội dung. Không bỏ gate readiness tài liệu để báo nhanh giả. |
| Đồng bộ nền | Rooms polling, realtime debounce 250ms, SePay có effect ghi thanh toán. | Khi đo dữ liệu phải dùng môi trường/fixture độc lập, chặn mọi mutation/auto-sync trước khi mở app. Giữ realtime và refresh sau mất kết nối. Không mount hàng loạt tab vào production để benchmark. |
| DOM/RAM/GPU | Phòng vẫn render toàn bộ danh sách; hóa đơn tăng dần 100 dòng. Khối thông báo/cảnh báo có một số loop mỗi render. GPU từng có lịch sử lỗi driver. | Profile commit/frame time trước; memo/virtualization cho danh sách lớn, giữ focus/menu/edit/export. Đo tổng RAM các process, CPU idle và long tasks. GPU vẫn tùy chọn; vài lần startup không đủ chứng minh mượt hoặc ổn định. |
| Khởi động đầu tiên | Lần đầu sau package >3s, phần lớn trễ xuất hiện trước marker cô lập main. | Tách thời gian OS/process/main-import/renderer bằng trace; đo nhiều lần cold trên máy đích. Chưa có bằng chứng kết luận do Defender/ổ đĩa. Không tắt antivirus hoặc xóa profile để cải thiện số đo. |

## Phép đo bản cuối

`scripts/benchmark-electron-start.ps1 -Runs 3 -Mode both -TimeoutSeconds 12`,
profile test mới mỗi lần. Các lần sau vẫn được lợi từ
cache OS; không coi profile mới là cold boot toàn máy. Toàn bộ lượt hoàn thành
scope login/code, không có marker authenticated hay data-ready.

| Chế độ / lần | Login sau paint (s) | Code module ready (s) | Main working set (MB) |
|---|---:|---:|---:|
| Software 1 — package profile mới nhất | 3.53 | 3.54 | 99.5 |
| Software 2–3 — warm | 0.32–0.40 | 0.33–0.41 | 99.5–102.6 |
| GPU 1–3 | 0.35–0.64 | 0.31–0.34 | 99.3–102.1 |

Hash ASAR: `299FC3B956ADAA79008C1D8417923C6F627033540DDCD6D0F2DC8170D42B2C91`.
Raw report: `electron-start-benchmark.json`. Không có benchmark before/after
cùng source/dataset/máy nên **chưa tính phần trăm tăng tốc**. RAM trên đây chỉ
main và được lấy ở một thời điểm; không so sánh tổng RAM/scroll FPS bằng nó.

Verifier package hiện tại: installer **113,813,597 bytes**, ASAR vật lý
**4,380,390 bytes**, file logic trong ASAR **5,244,862 bytes**, phần unpacked
**944,856 bytes**, tổng cây dist/win-unpacked **390,649,301 bytes**. Byte
unpacked là phần tách khỏi ASAR, không được tính là giảm tổng dung lượng cài đặt.

## Kiểm chứng và thứ tự tiếp theo

- Typecheck node/web và Vite build: đạt; package Windows dùng `--publish never`.
- Verifier package: đạt với version và size bên trên; runtime graph không
  có dependency Google bị loại.
- Toàn bộ suite chạy với `node --test scripts/*.test.cjs scripts/*.test.mjs`:
  **74 test đạt, 1 skip có chủ ý, 0 lỗi**. Nhóm mới bao gồm startup/Gmail/
  isolation, cache/ledger, SePay safety, invoice debt, room summary và release
  artifacts. Test dùng mock/fixture, không kết nối database production.
- Không chạy thử gửi mail, gọi TTS, updater install hoặc giao dịch đầu tư thật.
- `npm run lint` trước đó không đạt: 571 errors, 16.666 warnings trên toàn repo.
  Chưa xác định hết nguồn gốc từng lỗi; không tự format hàng loạt hoặc gọi kết
  quả lint là đạt. Typecheck và test đạt không thay thế kiểm tra này.
- Package smoke benchmark cuối: 3/3 software và 3/3 GPU đạt `login-painted` và
  `module-code-ready`; trước đó có thêm lượt software 5/5 đạt cùng mốc. Không
  còn tiến trình DBY HOME sau cleanup. Môi trường PowerShell được khôi phục.

Ưu tiên kế tiếp: (1) fixture/end-to-end riêng với mutation và auto-sync bị chặn;
(2) completeness và projection/tổng hợp cho dữ liệu lịch sử; (3) readiness từng
module và tránh request trùng ở số dư đầu tư; (4) đo cold-start/DOM/RAM rồi mới
quyết định virtualization/GPU. Chỉ chốt đạt mục tiêu khi từng module thao tác
được với dữ liệu đúng dưới 3s trong bộ kịch bản được ghi rõ. Mất mạng/API ngoài
không thể đảm bảo có dữ liệu mới trong 3s; cache cũ phải được nhận diện rõ.
