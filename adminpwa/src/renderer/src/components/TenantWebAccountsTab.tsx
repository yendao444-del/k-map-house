import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Globe, Plus, RefreshCw, Search, UserRound } from 'lucide-react'
import { getContracts, getRooms, getTenants } from '../lib/db'
import {
  getTenantWebAccounts,
  tenantWebAccountQueryKey,
  type TenantWebAccount
} from '../lib/tenant-web-accounts'
import { TenantWebAccountBadge, TenantWebAccountPanel } from './TenantWebAccountPanel'

type Filter = 'all' | TenantWebAccount['status']
export default function TenantWebAccountsTab() {
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: getTenants })
  const accounts = useQuery({
    queryKey: tenantWebAccountQueryKey,
    queryFn: getTenantWebAccounts,
    staleTime: 15000
  })
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const contracts = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const hasMounted = useRef(false)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    heading.current?.focus({ preventScroll: true })
  }, [selectedId, creating])
  const tenantMap = useMemo(
    () => new Map((tenants.data || []).map((tenant) => [tenant.id, tenant])),
    [tenants.data]
  )
  const accountMap = useMemo(
    () => new Map((accounts.data || []).map((account) => [account.tenant_id, account])),
    [accounts.data]
  )
  const selected = selectedId ? tenantMap.get(selectedId) : undefined
  const roomMap = useMemo(
    () => new Map((rooms.data || []).map((room) => [room.id, room.name])),
    [rooms.data]
  )
  const tenantRoom = useMemo(
    () =>
      new Map(
        (contracts.data || [])
          .filter((contract) => contract.status === 'active')
          .map((contract) => [contract.tenant_id, roomMap.get(contract.room_id) || '—'])
      ),
    [contracts.data, roomMap]
  )
  const textMatch = (text: string) =>
    text
      .toLocaleLowerCase('vi')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replaceAll('đ', 'd')
      .includes(
        search
          .trim()
          .toLocaleLowerCase('vi')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replaceAll('đ', 'd')
      )
  const visibleAccounts = (accounts.data || []).filter(
    (account) =>
      (filter === 'all' || account.status === filter) &&
      textMatch(
        `${tenantMap.get(account.tenant_id)?.full_name || ''} ${account.email} ${tenantRoom.get(account.tenant_id) || ''}`
      )
  )
  const candidates = (tenants.data || []).filter(
    (tenant) =>
      tenant.is_active &&
      !accountMap.has(tenant.id) &&
      textMatch(`${tenant.full_name} ${tenant.email || ''} ${tenantRoom.get(tenant.id) || ''}`)
  )
  const loading = tenants.isPending || accounts.isPending
  const error = tenants.error || accounts.error
  const button =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50'
  function back() {
    setSelectedId(null)
    setCreating(false)
    setSearch('')
  }
  return (
    <main className="min-h-0 flex-1 overflow-auto bg-[var(--brand-canvas)] p-5 md:p-7">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">
              Cài đặt / Tài khoản / Khách thuê
            </p>
            <h1
              ref={heading}
              tabIndex={-1}
              className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 outline-none"
            >
              <Globe size={25} className="text-emerald-700" />
              {selected
                ? 'Quản lý tài khoản web'
                : creating
                  ? 'Cấp tài khoản website'
                  : 'Tài khoản khách thuê'}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {selected
                ? `${selected.full_name} · ${tenantRoom.get(selected.id) || 'Chưa có phòng'}`
                : creating
                  ? 'Chọn khách thuê đã có hồ sơ để cấp tài khoản.'
                  : 'Quản lý đăng nhập tại pay.phongtroankhang.com'}
            </p>
          </div>
          {selectedId || creating ? (
            <button className={button} onClick={back}>
              <ArrowLeft size={16} />
              Quay lại danh sách
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                aria-label="Làm mới tài khoản"
                className={button}
                onClick={() => {
                  void accounts.refetch()
                  void tenants.refetch()
                  void contracts.refetch()
                  void rooms.refetch()
                }}
              >
                <RefreshCw size={16} />
              </button>
              <button
                disabled={loading || !!error}
                className={
                  button + ' !border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700'
                }
                onClick={() => {
                  setCreating(true)
                  setSearch('')
                }}
              >
                <Plus size={16} />
                Cấp tài khoản
              </button>
            </div>
          )}
        </header>
        {error && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            {error.message}
          </div>
        )}
        {loading ? (
          <p className="py-12 text-center text-slate-500" role="status">
            Đang tải tài khoản…
          </p>
        ) : selected ? (
          <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <UserRound size={21} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{selected.full_name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {tenantRoom.get(selected.id) || 'Chưa có hợp đồng đang hiệu lực'}
                </p>
              </div>
            </div>
            <TenantWebAccountPanel key={selected.id} tenant={selected} />
          </section>
        ) : (
          !error && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-4">
                {creating ? (
                  <h2 className="font-semibold text-slate-800">Khách chưa được cấp tài khoản</h2>
                ) : (
                  <div className="flex flex-wrap gap-1" aria-label="Lọc tài khoản">
                    {(
                      [
                        { id: 'all', label: 'Tất cả' },
                        { id: 'active', label: 'Hoạt động' },
                        { id: 'pending', label: 'Chờ đăng nhập' },
                        { id: 'locked', label: 'Đã khóa' }
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        aria-pressed={filter === item.id}
                        onClick={() => setFilter(item.id)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === item.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        {item.label}
                        <span className="ml-2 opacity-70">
                          {
                            (accounts.data || []).filter(
                              (account) => item.id === 'all' || account.status === item.id
                            ).length
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-400">
                  <Search size={16} />
                  <input
                    aria-label="Tìm khách, email hoặc phòng"
                    placeholder="Tìm khách, email hoặc phòng"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-56 min-w-0 bg-transparent text-sm text-slate-700 outline-none"
                  />
                </label>
              </div>
              {creating ? (
                <div className="divide-y divide-slate-100">
                  {candidates.map((tenant) => (
                    <div
                      key={tenant.id}
                      className="flex items-center justify-between gap-4 px-5 py-4"
                    >
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900">{tenant.full_name}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {tenantRoom.get(tenant.id) || 'Chưa có phòng'} ·{' '}
                          {tenant.email || 'Cần bổ sung email trong hồ sơ khách'}
                        </p>
                      </div>
                      <button
                        className={button}
                        disabled={!tenant.email}
                        onClick={() => {
                          setSelectedId(tenant.id)
                          setCreating(false)
                        }}
                      >
                        Chọn khách
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  ))}
                  {!candidates.length && (
                    <p className="px-5 py-12 text-center text-sm text-slate-500">
                      Không có khách thuê phù hợp chưa được cấp tài khoản.
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Khách thuê / phòng</th>
                        <th className="px-5 py-3 font-semibold">Email đăng nhập</th>
                        <th className="px-5 py-3 font-semibold">Trạng thái</th>
                        <th className="px-5 py-3 font-semibold">Đăng nhập gần nhất</th>
                        <th className="px-5 py-3">
                          <span className="sr-only">Thao tác</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleAccounts.map((account) => (
                        <tr key={account.tenant_id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">
                              {tenantMap.get(account.tenant_id)?.full_name ||
                                'Hồ sơ khách không còn khả dụng'}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {tenantRoom.get(account.tenant_id) || 'Chưa có phòng'}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">{account.email}</td>
                          <td className="px-5 py-4">
                            <TenantWebAccountBadge account={account} />
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-500">
                            {account.last_login_at
                              ? new Date(account.last_login_at).toLocaleString('vi-VN')
                              : 'Chưa đăng nhập'}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              disabled={!tenantMap.has(account.tenant_id)}
                              aria-label={`Quản lý tài khoản ${tenantMap.get(account.tenant_id)?.full_name || account.email}`}
                              className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                              onClick={() => setSelectedId(account.tenant_id)}
                            >
                              Quản lý
                              <ChevronRight size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!visibleAccounts.length && (
                        <tr>
                          <td colSpan={5} className="px-5 py-14 text-center text-slate-500">
                            {(accounts.data || []).length
                              ? 'Không tìm thấy tài khoản phù hợp.'
                              : 'Chưa có tài khoản website. Bấm “Cấp tài khoản” để bắt đầu.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )
        )}
      </div>
    </main>
  )
}
