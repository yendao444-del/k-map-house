# Auth Migration Phases

## Mục tiêu

Chuyển hệ thống từ auth local JSON sang kiến trúc đúng cho nhiều người dùng:

- `Supabase Auth` quản lý đăng nhập, mật khẩu, session
- `public.users` chỉ lưu profile và quyền
- dữ liệu nghiệp vụ tiếp tục dùng online
- offline chỉ hỗ trợ đọc cache, không hỗ trợ ghi

## Phạm vi đã chốt

- Có ít nhất 2 người dùng
- Cần dữ liệu online
- Không cần ghi khi offline
- Quyền gần giống nhau, chỉ khác một số quyền quản trị
- Không tiếp tục dùng `phongtro_db.json` làm nguồn auth chính

## Phase 1: Chốt kiến trúc

### Mục tiêu

Thống nhất một nguồn sự thật duy nhất cho auth và profile user.

### Việc cần làm

- Chốt mô hình:
  - `auth.users`: email, password hash, session
  - `public.users`: `id`, `full_name`, `role`, `status`, `created_at`
- Chốt rule:
  - không lưu password trong `public.users`
  - không tạo auth account bằng insert thẳng vào `public.users`
  - user profile luôn gắn với `auth.users.id`
- Chốt cách tạo tài khoản giai đoạn đầu:
  - tạo tay trên Supabase Dashboard
  - app chưa cần flow signup/admin-create-user ngay

### Deliverable

- File mô tả kiến trúc đích
- Quy ước role và quyền cơ bản

## Phase 2: Chuẩn bị schema Supabase

### Mục tiêu

Tạo đủ schema để auth và profile hoạt động đúng.

### Việc cần làm

- Tạo bảng `public.users`
- Cấu trúc đề xuất:
  - `id uuid primary key references auth.users(id) on delete cascade`
  - `full_name text not null`
  - `role text not null default 'staff'`
  - `status text not null default 'active'`
  - `created_at timestamptz default now()`
- Tạo trigger tự sinh profile sau khi có record mới trong `auth.users`
- Bật RLS cho `public.users`
- Tạo policy cơ bản:
  - authenticated được đọc profile phù hợp
  - admin được sửa role/status
  - user thường không sửa profile người khác

### Deliverable

- File SQL schema
- File SQL trigger
- File SQL RLS policy

## Phase 3: Chuyển luồng login sang Supabase Auth

### Mục tiêu

App đăng nhập bằng Supabase Auth thay vì auth local.

### Việc cần làm

- Rà các file:
  - `src/main/index.ts`
  - `src/preload/index.ts`
  - `src/preload/index.d.ts`
  - `src/renderer/src/components/LoginScreen.tsx`
  - `src/renderer/src/App.tsx`
- Thay logic:
  - login bằng `supabase.auth.signInWithPassword`
  - restore session bằng `supabase.auth.getSession` hoặc `getUser`
  - logout bằng `supabase.auth.signOut`
- Sau khi login:
  - lấy profile từ `public.users`
  - map về `currentUser` cho UI hiện tại

### Deliverable

- Login/logout/session restore chạy được với Supabase

## Phase 4: Loại bỏ auth local JSON

### Mục tiêu

Không để 2 hệ auth cùng tồn tại.

### Việc cần làm

- Gỡ logic `auth:login`, `auth:session`, `auth:logout`, `auth:ensureAdmin` dùng JSON local
- Bỏ seed admin local
- Ngừng dùng `phongtro_db.json` làm nguồn user
- Giữ local file chỉ nếu cần làm cache đọc offline

### Deliverable

- Auth local không còn là nguồn thật

## Phase 5: Sửa tab Tài khoản theo kiến trúc mới

### Mục tiêu

Giữ UI mới nhưng sửa logic cho đúng.

### Việc cần làm

- Tab `Tài khoản` đọc danh sách từ `public.users`
- Sửa role/status trên `public.users`
- Bỏ insert trực tiếp kiểu cũ vào `public.users` để tạo account
- Với nút `Thêm tài khoản`, chọn một trong hai cách tạm thời:
  - ẩn đi
  - hoặc đổi thành hướng dẫn tạo user trong Supabase Dashboard
- Với reset password:
  - tạm ẩn
  - hoặc để phase sau khi có admin flow chuẩn

### Deliverable

- Tab `Tài khoản` không còn lỗi schema
- UI mới hoạt động với dữ liệu thật

## Phase 6: Phân quyền cơ bản

### Mục tiêu

Role có ý nghĩa thật ở cả UI và DB.

### Việc cần làm

- Chốt role:
  - `admin`
  - `staff`
- Phân quyền UI:
  - admin thấy tab tài khoản
  - staff không thấy hoặc chỉ xem giới hạn
- Phân quyền DB:
  - admin sửa role/status
  - staff không sửa user khác

### Deliverable

- Quyền UI và RLS khớp nhau

## Phase 7: Offline chỉ đọc

### Mục tiêu

Mất mạng vẫn xem được dữ liệu đã tải.

### Việc cần làm

- Thêm cache layer đơn giản:
  - ưu tiên local file hoặc SQLite cache
- Với các query đọc chính:
  - online: gọi Supabase rồi ghi cache
  - offline: đọc cache
- Không cho ghi khi offline
- Hiển thị rõ trạng thái offline nếu cần

### Deliverable

- Xem được dữ liệu đã cache khi mất mạng

## Phase 8: Dọn nợ kỹ thuật

### Mục tiêu

Làm sạch code sau khi chuyển auth.

### Việc cần làm

- Xóa helper user cũ không còn dùng
- Xóa các branch legacy liên quan auth local
- Chuẩn hóa type:
  - auth user
  - profile user
  - app session user
- Rà lại toàn bộ chỗ dùng `currentUser`

### Deliverable

- Code gọn, ít nhánh cũ

## Phase 9: Kiểm thử

### Mục tiêu

Đảm bảo không vỡ luồng đăng nhập và phân quyền.

### Checklist

- Login đúng mật khẩu
- Login sai mật khẩu
- Restore session sau khi mở lại app
- Logout
- Admin thấy tab tài khoản
- Staff bị chặn phần quản trị
- Đọc profile user sau login
- Mất mạng sau khi đã đăng nhập
- Đọc cache offline
- Online lại sau khi offline

### Deliverable

- Checklist test pass

## Ước lượng

- Phase 1-2: 0.5 ngày
- Phase 3-5: 0.5 đến 1 ngày
- Phase 6: 0.25 ngày
- Phase 7: 0.5 ngày
- Phase 8-9: 0.25 đến 0.5 ngày

Tổng: khoảng 1.5 đến 2.5 ngày làm việc.

## Thứ tự triển khai khuyến nghị

Nếu muốn đi nhanh nhưng vẫn đúng kiến trúc:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 9

`Offline read cache` có thể làm ngay sau đó như Phase 7 riêng để giảm rủi ro.
