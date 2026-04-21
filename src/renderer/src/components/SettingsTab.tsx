import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createServiceZone,
  createUser,
  deleteServiceZone,
  getAppSettings,
  getContracts,
  getRooms,
  getServiceZones,
  getUsers,
  resetUserPassword,
  updateAppSettings,
  updateServiceZone,
  updateUserRole,
  updateUserStatus,
  type AppSettings,
  type AppUser,
  type Contract,
  type ContractStatus,
  type ServiceZone,
  type UserRole
} from '../lib/db'

type SettingsSection = 'general' | 'zones' | 'users' | 'updates'

export const SettingsTab: React.FC<{ initialTab?: SettingsSection; currentUser: AppUser }> = ({
  currentUser,
  initialTab = 'general'
}) => {
  const [activeTab, setActiveTab] = useState<SettingsSection>(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const navItems: { id: SettingsSection; icon: string; label: string }[] = [
    { id: 'general', icon: 'fa-building', label: 'Thông tin chung' },
    { id: 'zones', icon: 'fa-tags', label: 'Vùng giá dịch vụ' },
    ...(currentUser.role === 'admin'
      ? [{ id: 'users' as const, icon: 'fa-users-gear', label: 'Tài khoản' }]
      : []),
    { id: 'updates', icon: 'fa-cloud-arrow-down', label: 'Cập nhật' }
  ]

  return (
    <div className="m-4 flex h-[calc(100vh-140px)] flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:flex-row">
      <div className="w-full shrink-0 border-r border-gray-100 bg-gray-50 md:w-64">
        <div className="hidden border-b border-gray-100 p-4 md:block">
          <h2 className="text-lg font-bold text-gray-800">Quản trị hệ thống</h2>
          <p className="mt-1 text-xs text-gray-500">Cấu hình, tài khoản và cập nhật.</p>
        </div>
        <nav className="flex gap-1 overflow-y-auto p-3 md:block">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex min-w-fit items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium transition md:w-full ${activeTab === item.id
                  ? 'border border-gray-100 bg-white text-primary shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                  : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <i className={`fa-solid ${item.icon} w-4 text-center`}></i>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="relative flex-1 overflow-y-auto bg-white">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'zones' && <ServiceZonesSettings />}
        {activeTab === 'users' && currentUser.role === 'admin' && <UsersSettings />}
        {activeTab === 'updates' && <UpdateSettings />}
      </div>
    </div>
  )
}

const GeneralSettings = (): React.JSX.Element => {
  const [settings, setSettings] = useState<AppSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getAppSettings().then((value) => {
      setSettings(value)
      setLoading(false)
    })
  }, [])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    await updateAppSettings(settings)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Đang tải cấu hình...</div>
  }

  return (
    <form onSubmit={handleSave} className="flex min-h-full flex-col">
      <div className="flex-1 space-y-8 p-6 md:p-8">
        <section className="space-y-5">
          <div>
            <h3 className="border-b border-gray-100 pb-3 text-lg font-bold text-gray-800">
              Thông tin nhà trọ
            </h3>
          </div>
          <div className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
            <Field
              label="Tên nhà trọ"
              value={settings.property_name || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, property_name: value }))}
              placeholder="K-Map House"
            />
            <Field
              label="Người đại diện thu"
              value={settings.property_owner_name || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, property_owner_name: value }))}
              placeholder="Họ tên chủ nhà"
            />
            <Field
              label="SĐT Người đại diện"
              value={settings.property_owner_phone || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, property_owner_phone: value }))}
              placeholder="SĐT"
            />
            <Field
              label="CCCD Người đại diện"
              value={settings.property_owner_id_card || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, property_owner_id_card: value }))}
              placeholder="Số CCCD"
            />
            <Field
              label="Địa chỉ nhà trọ"
              value={settings.property_address || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, property_address: value }))}
              className="md:col-span-2"
              placeholder="Số nhà, đường, phường xã..."
            />
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <h3 className="border-b border-gray-100 pb-3 text-lg font-bold text-gray-800">
              Tài khoản nhận tiền
            </h3>
          </div>
          <div className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
            <Field
              label="Mã ngân hàng"
              value={settings.bank_id || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, bank_id: value }))}
              placeholder="MB, VCB..."
            />
            <Field
              label="Số tài khoản"
              value={settings.account_no || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, account_no: value }))}
              placeholder="0123456789"
            />
            <Field
              label="Tên chủ tài khoản"
              value={settings.account_name || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, account_name: value }))}
              placeholder="NGUYEN VAN A"
            />
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between border-t border-gray-100 bg-white px-6 py-4 md:px-8">
        <div className="text-sm font-medium text-emerald-600">
          {saved ? 'Đã lưu cài đặt.' : ''}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark disabled:opacity-60"
        >
          <i className={`fa-solid ${saving ? 'fa-spinner animate-spin' : 'fa-save'}`}></i>
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </div>
    </form>
  )
}

const ServiceZonesSettings = (): React.JSX.Element => {
  const queryClient = useQueryClient()
  const { data: serviceZones = [] } = useQuery({ queryKey: ['serviceZones'], queryFn: getServiceZones })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const [editingZone, setEditingZone] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ServiceZone>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [newZone, setNewZone] = useState<Partial<ServiceZone>>({
    name: '',
    electric_price: 3500,
    water_price: 20000,
    internet_price: 100000,
    cleaning_price: 20000
  })

  const createMutation = useMutation({
    mutationFn: createServiceZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      setIsAdding(false)
      setNewZone({
        name: '',
        electric_price: 3500,
        water_price: 20000,
        internet_price: 100000,
        cleaning_price: 20000
      })
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ServiceZone> }) =>
      updateServiceZone(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      setEditingZone(null)
      setEditForm({})
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteServiceZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    }
  })

  const roomCount = (zoneId: string) => rooms.filter((room) => room.service_zone_id === zoneId).length

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 p-6 md:p-8">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Vùng bảng giá</h3>
          <p className="mt-1 text-sm text-gray-500">Quản lý giá điện, nước, internet và rác theo từng vùng.</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark"
        >
          Thêm vùng giá
        </button>
      </div>

      <div className="flex-1 p-6 md:p-8">
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-4">Tên vùng</th>
                <th className="px-5 py-4">Điện</th>
                <th className="px-5 py-4">Nước</th>
                <th className="px-5 py-4">Internet</th>
                <th className="px-5 py-4">Rác</th>
                <th className="px-5 py-4 text-center">Phòng</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isAdding && (
                <ZoneRowEditor
                  values={newZone}
                  onChange={setNewZone}
                  onCancel={() => setIsAdding(false)}
                  onSave={() => createMutation.mutate(newZone)}
                  saving={createMutation.isPending}
                />
              )}
              {serviceZones.map((zone) =>
                editingZone === zone.id ? (
                  <ZoneRowEditor
                    key={zone.id}
                    values={editForm}
                    onChange={setEditForm}
                    onCancel={() => {
                      setEditingZone(null)
                      setEditForm({})
                    }}
                    onSave={() => updateMutation.mutate({ id: zone.id, updates: editForm })}
                    saving={updateMutation.isPending}
                  />
                ) : (
                  <tr key={zone.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-bold text-gray-800">{zone.name}</td>
                    <td className="px-5 py-4">{formatNumber(zone.electric_price)}</td>
                    <td className="px-5 py-4">{formatNumber(zone.water_price)}</td>
                    <td className="px-5 py-4">{formatNumber(zone.internet_price)}</td>
                    <td className="px-5 py-4">{formatNumber(zone.cleaning_price)}</td>
                    <td className="px-5 py-4 text-center">
                      <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
                        {roomCount(zone.id)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingZone(zone.id)
                            setEditForm(zone)
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-500 transition hover:bg-blue-50"
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        {zone.id !== 'zone-1' && (
                          <button
                            onClick={() => deleteMutation.mutate(zone.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const UsersSettings = (): React.JSX.Element => {
  const queryClient = useQueryClient()
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'user' as UserRole
  })
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({})

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setForm({ username: '', full_name: '', password: '', role: 'user' })
    }
  })

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'inactive' }) =>
      updateUserStatus(userId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) => updateUserRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      resetUserPassword(userId, password),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setResetPasswords((prev) => ({ ...prev, [variables.userId]: '' }))
    }
  })

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-gray-100 p-6 md:p-8">
        <h3 className="text-lg font-bold text-gray-800">Tài khoản hệ thống</h3>
        <p className="mt-1 text-sm text-gray-500">Tạo user mới, reset mật khẩu và vô hiệu hóa user.</p>
      </div>

      <div className="grid flex-1 gap-6 p-6 md:grid-cols-[360px_1fr] md:p-8">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-gray-500">
            Thêm tài khoản
          </div>
          <div className="space-y-4">
            <Field
              label="Username"
              value={form.username}
              onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
            />
            <Field
              label="Họ tên"
              value={form.full_name}
              onChange={(value) => setForm((prev) => ({ ...prev, full_name: value }))}
            />
            <Field
              label="Mật khẩu"
              value={form.password}
              onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
              type="password"
            />
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-gray-500">
                Vai trò
              </label>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark disabled:opacity-60"
            >
              {createMutation.isPending ? 'Đang tạo...' : 'Thêm tài khoản'}
            </button>
            {createMutation.error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : 'Không thể tạo user.'}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-4">Tài khoản</th>
                <th className="px-5 py-4">Vai trò</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Reset mật khẩu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="align-top hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="font-bold text-gray-800">{user.full_name}</div>
                    <div className="mt-1 text-xs text-gray-500">@{user.username}</div>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      value={user.role}
                      onChange={(event) =>
                        roleMutation.mutate({ userId: user.id, role: event.target.value as UserRole })
                      }
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() =>
                        statusMutation.mutate({
                          userId: user.id,
                          status: user.status === 'active' ? 'inactive' : 'active'
                        })
                      }
                      className={`rounded-full px-3 py-1 text-xs font-bold ${user.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                      {user.status === 'active' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={resetPasswords[user.id] || ''}
                        onChange={(event) =>
                          setResetPasswords((prev) => ({ ...prev, [user.id]: event.target.value }))
                        }
                        placeholder="Mật khẩu mới"
                        className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <button
                        onClick={() =>
                          resetPasswordMutation.mutate({
                            userId: user.id,
                            password: resetPasswords[user.id] || ''
                          })
                        }
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const UpdateSettings = (): React.JSX.Element => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'downloading'>('idle')
  const [message, setMessage] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
    releaseNotes: string
    publishedAt: string
    downloadUrl: string | null
    downloadSize: number
  } | null>(null)

  const checkForUpdate = async () => {
    setStatus('checking')
    setMessage('')
    const result = await window.api.update.check()
    if (!result.success || !result.data) {
      setMessage(result.error || 'Không thể kiểm tra cập nhật.')
      setStatus('idle')
      return
    }

    setUpdateInfo(result.data)
    setMessage(
      result.data.hasUpdate
        ? `Có bản mới v${result.data.latestVersion}.`
        : 'Đang sử dụng bản mới nhất.'
    )
    setStatus(result.data.hasUpdate ? 'ready' : 'idle')
  }

  const applyUpdate = async () => {
    if (!updateInfo?.downloadUrl) {
      setMessage('Release chưa có file zip để cập nhật.')
      return
    }
    setStatus('downloading')
    setMessage('Đang tải và áp dụng bản cập nhật...')
    const result = await window.api.update.download(updateInfo.downloadUrl)
    if (!result.success) {
      setMessage(result.error || 'Cập nhật thất bại.')
      setStatus('ready')
      return
    }
    setMessage(`Đã áp dụng bản v${result.data?.version || updateInfo.latestVersion}. App sẽ tự khởi động lại.`)
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-gray-100 p-6 md:p-8">
        <h3 className="text-lg font-bold text-gray-800">Cập nhật phần mềm</h3>
        <p className="mt-1 text-sm text-gray-500">Kiểm tra release mới trên GitHub và cập nhật không cần cài lại.</p>
      </div>
      <div className="flex-1 p-6 md:p-8">
        <div className="max-w-3xl rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_55%,#eff6ff_100%)] p-6 shadow-[0_24px_60px_-30px_rgba(21,128,61,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-600">
                GitHub Releases
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">
                Kiểm tra phiên bản mới
              </div>
            </div>
            <button
              onClick={checkForUpdate}
              disabled={status === 'checking' || status === 'downloading'}
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark disabled:opacity-60"
            >
              {status === 'checking' ? 'Đang kiểm tra...' : 'Kiểm tra bản cập nhật'}
            </button>
          </div>

          {updateInfo && (
            <div className="mt-6 grid gap-4 rounded-3xl border border-white bg-white/85 p-5 shadow-sm md:grid-cols-2">
              <InfoTile label="Phiên bản hiện tại" value={`v${updateInfo.currentVersion}`} />
              <InfoTile label="Bản mới nhất" value={`v${updateInfo.latestVersion}`} />
              <InfoTile
                label="Dung lượng zip"
                value={
                  updateInfo.downloadSize > 0
                    ? `${(updateInfo.downloadSize / 1024 / 1024).toFixed(2)} MB`
                    : 'Không rõ'
                }
              />
              <InfoTile
                label="Ngày phát hành"
                value={new Date(updateInfo.publishedAt).toLocaleDateString('vi-VN')}
              />
            </div>
          )}

          {message && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          {updateInfo?.hasUpdate && (
            <div className="mt-6">
              <button
                onClick={applyUpdate}
                disabled={status === 'downloading'}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {status === 'downloading' ? 'Đang cập nhật...' : 'Cập nhật ngay'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ZoneRowEditor = ({
  values,
  onChange,
  onCancel,
  onSave,
  saving
}: {
  values: Partial<ServiceZone>
  onChange: React.Dispatch<React.SetStateAction<Partial<ServiceZone>>>
  onCancel: () => void
  onSave: () => void
  saving: boolean
}): React.JSX.Element => (
  <tr className="bg-blue-50/30">
    {(['name', 'electric_price', 'water_price', 'internet_price', 'cleaning_price'] as const).map(
      (field) => (
        <td key={field} className="px-5 py-3">
          <input
            type={field === 'name' ? 'text' : 'number'}
            value={values[field] ?? ''}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                [field]: field === 'name' ? event.target.value : Number(event.target.value)
              }))
            }
            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </td>
      )
    )}
    <td className="px-5 py-3 text-center text-gray-400">-</td>
    <td className="px-5 py-3 text-right">
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </td>
  </tr>
)

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  className,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: string
}): React.JSX.Element => (
  <div className={className}>
    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-gray-500">
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
    />
  </div>
)

const InfoTile = ({ label, value }: { label: string; value: string }): React.JSX.Element => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className="mt-2 text-lg font-black text-slate-900">{value}</div>
  </div>
)

const formatNumber = (value: number): string => new Intl.NumberFormat('vi-VN').format(value)

export const ContractsSection = (): React.JSX.Element => {
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('active')

  const filteredContracts = useMemo(
    () => contracts.filter((contract: Contract) => statusFilter === 'all' || contract.status === statusFilter),
    [contracts, statusFilter]
  )

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Hợp đồng</h3>
          <p className="mt-1 text-sm text-gray-500">Tổng hợp hợp đồng theo trạng thái.</p>
        </div>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'active', label: 'Đang hiệu lực' },
            { id: 'expired', label: 'Hết hạn' },
            { id: 'terminated', label: 'Đã thanh lý' },
            { id: 'cancelled', label: 'Đã hủy' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setStatusFilter(item.id as 'all' | ContractStatus)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${statusFilter === item.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-4">Mã HĐ</th>
              <th className="px-5 py-4">Phòng</th>
              <th className="px-5 py-4">Khách thuê</th>
              <th className="px-5 py-4">Ngày vào</th>
              <th className="px-5 py-4 text-right">Giá thuê</th>
              <th className="px-5 py-4 text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredContracts.map((contract: Contract) => {
              const room = rooms.find((item) => item.id === contract.room_id)
              return (
                <tr key={contract.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4 text-xs font-mono text-gray-400">...{contract.id.slice(-6)}</td>
                  <td className="px-5 py-4 font-bold text-gray-800">{room?.name || contract.room_id}</td>
                  <td className="px-5 py-4">{contract.tenant_name}</td>
                  <td className="px-5 py-4">
                    {contract.move_in_date
                      ? new Date(contract.move_in_date).toLocaleDateString('vi-VN')
                      : '-'}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-primary">
                    {formatNumber(contract.base_rent)} d
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                      {contract.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
