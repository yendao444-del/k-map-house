// Export only the bundle already displayed in memory. Never reissue codes,
// persist them in browser storage, or acknowledge the bundle on download.
export function downloadRecoveryCodes(codes: readonly string[]): void {
  if (!codes.length) throw new Error('Chưa có mã khôi phục để tải xuống.')
  const issuedAt = new Date()
  const content = [
    'AN KHANG HOME — MÃ KHÔI PHỤC TÀI KHOẢN',
    `Tải xuống: ${issuedAt.toLocaleString('vi-VN')}`,
    '',
    'Giữ file này ở nơi an toàn. Không gửi hoặc chia sẻ với người khác.',
    'Mỗi mã chỉ dùng được một lần khi khôi phục thiết bị xác thực.',
    '',
    ...codes,
    '',
    'Sau khi kiểm tra file, xác nhận đã lưu mã trên màn hình thiết lập.',
    ''
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `an-khang-home-ma-khoi-phuc-${issuedAt.toISOString().slice(0, 10)}.txt`
  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    // Allow browsers and Electron to start reading the blob before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
