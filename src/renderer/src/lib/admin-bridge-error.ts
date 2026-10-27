// Supabase HTTP errors expose the response as context. A generic message such
// as "Edge Function returned a non-2xx status code" does not mean undeployed.
export async function adminBridgeError(error: unknown): Promise<string> {
  const detail = error as { context?: Response; message?: string }
  const response = detail?.context
  const status = response?.status
  if (status && status >= 400 && status < 500 && status !== 404) {
    try {
      const body = await response!.clone().json()
      if (typeof body?.error === 'string' && body.error.trim()) return body.error
    } catch { /* Gateway errors may not include an application error. */ }
  }
  if (status === 401) return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'
  if (status === 403) return 'Hãy xác minh lại Google Authenticator trong phần Bảo mật trước khi thao tác quản trị.'
  if (status === 404) return 'Không tìm thấy dịch vụ quản trị SePay. Vui lòng thử lại sau.'
  if (status === 429) return 'Quá nhiều yêu cầu. Vui lòng chờ một lát rồi thử lại.'
  if (status && status >= 500) return 'Máy chủ quản trị SePay đang gặp lỗi. Vui lòng thử lại sau.'
  return 'Không kết nối được dịch vụ quản trị SePay. Kiểm tra mạng và thử lại.'
}
