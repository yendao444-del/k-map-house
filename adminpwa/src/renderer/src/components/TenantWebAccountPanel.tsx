import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Copy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck
} from 'lucide-react'
import type { Tenant } from '../lib/db'
import { getCurrentSessionUser } from '../lib/db'
import { useTenantEmailCheck } from '../lib/use-tenant-email-check'
import {
  generateTenantPassword,
  getTenantWebAccounts,
  manageTenantWebAccount,
  tenantWebAccountLabel,
  tenantWebAccountQueryKey,
  type TenantAccountAction,
  type TenantWebAccount
} from '../lib/tenant-web-accounts'

export function TenantWebAccountBadge({
  account,
  loading,
  failed
}: {
  account?: TenantWebAccount
  loading?: boolean
  failed?: boolean
}) {
  const color = failed
    ? 'border-red-200 bg-red-50 text-red-600'
    : !account
      ? 'border-slate-200 bg-slate-50 text-slate-500'
      : account.status === 'locked'
        ? 'border-red-200 bg-red-50 text-red-600'
        : account.status === 'pending'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${color}`}
    >
      <Globe size={13} aria-hidden="true" />
      {loading ? 'Đang tải…' : failed ? 'Chưa tải được' : tenantWebAccountLabel(account)}
    </span>
  )
}

export function TenantWebAccountPanel({ tenant }: { tenant: Tenant }) {
  const emailCheck = useTenantEmailCheck(tenant.email)
  const client = useQueryClient()
  const accounts = useQuery({
    queryKey: tenantWebAccountQueryKey,
    queryFn: getTenantWebAccounts,
    staleTime: 15000
  })
  const currentUser = useQuery({
    queryKey: ['current-session-user'],
    queryFn: getCurrentSessionUser,
    staleTime: 30000
  })
  const account = accounts.data?.find((item) => item.tenant_id === tenant.id)
  const isAdmin = currentUser.data?.role === 'admin'
  const [form, setForm] = useState<'create' | 'reset_password' | null>(null)
  const [password, setPassword] = useState(''),
    [show, setShow] = useState(false)
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [confirmation, setConfirmation] = useState<TenantAccountAction | null>(null)
  const [message, setMessage] = useState('')
  const pendingSecret = useRef('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pendingSecret.current = ''
    }
  }, [])
  useEffect(() => {
    setForm(null)
    setPassword('')
    setIssued(null)
    setConfirmation(null)
    setMessage('')
    pendingSecret.current = ''
  }, [tenant.id])
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: ({ action }: { action: TenantAccountAction }) =>
      manageTenantWebAccount(tenant.id, action, pendingSecret.current || undefined),
    onSuccess: (updated, variables) => {
      client.setQueryData<TenantWebAccount[]>(tenantWebAccountQueryKey, (rows = []) => [
        ...rows.filter((row) => row.tenant_id !== updated.tenant_id),
        updated
      ])
      void client.invalidateQueries({ queryKey: tenantWebAccountQueryKey })
      if (!mounted.current) return
      if (pendingSecret.current)
        setIssued({ email: updated.email, password: pendingSecret.current })
      setPassword('')
      setForm(null)
      setConfirmation(null)
      setMessage(
        variables.action === 'create'
          ? 'Đã cấp tài khoản. Sao chép thông tin trước khi đóng hồ sơ.'
          : variables.action === 'reset_password'
            ? 'Đã đặt lại mật khẩu và đăng xuất các phiên đang dùng.'
            : variables.action === 'lock'
              ? 'Đã khóa tài khoản và thu hồi phiên đăng nhập.'
              : variables.action === 'unlock'
                ? 'Đã mở lại tài khoản.'
                : 'Đã đăng xuất các phiên website.'
      )
      // React Query must not retain a plaintext password in the mutation cache.
      mutation.reset()
    },
    onSettled: () => {
      pendingSecret.current = ''
    }
  })
  function begin(action: 'create' | 'reset_password') {
    mutation.reset()
    setMessage('')
    setIssued(null)
    setPassword('')
    setShow(false)
    setForm(action)
    setConfirmation(null)
  }
  async function copyCredentials() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(
        `Website: https://pay.phongtroankhang.com\nEmail: ${issued.email}\nMật khẩu: ${issued.password}`
      )
      setMessage('Đã sao chép thông tin đăng nhập.')
    } catch {
      setMessage('Chưa sao chép được. Bạn có thể chọn từng trường bên dưới.')
    }
  }
  const button =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50'
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Globe size={19} className="text-emerald-700" />
            Tài khoản website
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Đăng nhập tại pay.phongtroankhang.com
          </p>
        </div>
        <TenantWebAccountBadge
          account={account}
          loading={accounts.isPending}
          failed={accounts.isError}
        />
      </div>
      {accounts.isError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <p>{accounts.error.message}</p>
          <button className={button + ' mt-3'} onClick={() => void accounts.refetch()}>
            Tải lại trạng thái
          </button>
        </div>
      )}
      {account && (
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm">
          <div className="py-3">
            <dt className="text-xs text-slate-500">Email đăng nhập</dt>
            <dd className="mt-1 break-all font-semibold text-slate-900">{account.email}</dd>
          </div>
          <div className="py-3">
            <dt className="text-xs text-slate-500">Đăng nhập gần nhất</dt>
            <dd className="mt-1 font-medium text-slate-700">
              {account.last_login_at
                ? new Date(account.last_login_at).toLocaleString('vi-VN')
                : 'Chưa đăng nhập'}
            </dd>
          </div>
        </dl>
      )}
      {!account && !accounts.isPending && !accounts.isError && (
        <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4">
          <p className="text-sm text-slate-600">Khách này chưa có tài khoản website.</p>
          {(emailCheck.error || emailCheck.checking) && <p role="status" className="mt-2 text-xs text-amber-700">{emailCheck.error || 'Đang kiểm tra email…'}</p>}
          {!tenant.email && (
            <p className="mt-2 text-xs text-amber-700">
              Bổ sung email trong hồ sơ khách trước khi cấp tài khoản.
            </p>
          )}
          {!tenant.is_active && (
            <p className="mt-2 text-xs text-amber-700">
              Khách đã ngừng hoạt động. Chưa thể cấp tài khoản mới.
            </p>
          )}
        </div>
      )}
      {isAdmin && !accounts.isPending && !accounts.isError && !form && !confirmation && (
        <div className="flex flex-wrap gap-2">
          {!account ? (
            <button
              disabled={!tenant.email || !tenant.is_active || emailCheck.blocked || mutation.isPending}
              className={
                button + ' !border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700'
              }
              onClick={() => begin('create')}
            >
              <KeyRound size={16} />
              Cấp tài khoản website
            </button>
          ) : (
            <>
              <button
                className={button}
                disabled={mutation.isPending}
                onClick={() => begin('reset_password')}
              >
                <KeyRound size={16} />
                Đặt lại mật khẩu
              </button>
              <button
                className={
                  button + (account.status === 'locked' ? ' !text-emerald-700' : ' !text-red-600')
                }
                disabled={mutation.isPending}
                onClick={() => {
                  mutation.reset()
                  setIssued(null)
                  setMessage('')
                  setConfirmation(account.status === 'locked' ? 'unlock' : 'lock')
                }}
              >
                <LockKeyhole size={16} />
                {account.status === 'locked' ? 'Mở tài khoản' : 'Khóa tài khoản'}
              </button>
              <button
                className={button}
                disabled={mutation.isPending}
                onClick={() => {
                  mutation.reset()
                  setIssued(null)
                  setMessage('')
                  setConfirmation('revoke_sessions')
                }}
              >
                <RefreshCw size={16} />
                Đăng xuất các phiên
              </button>
            </>
          )}
        </div>
      )}
      {form && (
        <form
          className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!mutation.isPending && (form !== 'create' || !emailCheck.blocked)) {
              pendingSecret.current = password
              mutation.mutate({ action: form })
            }
          }}
        >
          <p className="text-sm font-bold text-slate-800">
            {form === 'create' ? 'Cấp tài khoản mới' : 'Đặt mật khẩu mới'}
          </p>
          <p className="break-all text-xs text-slate-500">
            {account?.email || tenant.email} · {tenant.full_name}
          </p>
          <label
            htmlFor="tenant-web-password"
            className="block text-xs font-semibold text-slate-600"
          >
            Mật khẩu (tối thiểu 10 ký tự)
          </label>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white">
            <input
              id="tenant-web-password"
              autoComplete="new-password"
              type={show ? 'text' : 'password'}
              minLength={10}
              maxLength={128}
              required
              disabled={mutation.isPending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              className="p-3 text-slate-500"
              aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onClick={() => setShow((value) => !value)}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-emerald-700"
            disabled={mutation.isPending}
            onClick={() => {
              setPassword(generateTenantPassword())
              setShow(true)
            }}
          >
            Tạo mật khẩu ngẫu nhiên
          </button>
          <p className="text-xs leading-5 text-slate-500">
            {form === 'create'
              ? 'Email lấy từ hồ sơ khách. Thông tin đăng nhập hiện một lần sau khi cấp; không tự gửi email.'
              : 'Thao tác này thay mật khẩu và đăng xuất các phiên website hiện tại.'}
          </p>
          <div className="flex gap-2">
            <button
              disabled={mutation.isPending || form === 'create' && emailCheck.blocked}
              type="submit"
              className={button + ' !border-emerald-600 !bg-emerald-600 !text-white'}
            >
              {mutation.isPending && <LoaderCircle size={15} className="animate-spin" />}
              {form === 'create' ? 'Xác nhận cấp' : 'Đặt lại mật khẩu'}
            </button>
            <button
              disabled={mutation.isPending}
              type="button"
              className={button}
              onClick={() => {
                setForm(null)
                setPassword('')
                mutation.reset()
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      )}
      {confirmation && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            {confirmation === 'lock'
              ? 'Khóa đăng nhập website của khách này?'
              : confirmation === 'unlock'
                ? 'Mở lại tài khoản website?'
                : 'Đăng xuất tất cả phiên website của khách này?'}
          </p>
          <p className="text-xs leading-5 text-slate-600">
            {confirmation === 'unlock'
              ? 'Quyền xem phòng vẫn phụ thuộc hợp đồng đang hiệu lực.'
              : 'Khách cần đăng nhập lại. Hồ sơ, hợp đồng và hóa đơn vẫn được giữ.'}
          </p>
          <div className="flex gap-2">
            <button
              disabled={mutation.isPending}
              className={button + ' !border-emerald-600 !bg-emerald-600 !text-white'}
              onClick={() => mutation.mutate({ action: confirmation })}
            >
              {mutation.isPending && <LoaderCircle size={15} className="animate-spin" />}Xác nhận
            </button>
            <button
              disabled={mutation.isPending}
              className={button}
              onClick={() => {
                setConfirmation(null)
                mutation.reset()
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      )}
      {mutation.isError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {mutation.error.message}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm leading-5 text-emerald-700">
          {message}
        </p>
      )}
      {issued && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <ShieldCheck size={17} />
            Thông tin đăng nhập vừa cấp
          </p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="select-text break-all font-medium">{issued.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Mật khẩu</dt>
              <dd className="select-text break-all font-mono">{issued.password}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500">Đóng hồ sơ sẽ không xem lại được mật khẩu này.</p>
          <button className={button} onClick={() => void copyCredentials()}>
            <Copy size={15} />
            Sao chép để cấp cho khách
          </button>
          <button className="ml-2 text-xs text-slate-500 underline" onClick={() => setIssued(null)}>
            Ẩn thông tin
          </button>
        </div>
      )}
      {!isAdmin && currentUser.isSuccess && (
        <p className="text-xs text-slate-500">Chỉ quản trị viên được cấp và thay đổi tài khoản.</p>
      )}
      <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-400">
        Mật khẩu hiện tại không thể xem lại. Đổi email đăng nhập sẽ được bổ sung cùng bước xác minh
        email.
      </p>
    </section>
  )
}
