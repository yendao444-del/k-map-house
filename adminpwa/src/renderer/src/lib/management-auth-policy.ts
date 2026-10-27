export function assertManagementProfile(
  profile: Record<string, unknown> | null,
  authenticatedId: string
): asserts profile is Record<string, unknown> {
  if (!profile || profile.id !== authenticatedId) {
    throw new Error('Tài khoản chưa có hồ sơ quản lý. Vui lòng liên hệ quản trị viên.')
  }
  if (profile.status !== 'active') throw new Error('Tài khoản đã bị vô hiệu hóa.')
  if (profile.role !== 'admin' && profile.role !== 'user') {
    throw new Error('Tài khoản không có quyền truy cập ứng dụng quản lý.')
  }
}
