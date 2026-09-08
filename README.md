# app

An Electron application with React and TypeScript

## Tra ID UltraViewer qua Telegram

Thêm hai biến sau vào file `.env` rồi khởi động lại ứng dụng:

```env
TELEGRAM_BOT_TOKEN=token_do_BotFather_cap
TELEGRAM_ALLOWED_CHAT_ID=telegram_chat_id_duoc_phep
```

Gửi lệnh `/ultraview` cho bot để nhận ID UltraViewer hiện tại. Bot chỉ phản hồi các
`chat_id` nằm trong danh sách cho phép (có thể nhập nhiều ID, phân cách bằng dấu phẩy) và
không bao giờ đọc hoặc gửi mật khẩu UltraViewer.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
