# DBY Finance

Không gian **Đầu tư cá nhân** chạy bên trong app AN KHANG HOME: dùng chung đăng nhập, MFA và phân quyền của phòng trọ, nhưng dữ liệu tách hẳn.

## Cách hoạt động

- Bấm logo AN KHANG HOME ở góc trái thanh tiêu đề → **Chuyển không gian** → DBY Finance. Chỉ tài khoản `admin` đang hoạt động mới thấy lựa chọn này.
- Ở DBY Finance chỉ còn màn Đầu tư (Tổng quan, Ví đầu tư, Vàng, Cổ phiếu & Quỹ, Trái phiếu, Tiết kiệm, Giao dịch). Menu phòng trọ, chuông và cài đặt bị ẩn.
- Mỗi admin có một danh mục riêng. Nạp/rút là tiền **bên ngoài**, không ghi vào sổ quỹ hay báo cáo phòng trọ. Mua khi ví thiếu tiền sẽ tự ghi kèm một giao dịch "Nạp tiền từ bên ngoài" đúng phần thiếu.
- **Nhập vàng đang có** (màn Vàng): ghi số chỉ, giá vốn và ngày mua của vàng sở hữu từ trước. Giao dịch loại `import-existing`, cộng vào danh mục nhưng không đụng Ví đầu tư (walletPosting = 0). Migration `20261126120000_dby_finance_import_existing.sql`, đã áp ngày 26/11/2026.

## Thư mục

| Đường dẫn | Nội dung |
|---|---|
| `assets/dby_finance_logo.png` | Logo màu 128×128 (3,7 KB), cắt từ logo C đã duyệt; dùng trong menu khi đang ở AN KHANG HOME |
| `assets/dby_finance_logo_green.png` | Logo ô xanh lá mạ #8DC63F, xu xanh trầm (~2 KB) cho thanh tiêu đề xanh khi đang ở DBY Finance |
| `src/WorkspaceSwitcher.tsx` | Khối logo + menu chuyển không gian trên thanh tiêu đề |
| `src/workspace.ts` | `useWorkspace`: lưu không gian đang dùng, chặn người không phải admin |
| `src/portfolio-context.ts` | Context cho form giao dịch biết đang ở danh mục cá nhân |
| `src/index.ts` | Điểm import duy nhất: `import { ... } from '@dby-finance'` |

Alias `@dby-finance` được khai báo trong `electron.vite.config.ts` và `tsconfig.web.json`.

## Phần nằm ngoài thư mục này (cố ý)

- **Database**: `supabase/migrations/20261126100000_dby_finance_personal_portfolio.sql` — phải nằm trong `supabase/migrations` để Supabase CLI nhận. Đã áp lên project `k-map-house` ngày 26/11/2026. Tạo bảng `dby_finance_portfolios`, `dby_finance_commits` và RPC `dby_finance_investment_read` (gọi bằng GET), `dby_finance_investment_commit` (cần xác thực lại như mọi thao tác ghi).
- **Màn Đầu tư**: dùng lại `src/renderer/src/components/InvestmentsTab.tsx` với `portfolio="personal"`; `src/renderer/src/lib/investment-store.ts` chọn RPC theo danh mục.
- **Ảnh thiết kế**: `generated_demos/dby-finance/`.

## Chưa làm

- Bản PWA (web) chưa có nút chuyển không gian.
