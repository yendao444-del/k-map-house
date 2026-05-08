# Quản lý danh mục chi phí

## Tổng quan
Xây dựng module quản lý danh mục thu/chi động (thay thế hardcode hiện tại), tích hợp vào tab Báo cáo.

---

## Phase 1 — Database & Backend

**Mục tiêu:** Tạo nền tảng dữ liệu cho danh mục động.

### Tasks
- [ ] Tạo bảng `expense_categories` trong Supabase
  ```sql
  id          uuid primary key
  name        text not null
  type        text not null check (type in ('income', 'expense'))
  icon        text            -- font-awesome class, vd: 'fa-bolt'
  color       text            -- tailwind color key, vd: 'yellow'
  is_default  boolean default false
  sort_order  integer default 0
  created_at  timestamptz default now()
  ```
- [ ] Seed 9 danh mục mặc định
  | value | name | type |
  |---|---|---|
  | electric | Hóa đơn điện tổng | expense |
  | water | Hóa đơn nước tổng | expense |
  | internet | Internet / wifi | expense |
  | cleaning | Rác / vệ sinh / môi trường | expense |
  | maintenance | Bảo trì / sửa chữa | expense |
  | management | Lương / quản lý | expense |
  | software | Phần mềm / công cụ | expense |
  | other_expense | Chi phí khác | expense |
  | other_income | Khoản thu khác | income |

- [ ] Thêm interface `ExpenseCategory` vào `db.ts`
- [ ] Thêm functions vào `db.ts`
  - `getExpenseCategories()` — lấy tất cả, sort theo type + sort_order
  - `addExpenseCategory(data)` — thêm mới
  - `updateExpenseCategory(id, data)` — cập nhật
  - `deleteExpenseCategory(id)` — chỉ xóa danh mục không phải is_default
- [ ] Cập nhật type `CashTransactionCategory` → `string` (bỏ union cứng)

---

## Phase 2 — Component CategoriesTab

**Mục tiêu:** UI quản lý danh mục trong tab Báo cáo.

### Tasks
- [ ] Tạo file `src/renderer/src/components/CategoriesTab.tsx`
- [ ] Layout 2 cột: **Chi phí** (trái) | **Thu nhập** (phải)
- [ ] Mỗi danh mục hiển thị: icon màu + tên + badge loại
- [ ] Nút **+ Thêm danh mục** ở header mỗi cột
- [ ] Modal thêm/sửa danh mục
  - Input tên danh mục
  - Toggle chọn loại: Thu / Chi
  - Picker chọn icon (font-awesome, danh sách gợi ý ~12 icon)
  - Picker chọn màu (~8 màu)
- [ ] Danh mục mặc định (`is_default = true`)
  - Hiển thị badge "Mặc định"
  - Không có nút Sửa tên / Xóa
- [ ] Danh mục tự tạo
  - Nút Sửa + Xóa
  - Confirm modal trước khi xóa

---

## Phase 3 — Tích hợp CashFlowTab

**Mục tiêu:** CashFlowTab dùng danh mục từ DB thay vì hardcode.

### Tasks
- [ ] Thêm query `getExpenseCategories` vào `CashFlowTab.tsx`
- [ ] Thay thế `CATEGORY_OPTIONS` hardcode → dùng data từ DB
- [ ] Dropdown chọn danh mục trong form nhập Thu/Chi → load động
- [ ] Fallback: nếu DB trống → dùng danh sách mặc định hardcode
- [ ] Cập nhật filter danh mục trong bảng giao dịch → dùng data động
- [ ] Cập nhật `EXPENSE_CATEGORIES` trong `BusinessReport.tsx` → load từ DB

---

## Phase 4 — Gắn vào BusinessReport

**Mục tiêu:** Thêm tab "Danh mục" vào giao diện Báo cáo.

### Tasks
- [ ] Import `CategoriesTab` vào `BusinessReport.tsx`
- [ ] Thêm state `'categories'` vào `activeTab` type
- [ ] Thêm nút tab **Danh mục** với icon `fa-tags`
- [ ] Render `<CategoriesTab />` khi `activeTab === 'categories'`

---

## Thứ tự thực hiện
1. Phase 1 → Phase 2 → Phase 3 → Phase 4
2. Phase 1 phải xong trước khi làm Phase 2 và 3
3. Phase 2 và 3 có thể làm song song sau Phase 1
