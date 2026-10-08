# Thiết lập Gmail TEST — An Khang Home

## Trạng thái 07/10/2026

Google từ chối lượt gửi phòng 999 với lỗi `Project #470025984975 has been deleted`. Client OAuth cũ thuộc đúng project này. Chưa có Gmail message ID hay thời điểm gửi; lượt gửi cụ thể đã được chuyển `prepared` → `failed`, thu hồi link chưa gửi để cho phép thử lại sau khi cấu hình xong.

Đã tạo project **An Khang Home Gmail**, ID `ankhang-home-gmail`, và bật **Gmail API**. Không bật billing/free trial. Người dùng đã tự đồng ý chính sách Google và tạo OAuth client **Desktop app**, tên `An Khang Home Electron TEST`. Cấu hình đã nhập vào file TEST riêng, xác minh client ID/secret khớp và mở lại Electron TEST. Đã thêm `yendao444@gmail.com` vào Test users làm Gmail gửi thử theo lựa chọn của người dùng (Gmail nào cũng được khi test); người nhận vẫn là `zicky.iluv@gmail.com`. Chưa cấp OAuth Gmail/send bằng client mới, chưa gửi thư thành công bằng project mới.

## Người dùng hoàn tất trên Google Cloud

1. Tại bước Finish, đọc và tự đồng ý Google API Services User Data Policy → Continue → Create.
2. Vào **Audience → Test users → Add users**, thêm Gmail sẽ dùng **gửi thư**. Đây không phải danh sách người thuê nhận thư. App đang ở chế độ External/Testing.
3. Vào **Clients → Create client**, chọn **Desktop app**, đặt tên `An Khang Home Electron TEST`, tự tạo OAuth client và tải file JSON. Desktop app dùng callback loopback của Electron `http://localhost:3456/callback`.
4. Chạy `setup-gmail-test.bat` tại thư mục gốc, kéo file JSON vào cửa sổ rồi Enter. Script chỉ nhận project `ankhang-home-gmail`, ghi hai biến Gmail vào `webmobile/.env.contract-test.local`, không in khóa, không sửa cấu hình production. File JSON gốc cũng cần giữ riêng, không commit.
5. Đóng cửa sổ Electron TEST rồi chạy `start-contract-test.bat`. Đăng nhập admin TEST, mở bản nháp phòng 999, bấm **Kết nối Gmail**, tự chọn Gmail đã thêm vào Test users và cấp quyền gửi thư. Sau đó bấm **Gửi Gmail xác nhận**.

Nếu chọn **Web application** thay vì Desktop app, phải thêm Authorized redirect URI chính xác `http://localhost:3456/callback`.

## Sửa lỗi trong ứng dụng

- Google từ chối chắc chắn (project đã xóa, xác thực hoặc yêu cầu không hợp lệ) trả `notSent`; hợp đồng ghi `failed` để có thể thử lại.
- Lỗi mạng hoặc lỗi server chưa rõ kết quả vẫn giữ lượt gửi để tránh trùng. Không tự gửi lại.
- Token Gmail lưu kèm client ID; đổi OAuth sẽ yêu cầu kết nối lại, TEST không dùng token legacy chưa gắn client.
- Cấu hình Gmail riêng trong file TEST ưu tiên hơn cấu hình chung, kể cả khi để trống; không lấy lại client của project đã xóa.
- Đã đạt 8 kiểm tra Gmail: mã hóa tiếng Việt, MIME, project đã xóa, lỗi mạng/server và ngăn tái sử dụng token của client cũ. Chưa kiểm chứng gửi thật bằng project mới khi chưa có OAuth client/consent.

## Giới hạn của chế độ Testing

Google OAuth External/Testing với quyền Gmail thường cấp refresh token có hạn 7 ngày. Cấu hình này dùng để kiểm thử; trước khi chạy lâu dài cần xử lý publishing/verification theo yêu cầu Google. Backend xác nhận tiếp tục dùng project Supabase TEST và schema riêng.

## Kiểm tra Google 400 khi consent (07/10/2026)

Cùng client Desktop, scope `gmail.send`, redirect `http://localhost:3456/callback` đã mở được màn hình consent cho `yendao444@gmail.com` trong trình duyệt Codex. Lỗi Chrome 400 chưa tái hiện ở browser này; chưa đủ bằng chứng kết luận chính xác nguyên nhân phía Chrome.

Đã cải thiện vòng đời OAuth: buộc chọn tài khoản, một phiên đang chờ dùng chung, dọn timeout khi kết thúc, xử lý từ chối quyền, chặn callback lặp và không hủy phiên khi có callback sai state. Endpoint loopback `/authorize` cho phép chuyển phiên Electron hiện tại sang trình duyệt khác; không truyền token. Flag runtime `KMAP_TEST_GMAIL_CONNECT=1` chỉ mở phiên chẩn đoán cho Electron TEST, không tự cấp quyền và không tự gửi thư. Thời gian chờ 10 phút.

Đã đạt typecheck, build TEST và 10 kiểm tra Gmail, gồm callback state, chuyển browser cùng phiên, từ chối quyền, MIME và phân loại gửi thất bại. Phiên Electron thật đã mở ở màn hình cấp quyền trong Codex; đang chờ người dùng bấm **Tiếp tục**. Chưa xác nhận OAuth/Gmail gửi thành công ở thời điểm ghi chú này.
