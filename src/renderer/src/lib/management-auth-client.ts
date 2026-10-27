const endpoint = 'https://app.phongtroankhang.com/api/management-auth'

async function request(body: Record<string, string>) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000), cache: 'no-store', credentials: 'omit' })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.ok !== true) throw new Error(data?.error || 'Không thể kết nối dịch vụ đăng nhập. Hãy thử lại.')
  return data
}

export async function managementLogin(login: string, password: string): Promise<{ access_token: string; refresh_token: string }> {
  const devCredential = import.meta.env.DEV ? await window.api?.devDevice?.credential() : null
  const deviceToken = devCredential || window.localStorage.getItem('ankhang-management-device')
  const data = await request({ action: 'login', login, password, ...(deviceToken ? { device_token: deviceToken } : {}) })
  if (typeof data.session?.access_token !== 'string' || typeof data.session?.refresh_token !== 'string') throw new Error('Phiên đăng nhập không hợp lệ.')
  return data.session
}

export async function managementRecovery(email: string): Promise<void> {
  await request({ action: 'recover', login: email })
}

export async function managementSecurity(action: string, data: Record<string, unknown>, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-management-session': accessToken },
    body: JSON.stringify({ action: 'security', security_action: action, data }),
    signal: AbortSignal.timeout(30000), cache: 'no-store', credentials: 'omit'
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body || body.ok === false) throw new Error(body?.error || 'Không thể xử lý trạng thái bảo mật.')
  return body as Record<string, unknown>
}
