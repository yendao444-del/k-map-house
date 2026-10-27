import { CheckCircle2, CircleAlert, CircleHelp } from 'lucide-react'
import type { AppUser } from '../lib/db'

export function AccountSecurityStatus({ user }: { user: AppUser }): React.JSX.Element {
  const states = [
    {
      label: 'Authenticator',
      verified: user.authenticator_verified,
      success: 'Đã xác thực',
      missing: 'Chưa xác thực',
      description: 'Trạng thái thiết lập và xác thực Google Authenticator của tài khoản.'
    },
    {
      label: 'Email',
      verified: user.email_verified,
      success: 'Đã xác minh',
      missing: 'Chưa xác minh',
      description: 'Trạng thái xác minh bằng mã OTP cho email đăng nhập hiện tại; không phải Gmail nhận thông báo.'
    }
  ]

  return (
    <div className="flex flex-col items-start gap-1.5" aria-label="Trạng thái bảo mật">
      {states.map(({ label, verified, success, missing, description }) => {
        const Icon = verified === true ? CheckCircle2 : verified === false ? CircleAlert : CircleHelp
        return (
          <span
            key={label}
            title={description}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              verified === true
                ? 'bg-emerald-50 text-emerald-700'
                : verified === false
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Icon size={13} className="shrink-0" aria-hidden="true" />
            <span>{label} · {verified === true ? success : verified === false ? missing : 'Chưa có dữ liệu'}</span>
          </span>
        )
      })}
    </div>
  )
}
