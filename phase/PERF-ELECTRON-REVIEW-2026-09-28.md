# Review toc do va dung luong Electron - 2026-09-28

## Pham vi va bang chung

Review tinh tren source hien tai va artifact co san; khong sua code app, khong build de ghi de artifact, khong chay app hay ghi Supabase. Worktree co nhieu thay doi dang do; bao cao khong hoan tac cac thay doi do.

Artifact dist version 1.0.95: installer 114,888,352 bytes; thu muc win-unpacked 401,060,578 bytes; app.asar 15,588,978 bytes. Don vi MB thap phan: 114.9 / 401.1 / 15.6. ASAR chi khoang 3.9% thu muc cai dat; khong the giam manh toan bo Electron chi bang cat dependency JS.

out/renderer hien tai khac artifact trong ASAR. Vi du entry JS out la 1,715,844 bytes, entry trong ASAR la 1,707,916 bytes. Khong xem dist la bang chung da kiem thu source hien tai. Chua do RAM, CPU, thoi gian startup hay FPS; loi ich toc do ben duoi la gia thuyet can benchmark.

## Phase 1 - Dung ban production va ngan mo nhieu instance (uu tien cao)

Van de: start.bat:49 chay npm run dev, kem Vite, watcher va build luc mo. src/main/index.ts khong co requestSingleInstanceLock; mo nhieu lan co the nhan doi Electron, polling va tranh chap cache. Day la thieu co che bao ve, chua ket luan nguoi dung hien dang mo nhieu instance.

Cach thuc hien: tach launcher dung hang ngay tro den ban production da xac minh version va launcher dev rieng. Khong am tham fallback sang dist cu. Them instance lock truoc khoi tao IPC, bot va window; instance thu hai focus cua so cu. Xu ly app bi minimize. Neu dev va production dung chung profile, phai quy dinh ro cach chay, khong tu doi userData.

Kiem thu: mo hai lan, chi mot instance lam viec; dang nhap va duong dan du lieu giu nguyen; chot version build de khong chay ban cu. Rui ro: thap, nhung doi app identity/userData co the lam du lieu trong nhu bien mat, nen khong doi.

## Phase 2 - Cat dependency chi dung renderer khoi ASAR (uu tien cao)

Van de: electron-builder.yml da loai recharts/lightweight-charts/lucide-react, nhung dependency phu van con. Do truc tiep ASAR: es-toolkit 1,834,740 bytes; @reduxjs/toolkit 803,672; victory-vendor 387,361; immer 204,308; react-redux 139,472. Rieng nhom nay khoang 3.37 MB truoc nen. @tanstack/query-core 512,008 va @tanstack/react-query 228,171 bytes cung con. Cac package Supabase con nhieu ban build song song. Tim import truc tiep trong main/preload khong thay Supabase, TanStack, Redux, es-toolkit hay Recharts; van can kiem dependency bac cau truoc khi loai.

Cach thuc hien: lap dependency graph tu main/preload da build; chuyen renderer-only dependencies sang devDependencies khi Vite da bundle; neu can dung exclude thi loai theo danh sach da xac minh. Giu adm-zip, @electron/asar, node-edge-tts vi main dang dung. Khong xoa thu cong node_modules tren may nguoi dung.

Kiem thu: dong goi vao thu muc rieng; kiem external require cua main/preload; smoke test dang nhap, bieu do, in/xuat, TTS va updater. So sanh installer va ASAR truoc/sau. So MB truoc nen khong phai so MB giam installer. Rui ro du lieu thap; rui ro runtime thieu module trung binh.

## Phase 3 - Giam JavaScript tai luc mo (uu tien cao)

Van de: electron.vite.config.ts manualChunks chi gom recharts vao charts; out/renderer/index.html preload charts-CxvmRQfD.js va entry import React tu chunk nay. Chunk charts 890,589 bytes van nam tren duong startup. Lazy-load tab da co nhung chua tri hoan duoc chunk nay. Entry out khoang 1.72 MB, code artifact con dang de doc, can kiem cau hinh minify cua production build.

Cach thuc hien: tach shared React core khoi chart chunk; thu bo manualChunks hoac dieu chinh explicit chunks sau khi xem dependency graph. Xac minh build.minify, thu minify production trong output rieng. Chuyen modal it dung con import tinh nhu DebtClosingModal sang lazy neu graph cho thay loi ich. Khong sua bundle bang tay.

Kiem thu: index.html va entry khong tai chart cho man hinh khong dung bieu do; so sanh tong startup JS, thoi gian ready va lan mo bieu do dau tien. Test trang thai loading/error cua lazy import. Rui ro du lieu thap; can tranh circular chunk va loi chi xuat hien o production.

## Phase 4 - Giam tai lai lich su hoa don (loi ich tang theo du lieu)

Van de: App.tsx:1399 dung getInvoices khong tham so, interval 60 giay khi visible. db.ts:1581 tai select('*') qua tung trang 1000 dong cho den het. Moi lan refresh doc lai toan bo lich su; tab hoa don da co loc rieng nhung root van tai full history.

Cach thuc hien: kiem ke tung consumer (tong hop phong, no, SePay, xuat bao cao), tach projection tom tat/nho va chi tai chi tiet khi can; duy tri invalidation sau mutation, realtime va fallback refresh. Neu incremental sync, phai xu ly ban ghi xoa, sua, mat ket noi va doi user. Khong chi them limit vao query chung, khong cat bo hoa don khoi danh sach doi soat.

Kiem thu: snapshot gia lap 1k/10k hoa don, so sanh so du/tong no/doi soat/xuat voi cach cu; no thang cu, partial, settlement am, merged, cancelled, reconnect va thay doi tu may khac. Chi dung moi truong test. Rui ro nghiep vu trung binh-cao du la thay doi duong doc; lam sau cac phase dong goi.

## Phase 5 - Cuon bang va tang toc GPU (co dieu kien)

Van de: InvoicesTab.tsx:1197 render filteredInvoices.map toan bo ket qua; App.tsx:3446 render filteredRooms.map. Danh sach lon co the lam tang DOM va chi phi render. index.ts:1171 tat hardware acceleration vo dieu kien; co the lam cuon/bieu do ton CPU, nhung chua do va co lich su xu ly renderer crash trong code.

Cach thuc hien: profile truoc; virtualize cac bang lon hoac phan trang phan hien thi. Tong hop va export van tinh tren du tap du lieu. GPU: thu A/B tren may thuc, giu che do software fallback va ghi crash; khong bat dai tra ngay.

Kiem thu: cuon, tim kiem, menu dong, edit/focus, selection, in/xuat, modal; benchmark frame time va CPU voi GPU on/off, remote desktop neu su dung. Rui ro du lieu thap, rui ro tuong tac va do on dinh hien thi trung binh. Chua du bang chung de hua giam RAM khi bat GPU.

## Phase 6 - Tranh block main khi cap nhat (uu tien vua)

Van de: update-handlers.ts:145 readFileSync toan bo goi vao RAM de hash. :684 extractAllTo va :724 extractAll chay tren main; await khong bien API dong bo thanh bat dong bo. Main con import update-handlers va EdgeTTS ngay luc mo.

Cach thuc hien: hash bang read stream; giai nen/patch trong worker hoac utility process, gioi han mot job; lazy load module nang khi dung. Giu nguyen checksum, validation va co che thay the/rollback. Khong dua save du lieu sang async thieu hang doi.

Kiem thu: updater voi goi dung/sai checksum, goi hong, huy, thieu dung luong va rollback trong ban test; theo doi responsiveness va peak memory. Rui ro updater trung binh, khong nen gop voi sua logic luu du lieu.

## Phase 7 - Chan regression va tai nguyen phu (uu tien vua/thap)

Van de: scripts/verify-package-footprint.mjs:7 hard-code installer 1.0.94, trong khi package hien la 1.0.95; script co the bao installerBytes null ma van thanh cong. electronRuntime doc node_modules thay vi runtime dong goi. Font Awesome CSS duoc import toan cuc tai main.tsx:2; co the subset sau khi kiem ke icon, loi ich nho hon cac phase tren.

Cach thuc hien: lay version tu package va doi chieu package ben trong ASAR; fail khi installer mong doi thieu; xac minh runtime dong goi. Them budget size va kiem startup chunks. Subset font/icon chi khi bao phu duoc class dong va HTML xuat.

Kiem thu: fixture installer thieu/phien ban sai phai fail; kiem icon trong app va ban in. Rui ro du lieu thap.

## Thu tu de xuat va gioi han

Lam Phase 1, 2, 3, 7 truoc; Phase 5 sau profiling; Phase 4 va 6 tach dot rieng co kiem thu nghiep vu/updater. Moi dot ghi version, hash artifact, startup median qua nhieu lan chay, CPU/RAM idle va kich ban thao tac co dinh.

Khong cat locale/DLL Chromium tuy tien; cau hinh hien tai da ghi nhan renderer crash khi loc locale. Khong tat sandbox/contextIsolation, khong xoa cache/profile de giam dung luong, khong thay Electron bang framework khac trong dot toi uu nho. Chuyen framework la du an migration rieng voi chi phi IPC/in/export/updater va kiem thu du lieu.

## Ket qua trien khai dot 1 (2026-09-28)

Da trien khai Phase 1 phan khoa mot instance, Phase 2 phan exclude dependency renderer, Phase 3 phan bo manual chart chunk va lazy-load DebtClosingModal, va Phase 7 phan verifier theo version. Them `start-production.bat` de chay artifact production; `start.bat` van giu dev mode.

Kiem thu: `npm run typecheck` dat; `npm run build:win` dat; `npm run verify:package` dat voi version 1.0.95, Electron 44.4.5, installer 114,999,707 bytes, ASAR 9,286,891 bytes. ASAR giam tu 15,588,978 xuong 9,286,891 bytes (giam 6,302,087 bytes, khoang 40.4%). Renderer entry sau build con 646.75 KB va khong preload chart chunk. Packaged smoke test giu tien trinh song 7 giay voi safe window.

Chua trien khai Phase 4 (tach projection truy van hoa don), Phase 5 (virtual list day du/GPU), Phase 6 (worker updater); day la cac phase can benchmark va kiem thu nghiep vu/updater rieng. Chua co benchmark RAM/CPU thuc te, nen chua ket luan phan tram tang toc.

Cap nhat sau review: da lam Phase 4 phan bo timer tai lai toan bo lich su hoa don moi phut; Realtime va refresh khi quay lai foreground van giu dong bo, con tach projection truy van van chua lam. Da lam Phase 5 phan giam DOM hoa don bang hien thi 100 dong mot dot, giu nguyen tong hop tren toan bo tap loc va nut tai them. Da lam Phase 6 phan hash checksum theo stream va giai nen ZIP bat dong bo de tranh block main; giai nen ASAR lon van chua chuyen sang worker. `npm run typecheck`, build, verifier, smoke test va 11 test an toan da dat sau cac thay doi.

Review cuoi dot: toan bo 45 test script da chay, 44 pass va 1 skip co chu y. `npm run lint` khong dat do 568 loi va 16,291 canh bao Prettier/ESLint trong source hien tai; day la khoi loi ton tai tren nhieu module nghiep vu va khong dung lam gate cho dot toi uu nay. Khong co loi typecheck, build hoac package verifier.

Kiem tra artifact sau cung: `start-production.bat` mo duoc `dist/win-unpacked/DBY Home.exe`; ban production song it nhat 7 giay khi chay profile tam, sau do da dong tien trinh test. Khong co tien trinh DBY HOME/Electron cua dot kiem tra con lai.

Phase GPU thu nghiem: `src/main/index.ts` chi tat hardware acceleration khi khong co `KMAP_ENABLE_GPU=1`; them `start-production-gpu-test.bat` de benchmark rieng. Ban GPU smoke voi profile tam song 6 giay, verifier va build van dat. Chua bat GPU mac dinh vi chua co so lieu CPU/RAM/FPS va co the khac nhau theo driver.

Them `scripts/benchmark-electron-start.ps1` de do 3 lan software va 3 lan GPU bang profile tam, ghi `electron-start-benchmark.json`. Script khong mo profile du lieu that va tu dong dong process sau moi lan.

Chay 3 lan moi che do tren may hien tai: software trung binh 2.09 giay va 109.5 MB working set; GPU trung binh 2.04 giay va 116.0 MB working set. GPU nhanh hon khoang 0.06 giay nhung dung them khoang 6.4 MB RAM. Day chi la startup smoke voi safe window, chua do cuon/bieu do; vi vay GPU van de o che do tuy chon.
