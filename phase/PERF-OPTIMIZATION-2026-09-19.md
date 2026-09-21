# Electron Performance & Footprint Review — 2026-09-19

## Phạm vi

Review tĩnh source/build hiện tại, đo artifact đã build và chụp snapshot process. Phase 0/1 và các quick win Phase 3/4 đã được triển khai trong working tree; Phase 2 data layer đã có projection/range query an toàn, còn aggregate server-side và benchmark dữ liệu lớn vẫn cần staging dataset.

## Baseline đã đo

| Hạng mục | Giá trị hiện tại | Nguồn/ghi chú |
| --- | ---: | --- |
| `npm run typecheck` | Pass | main + renderer |
| `npm run build` | Pass, Vite transform 2.476 modules | build hiện tại |
| Renderer entry JS | 1,691.78 kB | `out/renderer/assets/index-*.js` |
| Renderer CSS | 198.88 kB | `out/renderer/assets/index-*.css` |
| Chunk `BusinessReport` | 1,034.32 kB | `out/renderer/assets/BusinessReport-*.js` |
| Renderer output | 15,796,028 bytes | `out/` |
| Packaged app `node_modules` | 19,202,196 bytes | `dist/win-unpacked/resources/app/node_modules` |
| Dữ liệu/ảnh không cần runtime bị đóng gói | 8,952,549 bytes | `tmp-product-design`, `design-references`, `_backups`, `_backup_work` |
| `win-unpacked` | ~385.8 MB (derived old artifact) | Baseline cũ gồm Electron runtime; riêng `DBY Home.exe` là 210.9 MB |
| Installer | 119,946,471 bytes (~114.4 MiB) | `dist/DBYHOME-1.0.68-setup.exe` |
| Process snapshot | 584.8 MB working set, 1.079 CPU-sec/5 sec | 1 main + renderer + GPU + utility của dev instance đang chạy; chỉ là snapshot tham khảo, chưa phải benchmark kiểm soát |

### Runtime snapshot sau tối ưu (khởi động sạch)

Đã chạy `dist/win-unpacked/DBY Home.exe` với `--user-data-dir` mới, không đăng nhập và không tải dataset nghiệp vụ; số liệu dưới đây là startup/login shell, không đại diện cho report hoặc tải hóa đơn lớn.

| Mốc | Process tree | Working set toàn tree | CPU tích lũy toàn tree |
| --- | ---: | ---: | ---: |
| Sau 8 giây | 4 | 334.1 MB | 1.218 CPU-sec |
| Sau 20 giây | 5 | 469.7 MB | 2.641 CPU-sec |

- Main process giữ khoảng 112.0 MB ở giây 8 và 115.6 MB ở giây 20.
- Process tree gồm main/renderer/GPU/utility; process thứ năm xuất hiện trong startup nên cần kiểm tra lại bằng profile lặp lại trước khi đặt release gate.
- Đây là số đo sau build tối ưu, chưa có baseline cùng scenario trước tối ưu; không dùng để tuyên bố mức giảm RAM/CPU.

## Phát hiện chính

### PERF-01 — P1: Polling nền tạo tải idle không cần thiết

**Vị trí:** `src/renderer/src/App.tsx:1287`, `src/renderer/src/App.tsx:1299`, `src/renderer/src/App.tsx:1821`.

- `rooms` và `invoices` refetch mỗi 30 giây và còn bật `refetchOnWindowFocus`.
- SePay refetch mỗi 15 giây, kể cả khi cửa sổ ở background (`refetchIntervalInBackground: true`).
- Mỗi lần nhận dữ liệu SePay, code quét transaction × invoice để ghép và có thể tự ghi thanh toán; chi phí tăng theo lịch sử dữ liệu.

**Cách thực hiện:**

1. Đưa polling vào `document.visibilityState`: dừng khi hidden, refresh một lần khi visible trở lại.
2. Đổi SePay sang nút “đồng bộ” hoặc polling 60–120 giây có backoff; chỉ bật auto-sync khi người dùng đã bật tính năng.
3. Dùng cursor/`since` hoặc transaction key để chỉ lấy giao dịch mới; tạo index/map transfer-code thay vì lọc toàn bộ invoice cho từng transaction.
4. Đo số request/phút và CPU trước/sau bằng DevTools Network + `app.getAppMetrics()`.

**Acceptance:** idle foreground không quá 1 request đồng bộ/60 giây; background không có polling; không có duplicate payment khi reconnect.

### PERF-02 — P1: Realtime subscription quá rộng gây refetch storm

**Vị trí:** `src/renderer/src/lib/realtime.ts:25-39`, đăng ký tại `src/renderer/src/App.tsx:1441`.

Channel `postgres_changes` đang nghe toàn bộ bảng/sự kiện trong schema public. Mỗi event chỉ cần có table là invalidate query key tương ứng; khi nhiều row thay đổi sẽ tạo nhiều lần refetch, chồng lên polling 15/30 giây.

**Cách thực hiện:**

- Subscribe theo bảng cần cho màn hình hiện tại, hoặc debounce/batch invalidation 250–500 ms.
- Với payload có đủ row dữ liệu, cập nhật cache bằng `setQueryData` thay vì luôn refetch.
- Khi tab không hoạt động, unsubscribe các channel không liên quan; ghi metric số event và số query invalidate.

**Acceptance:** một batch 100 event chỉ tạo tối đa một refetch cho mỗi query key; không có invalidation khi user đã logout/unmount.

### PERF-03 — P1: Tải toàn bộ bảng và giữ bản sao lớn trong renderer

**Vị trí:** `src/renderer/src/lib/db.ts:226-227`, `:376-377`, `:430-442`, `:803-819`, `:1314-1316`; workflow snapshot tại `src/renderer/src/App.tsx:1342-1385`.

Nhiều truy vấn dùng `select('*')`, không phân trang/giới hạn theo kỳ. App giữ rooms, invoices, contracts, tenants, cash transactions và asset snapshots trong React Query cache; các tab con còn đăng ký lại cùng dữ liệu. Khi dữ liệu lớn, chi phí là network payload + JSON parse + heap + render/filter ở renderer.

**Cách thực hiện:**

1. Tạo projection rõ trường cần dùng thay cho `*`.
2. Phân trang theo `limit/offset` hoặc cursor; báo cáo lọc theo date range ở server.
3. Tách query key theo màn hình/kỳ (`invoices:list`, `invoices:room`, `cashflow:range`) và chỉ mount query khi tab/modal mở.
4. Đưa tổng hợp báo cáo và asset workflow vào RPC/view server-side; không tải toàn bộ snapshot của mọi phòng khi chỉ cần cờ trạng thái.
5. Với bảng dài, dùng virtualization và memoized row.

**Acceptance:** payload initial giảm tối thiểu 50%; memory renderer không tăng tuyến tính theo số hóa đơn; dataset 5.000 hóa đơn vẫn scroll/render ổn định.

### PERF-04 — P1: TTI bị chặn bởi tài nguyên CDN và entry bundle lớn

**Vị trí:** `src/renderer/index.html:9-10`, `src/renderer/src/assets/main.css:1`, `src/renderer/src/App.tsx:1-111`.

- Font Awesome CSS từ cdnjs và Google Fonts qua `@import` là dependency render-blocking/offline-sensitive.
- App entry đã split tab/modal bằng `lazy`, nhưng entry vẫn 1.69 MB; `BusinessReport` riêng 1.03 MB.
- Build đã transform 2.476 modules; initial App shell còn chứa nhiều data orchestration và icon/import.

**Cách thực hiện:**

- Self-host subset icon cần dùng (hoặc thay bằng SVG/icon subset), self-host font với `font-display: swap`; bỏ `@import` CDN.
- Tách `AppShell`, auth bootstrap, data providers và từng feature route; preload chỉ chunk của tab mặc định.
- Tách chart/report vendor khỏi initial path; chỉ load `recharts` khi mở báo cáo.
- Dùng bundle visualizer sau mỗi phase.

**Acceptance:** first contentful shell không phụ thuộc CDN; initial JS gzip giảm ít nhất 30%; TTI p95 giảm ít nhất 25% trên máy baseline.

### PERF-05 — P1: Build đóng gói thừa và chưa tận dụng ASAR

**Vị trí:** `electron-builder.yml:5-49`.

- `asar: false` làm app payload unpacked, tăng file count/IO và khó kiểm soát nội dung.
- `tmp-product-design`, `design-references`, `_backups`, `_backup_work` hiện lọt vào artifact, tổng gần 8.95 MB; trong đó có ảnh/bản backup không cần runtime.
- `node_modules` packaged 19.2 MB. Một số direct dependency không có import trong `src`: `@hookform/resolvers`, `bcryptjs`, `clsx`, `html-to-image`, `html2canvas`, `react-hook-form`, `tailwind-merge`, `zod` (cần xác minh cả dynamic/transitive use trước khi xóa). Riêng các package này hiện chiếm khoảng 4.05 MB trong artifact.
- Cấu hình `extraFiles` đang tự copy các file Electron runtime; cần kiểm tra có trùng với file builder đã cung cấp hay không.

**Cách thực hiện:**

1. Chuyển sang `asar: true`; chỉ `asarUnpack` native/runtime thật sự cần.
2. Đổi `files` từ deny-list sang allow-list tối thiểu: `out/**/*`, `resources/**/*`, `package.json`, production dependencies cần thiết.
3. Xóa dependency không dùng sau khi `rg`, `npm ls` và smoke test xác nhận; chạy `npm prune --omit=dev` trong packaging pipeline.
4. Chỉ giữ locale cần thiết (`electronLanguages: [vi, en]`) nếu QA xác nhận.
5. Kiểm tra artifact bằng script: fail build nếu chứa `tmp-product-design`, backup, source map, test/docs hoặc secret.

**Acceptance:** không còn dữ liệu thiết kế/backup trong artifact; app payload giảm tối thiểu 10 MB; installer giảm tối thiểu 10%; startup IO không tăng sau khi bật ASAR.

### PERF-06 — P2: Render nền và hiệu ứng tạo CPU/GPU load khi login

**Vị trí:** `src/renderer/src/components/WeatherBackdrop.tsx:56-148`, `:168-264`, `src/renderer/src/components/LoginScreen.tsx:302`.

Canvas precipitation chạy `requestAnimationFrame`, tối đa 125 particle và tự giới hạn khoảng 20 FPS; cùng lúc có nhiều CSS blur/animation. Component được mount trên LoginScreen và còn gọi weather refresh mỗi 20 phút. Đây là tải có thể thấy ở GPU/renderer khi để màn hình login mở lâu.

**Cách thực hiện:** pause khi window mất focus, tôn trọng `prefers-reduced-motion`, giảm particle/FPS theo device capability; dùng ảnh tĩnh cho clear/cloudy và chỉ bật canvas khi mưa/dông.

**Acceptance:** login idle CPU giảm rõ rệt trong 60 giây; không có animation loop khi tab/window hidden; reduced-motion không tạo RAF.

### PERF-07 — P2: Capture invoice/Zalo mở BrowserWindow ẩn và chờ cố định

**Vị trí:** `src/main/index.ts:156-206`, `:224-291`, `:335-452`.

Mỗi lần export tạo hidden `BrowserWindow`, load HTML có CDN Tailwind, chờ cố định 1.2–1.8 giây rồi `capturePage`; logic gần như lặp lại ở nhiều handler. Khi export liên tiếp, các renderer phụ có thể tạo đỉnh RAM/CPU và thời gian chờ không ổn định theo mạng/font.

**Cách thực hiện:** dùng một capture worker/window có queue và giới hạn concurrency 1; bỏ CDN Tailwind, đóng gói CSS; chờ `document.fonts.ready`/selector thay cho sleep; gom logic capture dùng chung và luôn hủy timeout/window ở `finally`.

**Acceptance:** export liên tiếp 10 hóa đơn không tăng process count; p95 export time giảm; peak working set được ghi nhận và giới hạn.

### PERF-08 — P2: Main process khởi động Telegram long-polling nếu có env token

**Vị trí:** `src/main/index.ts:1141`, `src/main/telegram-ultraviewer.ts:79-135`.

Nếu có `TELEGRAM_BOT_TOKEN` và allow-list, app mở long-poll `getUpdates` ngay khi `app.ready`. CPU idle thấp nhưng giữ network/socket và làm startup có side effect ngoài UI.

**Cách thực hiện:** khởi động lazy sau khi user bật hỗ trợ, pause khi offline/hidden nếu phù hợp, giới hạn retry/backoff và hiển thị trạng thái lifecycle.

## Kế hoạch triển khai theo phase

### Phase 0 — Instrumentation & baseline

- Thêm `app.getAppMetrics()` snapshot theo lifecycle và `webContents.getProcessMemoryInfo()` cho main/renderer.
- Bật trace có kiểm soát cho startup, tab switch, report, invoice export; log query count/bytes/latency.
- Chuẩn hóa dataset benchmark: 50/500/5.000 invoices, 20/100/500 rooms.
- Chốt baseline: TTI p50/p95, renderer heap, total working set, request/phút, installer/app payload.

### Phase 1 — Idle & IPC/network

- Sửa PERF-01 và PERF-02: visibility-aware polling, debounce invalidation, pause SePay background.
- Gộp các IPC/export handler có cùng pattern; thêm payload validation và timing metric.
- Kiểm tra mọi listener/channel cleanup khi logout/unmount.

### Phase 2 — Data/query & heavy-load UI

- Sửa PERF-03: projection, pagination/cursor, server-side aggregation, query key theo feature.
- Virtualize bảng dài; memoize row/callback; tránh filter/map lặp lại trên mọi render.
- Đo lại bằng dataset benchmark và React Profiler.

### Phase 3 — TTI/bundle

- Sửa PERF-04: self-host fonts/icons, tách report/chart vendor, giảm App entry.
- Kiểm tra preload/chunk waterfall và offline startup.

### Phase 4 — Packaging

- Sửa PERF-05: allow-list, ASAR, locale pruning, dependency cleanup, artifact gate.
- Build Windows/macOS/Linux sạch từ lockfile; so sánh size và cold start trước khi phát hành.

### Phase 5 — Regression & release gate

- Smoke test auth, realtime, SePay, report, invoice/Zalo export.
- Performance gate đề xuất: initial JS gzip -30%, installer -10%, idle request background = 0, renderer heap sau 30 phút idle không tăng liên tục, export 10 lần không tạo renderer process tồn đọng.

## Lệnh kiểm tra đã chạy

```text
npm run typecheck       # pass
npm run build           # pass
```

Phase 2 data/query đã triển khai một phần; phần aggregate server-side và benchmark dữ liệu lớn vẫn là backlog. Phase 0/1 và quick wins Phase 3/4 được ghi nhận ở implementation log bên dưới.

## Phase 2 data-layer review (đã triển khai một phần, còn backlog server-side)

Các điểm cần xử lý trước khi scale dữ liệu:

- `src/renderer/src/lib/db.ts` còn nhiều query `select('*')`, đáng chú ý là `getRooms`, `getInvoices`, `getContracts`, `getCashTransactions`, `getAssetSnapshotsByRoomIds`; các trường JSON như `payment_records`, `image_urls`, `transfer_history` làm payload/parse/heap tăng theo số row.
- `src/renderer/src/App.tsx` mount đồng thời rooms, invoices, contracts, move-in receipts, app settings và asset workflow sau auth. Với dataset lớn, cùng một snapshot bị giữ trong React Query cache và được filter/map nhiều lần ở renderer.
- `BusinessReport`, `ContractsTab`, `CashFlowTab` tiếp tục gọi các collection lớn để tự tổng hợp theo kỳ; chưa có server-side aggregate hoặc cursor pagination.

Cách thực hiện theo thứ tự an toàn:

1. Đo payload/latency/query count theo từng query với dataset 50/500/5.000 invoices và 20/100/500 rooms.
2. Tách projection tối thiểu cho list view khỏi detail view; chỉ lấy JSON/detail fields khi mở modal.
3. Thêm cursor pagination và date-range filter ở API/RPC; giữ query key theo feature và kỳ báo cáo.
4. Chuyển tổng hợp P&L/cashflow/asset workflow sang view/RPC server-side; chỉ trả aggregate + drill-down page.
5. Virtualize bảng invoice/cashflow và memoize row để số row ngoài viewport không tạo DOM/render work.

Acceptance cho Phase 2: payload initial giảm tối thiểu 50%, renderer heap không tăng tuyến tính với số hóa đơn, và dataset 5.000 hóa đơn vẫn mở tab/scroll ổn định.

Trạng thái hiện tại:

- Đã hoàn thành projection/list-detail cho rooms và asset snapshots; `InvoicesTab` đã lọc theo tháng/năm, có query key theo kỳ và giữ dữ liệu kỳ trước trong lúc chuyển kỳ.
- Đã thêm `limit/offset` vào `getInvoices()` để có đường nâng cấp sang cursor pagination mà không phá callsite cũ; UI chưa bật nút phân trang vì cần chốt UX và tổng số bản ghi với staging data.
- Chưa chuyển `BusinessReport`/`CashFlowTab` sang RPC hoặc aggregate theo date range. Hai màn hình vẫn cần full history ở chế độ “toàn thời gian”; đây là hạng mục ưu tiên tiếp theo nếu dữ liệu thực tế vượt vài nghìn dòng.
- `BusinessReport` và `CashFlowTab` đã lọc `cash_transactions` theo `startDate/endDate` ngay tại Supabase khi người dùng chọn ngày/khoảng; chế độ “toàn thời gian” vẫn giữ full history để không đổi nghiệp vụ.
- Chưa thể tuyên bố đạt acceptance 50% payload hoặc heap tuyến tính vì repo không chứa dataset staging kiểm soát. Cần benchmark 50/500/5.000 invoices và 20/100/500 rooms trước release gate.

## Verification caveat

- `npm run typecheck`, `npm run build` và `npm run build:win` đã pass.
- Đã gỡ override `brace-expansion: ^5.0.9` và đồng bộ lockfile; `npm run lint` giờ chạy được. Lint vẫn fail với nhiều lỗi/warning tồn tại ở source cũ và thư mục tooling/design (CRLF, explicit return type, `any`, regex control chars), nên cần tách lint scope/cleanup riêng trước khi dùng làm release gate.

## Verification log — final Windows package (2026-09-19)

- `npm run typecheck`: pass (Node + renderer).
- `npm run build`: pass; renderer entry `1,673.93 kB`, chart chunk `846.11 kB`, `BusinessReport` `214.51 kB`, CSS `199.08 kB`; 2,476 modules transformed.
- `npm run build:win`: pass; electron-builder `26.15.3`, Electron `39.8.10`.
- Artifact sizes: `dist/win-unpacked/resources/app.asar` `31,878,521` bytes; `dist/win-unpacked` `328,014,882` bytes; `dist/DBYHOME-1.0.69-setup.exe` `100,021,807` bytes.
- ASAR scan không thấy `tmp-product-design`, `design-references`, backup, `phase`, `src`, source map, `@types` hoặc README/docs runtime.
- Smoke test executable sạch trong 8 giây: 4 process, root working set `112.0 MB`, toàn process tree `535.8 MB`, CPU tích lũy `1.000` giây. Đây là startup shell không đăng nhập, không tải dataset nghiệp vụ; không dùng làm release benchmark.

Sau thay đổi query cash range, `npm run typecheck` và `npm run build` tiếp tục pass; bundle tăng không đáng kể (`BusinessReport` `214.51 kB`, entry `1,673.93 kB`) do thêm logic tạo query key/range.

## Hotfix — room list projection compatibility (2026-09-20)

- **Triệu chứng:** màn hình Phòng hiển thị `0 phòng` và bảng trống dù dữ liệu vẫn có trong Supabase.
- **Nguyên nhân:** `getRooms()` dùng projection mới; khi schema môi trường chưa có đủ một cột trong projection, Supabase trả lỗi. `App` destructure `data: rooms = []` nên lỗi bị biểu diễn sai thành danh sách rỗng.
- **Cách sửa:** giữ projection để giảm payload trên schema mới; nếu projection lỗi, `getRooms()` ghi cảnh báo và fallback sang `select('*')` để tương thích schema cũ. `npm run typecheck` pass sau hotfix.
- **Ghi chú:** fallback là biện pháp tương thích tạm thời; sau khi các môi trường đã đồng bộ schema, nên bỏ fallback và hiển thị `isError/error` trực tiếp trên UI để không che lỗi dữ liệu.

## Review follow-up — remaining findings (2026-09-20)

- **Đã xử lý:** `DebtReport` nhận summary thật từ các hóa đơn không hủy/không gộp; số đã trả lấy từ `paid_amount`, phần cấn trừ lấy từ `deposit_applied`.
- **Đã xử lý một phần:** thêm `getInvoiceMonthSummary()` để badge trạng thái của tháng không còn phụ thuộc 50 dòng đầu. Danh sách, tìm kiếm và sort vẫn chỉ áp dụng trên các dòng đã tải; nút “Tải thêm” phải được dùng để mở rộng phạm vi lọc.
- **Đã xử lý:** nếu cả projection và fallback phòng đều thất bại, UI hiển thị lỗi truy vấn và nút thử lại thay vì hiển thị ngầm `0 phòng`.
- **Đã xử lý:** cashflow dùng cận trên độc quyền ngày kế tiếp (`endDateExclusive`) để bao phủ toàn bộ ngày kết thúc dù cột production là `date` hay timestamp.

Verification review: `npm run typecheck` và `npm run build` pass; chưa có staging dataset để xác nhận pagination/aggregate với 5.000 hóa đơn.

## Review follow-up — implementation pass (2026-09-20)

- Sửa khởi tạo `DebtReport`: summary từ invoice được dùng khi chưa có dữ liệu localStorage; state tiếp tục đồng bộ khi query invoice hoàn tất, còn giao dịch người dùng nhập vẫn được giữ lại.
- Sửa nghiệp vụ chỉnh `Tổng nợ` thành thay giá trị; `Đã trả` và `Tôi nợ` tiếp tục cộng dồn giao dịch. Validate số tiền chỉ nhận số nguyên dương sau khi bỏ dấu phân cách hợp lệ.
- Debt summary dùng danh sách invoice đã lọc theo kỳ báo cáo, tránh hiển thị toàn lịch sử khi người dùng chọn ngày/tháng cụ thể.
- Các truy vấn invoice không giới hạn (`getInvoices`, `getInvoiceMonthCounts`, `getInvoiceMonthSummary`) đã đi theo page 1.000 dòng để tránh giới hạn response mặc định của Supabase; danh sách invoice có secondary order theo `id` để ổn định offset pagination.
- `InvoicesTab` khóa các vòng `loadAllInvoicePages()` chạy đồng thời và gắn nhãn footer là “đã tải” khi danh sách vẫn còn page chưa tải.

Verification sau implementation pass:

- `npm run typecheck`: pass.
- `npm run build`: pass; renderer entry khoảng `1,677.99 kB`, `InvoicesTab` `161.99 kB`, `BusinessReport` `240.21 kB`.
- `npm run build:win`: pass; tạo `dist/DBYHOME-1.0.69-setup.exe` khoảng `100.03 MB` và `dist/win-unpacked/resources/app.asar` khoảng `31.92 MB`.
- `git diff --check`: không có lỗi nội dung; chỉ còn cảnh báo chuyển đổi LF/CRLF của Git.
- `npm run lint` đã giới hạn phạm vi vào `src` và `electron.vite.config.ts`; lệnh không còn quét `.claude/worktrees`/asset design, nhưng vẫn fail vì lỗi lint tồn tại trước đó trong source runtime (499 errors, 7.863 warnings).
- Còn thiếu kiểm thử runtime với dataset staging trên 1.000 invoice và kiểm tra aggregate thực tế qua Supabase.

## Implementation log — Phase 2A data/query (2026-09-19)

Đã triển khai bước đầu, không đổi contract dữ liệu của các màn hình hiện có:

- `getRooms()` dùng projection rõ ràng cho list, loại `notes` và `image_urls` khỏi payload khởi tạo. `RoomDetailsModal` fetch `getRoom(id)` riêng khi mở để lấy dữ liệu detail/ảnh; sau mutation cache detail được invalidate.
- `getAssetSnapshots()` và `getAssetSnapshotsByRoomIds()` dùng projection thay cho `select('*')`, chỉ lấy các trường workflow thực sự đọc.
- `InvoicesTab` chuyển từ tải toàn bộ lịch sử sang query theo `month/year`; query key tách theo kỳ và giữ dữ liệu kỳ trước trong lúc chuyển tab. Badge số hóa đơn dùng query nhẹ `month,year`; luồng SePay mở modal mới tải full invoice history khi cần.
- `getInvoices()` nhận options `month`, `year`, `limit`, `offset` để tiếp tục mở rộng cursor/page mà không phá các callsite cũ.
- `getCashTransactions()` nhận `startDate/endDate/limit/offset`; `BusinessReport` và `CashFlowTab` dùng range query theo lịch local `YYYY-MM-DD`, tránh tải toàn bộ sổ quỹ khi xem một ngày/khoảng thời gian.
- Dòng invoice áp dụng `content-visibility: auto` + `contain-intrinsic-size` để Chromium bỏ qua paint/layout chi tiết ngoài viewport khi kỳ có nhiều dòng, không thêm dependency runtime.

Verification Phase 2A: `npm run typecheck` pass. Chưa thể đo phần trăm payload thực tế nếu không có dataset Supabase staging được kiểm soát; cần chụp Network payload và heap với 50/500/5.000 invoices trước khi chốt acceptance 50%.

## Implementation log — Phase 0/1 (2026-09-19)

Đã triển khai:

- Thêm IPC `perf:getMetrics` ở `src/main/index.ts` và expose qua `src/preload/index.ts`; renderer có thể gọi `window.api.perf.getMetrics()` để lấy snapshot process metrics.
- Thêm `usePageVisible()` trong `src/renderer/src/App.tsx`; polling rooms/invoices chuyển từ 30 giây xuống 60 giây, dừng khi hidden và không refetch khi focus.
- Khi trang visible trở lại, rooms/invoices/SePay được invalidate một lần để không phải chờ đủ chu kỳ 60 giây mới nhận dữ liệu mới.
- SePay background sync chuyển từ 15 giây xuống 60 giây, không chạy khi hidden/background và không refetch theo focus.
- `src/renderer/src/lib/realtime.ts` chuyển từ wildcard schema listener sang danh sách bảng được sử dụng; invalidation được dedupe và debounce 250 ms, chỉ refetch query đang active.

Xác minh sau thay đổi:

- `npm run typecheck`: pass main + renderer.
- `npm run build`: pass; main `99.67 kB`, preload `2.58 kB`, renderer JS tổng `3,720,405 bytes`, CSS `198,712 bytes`.
- Output build đã chứa `perf:getMetrics` trong main/preload bundle.

Chưa chốt được mức giảm RAM/CPU runtime sau thay đổi vì cần chạy cùng một dataset và cùng scenario trước/sau. Phase 0 đã cung cấp endpoint metrics để ghi baseline đó ở lượt benchmark tiếp theo.

## Implementation log — Phase 3/4 quick wins (2026-09-19)

Đã triển khai thêm:

- Bỏ Google Fonts `@import` khỏi `main.css` và LoginScreen để startup không chờ stylesheet/font CDN.
- Bỏ `<link>` Font Awesome khỏi `renderer/index.html`; stylesheet icon được append sau khi React shell mount để tránh block first paint.
- Gỡ các direct dependency không được source sử dụng: `@hookform/resolvers`, `bcryptjs`, `clsx`, `html-to-image`, `html2canvas`, `react-hook-form`, `tailwind-merge`, `zod` và `@types/bcryptjs`.
- Bật `asar: true`, chỉ unpack `resources/**`, giới hạn Electron locale còn `vi`/`en`, loại `tmp-product-design`, `design-references`, `_backups`, `_backup_work` và thư mục docs/skills khỏi package.
- Production package còn loại `node_modules/@types`, Markdown docs và changelog không được runtime import.
- Weather precipitation canvas giờ dừng khi document hidden/mất focus, giới hạn khoảng 20 FPS và tắt hoàn toàn khi `prefers-reduced-motion` bật; CSS weather motion cũng tôn trọng reduced-motion.
- Các flow export Zalo/invoice/PDF dùng `waitForWebContentsReady()` (document fonts + 2 animation frames, có timeout) thay cho các sleep cố định 1.0–1.8 giây; resize settle cũng có timeout ngắn 300 ms.
- Thêm `manualChunks` cho `recharts`: `BusinessReport` giảm từ `1,034.32 kB` xuống `213.71 kB`; chart vendor nằm ở chunk lazy `846.11 kB`, chỉ tải khi mở báo cáo. Entry renderer giảm còn khoảng `1,670.26 kB` ở build cuối.
- Modal invoice/payment không còn ép `staleTime: 0`; cache hợp đồng/phòng/hóa đơn theo room giữ 15 giây và vẫn được invalidate sau mutation, tránh refetch lặp khi mở/đóng modal liên tiếp.

Kết quả artifact sau `npm run build:unpack`:

- `app.asar`: `31,923,183` bytes.
- `asar.unpacked`: `147,545` bytes, chỉ còn resource icon cần unpack.
- `win-unpacked`: `328,060,680` bytes. Artifact cũ `dist` là `505,777,260` bytes gồm cả installer; quy đổi phần `win-unpacked` cũ khoảng `385.8 MB`, nên bản mới giảm khoảng `57.8 MB` (~15%).
- Installer NSIS mới `DBYHOME-1.0.69-setup.exe`: `100,032,405` bytes; so với installer cũ `119,946,471` bytes, giảm `19,914,066` bytes (~16.6%).
- Kiểm tra `asar list`: không còn `tmp-product-design`, `design-references`, `_backups`, `_backup_work`, `phase`, `src` hoặc source map; các dependency đã gỡ không còn trong ASAR.
- Smoke test executable ASAR: `DBY Home.exe` chạy sống sau 12 giây với user-data-dir riêng, tạo các process main/renderer/GPU/utility bình thường và đã được dừng sau kiểm tra.
- Sau thay đổi weather, `npm run typecheck` và `npm run build` tiếp tục pass; bundle renderer không tăng đáng kể ngoài phần logic preference/visibility.
- Rebuild cuối bằng `npm run build:win` đã pass; smoke test bản `dist/win-unpacked/DBY Home.exe` hiện tại sống sau 8 giây, tạo 3 child process và root working set khoảng 113.9 MB trong scenario khởi động sạch.
- Sau tối ưu capture, `npm run typecheck` và `npm run build` pass; cần benchmark export thực tế để xác nhận p95 và peak working set trước/sau.
- Rebuild installer cuối sau capture helper vẫn pass; smoke test executable hiện tại sống sau 8 giây với 3 child process.
- Các số intermediate ở trên được supersede bởi `Verification log — final Windows package` sau khi thêm range query cho cashflow.
