# Ghi nhớ thiết bị dùng phiên đăng nhập đã xác thực

## Kết quả

- Nút **Ghi nhớ thiết bị này** gọi trực tiếp thao tác ghi nhớ, không mở lại form Google Authenticator.
- Backend chấp nhận bằng chứng MFA đã hoàn tất trong phiên còn hiệu lực, kể cả ngoài cửa sổ xác minh gần đây.
- Phiên chưa xác thực MFA, hết hạn, bị thu hồi, đang khôi phục, sai tài khoản/IP/trình duyệt, chưa lưu mã khôi phục hoặc chưa hoàn tất yêu cầu email vẫn bị chặn.
- Thiết bị tin cậy đã hết hạn/bị thu hồi không được dùng để tạo thiết bị mới.
- Giữ thời hạn thiết bị 30 ngày và thời hạn phiên 6 giờ; ghi nhớ thiết bị không gia hạn phiên đăng nhập.
- 2FA lúc đăng nhập, thao tác thu hồi thiết bị, các quyền nghiệp vụ và auto update giữ nguyên.

## Kiểm tra

- PWA và Electron `npm run build` thành công, gồm kiểm tra TypeScript.
- Kiểm thử SQL trên tài khoản giả lập trong transaction rollback trước và sau triển khai đều thành công. Không ghi dữ liệu khách hàng.
- Kiểm tra giao diện bằng fixture: thông báo **Đã ghi nhớ thiết bị này.**, không có ô nhập Authenticator.
- Website đã phát hành build `7300445e89d78cf8`, deployment `a55901cc-bf33-4fce-b830-783560a39f3e`; hash JS/CSS trùng bản đã kiểm tra.
- Electron đã sửa và build cục bộ; chưa phát hành installer.

## Bằng chứng

- `qa/remember-device-deployment.json`: kiểm thử backend và xác nhận cấu hình/guard nghiệp vụ không đổi.
- `qa/remember-device-ui.json`, `qa/remember-device-ui.jpg`: giao diện dữ liệu giả lập, không phải tài khoản thật.
- `../design/profile-2fa/responsive-production-verification.json`: đối chiếu bundle website.
