import { useEffect, useState } from 'react'
import logoNavbar from '../assets/an_khang_home_logo.png'
import loginCinematicApartment from '../assets/login-an-khang-home-right.png'
import { WeatherBackdrop, type WeatherSceneStyle } from './WeatherBackdrop'
import {
  requestPasswordReset,
  resetPasswordFromRecoveryLink,
  signInUser,
  type AppUser
} from '../lib/db'

const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms)
    })
  ])

interface LoginScreenProps {
  onLogin: (user: AppUser) => void
  recoveryMode?: boolean
  onRecoveryComplete?: () => void
}

type PolicyKind = 'terms' | 'privacy'
type PasswordResetStep = 'email' | 'sent' | 'recovery' | 'success'

const policyDocuments: Record<PolicyKind, {
  title: string
  icon: string
  introduction: string
  sections: Array<{ heading: string; paragraphs?: string[]; bullets?: string[] }>
}> = {
  terms: {
    title: 'Điều khoản sử dụng',
    icon: 'fa-file-contract',
    introduction: 'Khi đăng nhập và sử dụng AN KHANG HOME, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản dưới đây.',
    sections: [
      {
        heading: '1. Phạm vi sử dụng',
        paragraphs: ['AN KHANG HOME là phần mềm hỗ trợ quản lý phòng trọ, khách thuê, hợp đồng, hóa đơn, tài sản và các nghiệp vụ vận hành liên quan. Người dùng chỉ được sử dụng phần mềm cho mục đích hợp pháp và đúng phạm vi công việc được phân quyền.']
      },
      {
        heading: '2. Tài khoản và bảo mật',
        bullets: [
          'Bạn có trách nhiệm bảo mật tên đăng nhập, mật khẩu và thiết bị đang sử dụng.',
          'Không chia sẻ tài khoản hoặc cho phép người không có thẩm quyền truy cập hệ thống.',
          'Thông báo ngay cho quản trị viên khi phát hiện truy cập bất thường hoặc nghi ngờ lộ thông tin đăng nhập.'
        ]
      },
      {
        heading: '3. Tính chính xác của dữ liệu',
        paragraphs: ['Người dùng chịu trách nhiệm đối với tính chính xác, hợp pháp và đầy đủ của dữ liệu được nhập vào phần mềm. Hãy kiểm tra kỹ thông tin hợp đồng, hóa đơn, khoản thu, khoản chi và dữ liệu khách thuê trước khi xác nhận.']
      },
      {
        heading: '4. Hành vi không được phép',
        bullets: [
          'Can thiệp, phá hoại, sao chép trái phép hoặc tìm cách vượt qua cơ chế bảo mật của phần mềm.',
          'Sử dụng phần mềm để lưu trữ, xử lý hoặc phát tán nội dung vi phạm pháp luật.',
          'Cố ý nhập dữ liệu sai lệch, truy cập dữ liệu ngoài phạm vi được giao hoặc làm ảnh hưởng đến người dùng khác.'
        ]
      },
      {
        heading: '5. Hoạt động và cập nhật phần mềm',
        paragraphs: ['Phần mềm có thể được bảo trì, cập nhật hoặc tạm ngừng trong thời gian cần thiết để sửa lỗi và nâng cao chất lượng. Một số tính năng có thể thay đổi theo phiên bản mà không cần thông báo trước trong trường hợp không ảnh hưởng đáng kể đến quyền lợi người dùng.']
      },
      {
        heading: '6. Giới hạn trách nhiệm',
        paragraphs: ['AN KHANG HOME là công cụ hỗ trợ quản lý. Người dùng cần tự kiểm tra và chịu trách nhiệm đối với các quyết định nghiệp vụ, giao dịch, nghĩa vụ tài chính và tuân thủ pháp luật phát sinh từ dữ liệu của mình.']
      },
      {
        heading: '7. Liên hệ hỗ trợ',
        paragraphs: ['Nếu có câu hỏi về điều khoản sử dụng, vui lòng liên hệ: yaobinh@gmail.com.']
      }
    ]
  },
  privacy: {
    title: 'Chính sách bảo mật',
    icon: 'fa-shield-halved',
    introduction: 'AN KHANG HOME tôn trọng quyền riêng tư và cam kết xử lý thông tin người dùng một cách minh bạch, đúng mục đích.',
    sections: [
      {
        heading: '1. Thông tin được xử lý',
        bullets: [
          'Thông tin tài khoản như tên đăng nhập, họ tên, vai trò và thông tin liên hệ.',
          'Dữ liệu vận hành do người dùng nhập, bao gồm phòng, khách thuê, hợp đồng, hóa đơn, giao dịch và tài sản.',
          'Thông tin kỹ thuật cần thiết để duy trì đăng nhập, bảo mật, chẩn đoán lỗi và cải thiện hoạt động của phần mềm.'
        ]
      },
      {
        heading: '2. Mục đích sử dụng thông tin',
        bullets: [
          'Cung cấp các chức năng quản lý và đồng bộ dữ liệu theo yêu cầu của người dùng.',
          'Xác thực tài khoản, phân quyền truy cập và bảo vệ hệ thống.',
          'Hỗ trợ người dùng, xử lý lỗi và nâng cao chất lượng phần mềm.'
        ]
      },
      {
        heading: '3. Bảo vệ dữ liệu',
        paragraphs: ['Chúng tôi áp dụng các biện pháp kỹ thuật và quản trị phù hợp để hạn chế truy cập trái phép, thất thoát hoặc sử dụng sai mục đích. Người dùng cũng cần sử dụng mật khẩu mạnh, bảo vệ thiết bị và đăng xuất khi không còn sử dụng.']
      },
      {
        heading: '4. Chia sẻ thông tin',
        paragraphs: ['Thông tin không được bán hoặc chia sẻ cho bên thứ ba vì mục đích quảng cáo. Dữ liệu chỉ có thể được cung cấp cho nhà cung cấp hạ tầng cần thiết để vận hành dịch vụ, theo yêu cầu hợp pháp của cơ quan có thẩm quyền, hoặc khi có sự đồng ý của người dùng.']
      },
      {
        heading: '5. Thời gian lưu trữ',
        paragraphs: ['Dữ liệu được lưu trong thời gian cần thiết để cung cấp dịch vụ, đáp ứng yêu cầu nghiệp vụ hoặc nghĩa vụ pháp lý. Khi không còn cần thiết, dữ liệu sẽ được xóa hoặc ẩn danh theo điều kiện kỹ thuật và quy định áp dụng.']
      },
      {
        heading: '6. Quyền của người dùng',
        bullets: [
          'Yêu cầu xem, cập nhật hoặc sửa thông tin cá nhân không chính xác.',
          'Yêu cầu hỗ trợ về việc xóa hoặc hạn chế xử lý dữ liệu trong phạm vi pháp luật và nghiệp vụ cho phép.',
          'Được giải đáp về cách dữ liệu của mình được thu thập, sử dụng và bảo vệ.'
        ]
      },
      {
        heading: '7. Liên hệ về quyền riêng tư',
        paragraphs: ['Mọi câu hỏi hoặc yêu cầu liên quan đến bảo mật dữ liệu vui lòng gửi tới: yaobinh@gmail.com.']
      }
    ]
  }
}

export function LoginScreen({ onLogin, recoveryMode = false, onRecoveryComplete }: LoginScreenProps): React.JSX.Element {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState('...')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [openPolicy, setOpenPolicy] = useState<PolicyKind | null>(null)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [resetStep, setResetStep] = useState<PasswordResetStep>('email')
  const [resetEmail, setResetEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetNotice, setResetNotice] = useState('')
  const [weatherScene, setWeatherScene] = useState<WeatherSceneStyle>({
    imageOpacity: 0.82,
    shadeOpacity: 0.9
  })

  useEffect(() => {
    if (!window.api?.update) {
      setVersion('1.0.65')
      return
    }
    window.api.update.getCurrentVersion().then((result) => {
      if (result.success && result.data) setVersion(result.data)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!recoveryMode) return
    setForgotPasswordOpen(true)
    setResetStep('recovery')
    setResetError('')
    setResetNotice('')
  }, [recoveryMode])

  useEffect(() => {
    if (!openPolicy) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPolicy(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openPolicy])

  useEffect(() => {
    if (!forgotPasswordOpen) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !resetBusy) setForgotPasswordOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [forgotPasswordOpen, resetBusy])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const user = await withTimeout(signInUser(login, password), 10000, 'Không kết nối được máy chủ dữ liệu. Vui lòng kiểm tra Internet/DNS rồi thử lại.')
      onLogin(user as AppUser)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Đăng nhập thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  const openForgotPassword = () => {
    setResetEmail(login.includes('@') ? login.trim() : '')
    setNewPassword('')
    setConfirmPassword('')
    setShowNewPassword(false)
    setResetStep('email')
    setResetError('')
    setResetNotice('')
    setForgotPasswordOpen(true)
  }

  const sendResetCode = async () => {
    setResetBusy(true)
    setResetError('')
    setResetNotice('')
    try {
      await withTimeout(
        requestPasswordReset(resetEmail),
        15000,
        'Không thể kết nối máy chủ. Vui lòng kiểm tra Internet rồi thử lại.'
      )
      setResetStep('sent')
    } catch (caughtError) {
      setResetError(caughtError instanceof Error ? caughtError.message : 'Không thể gửi mã xác minh.')
    } finally {
      setResetBusy(false)
    }
  }

  const handleRequestReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await sendResetCode()
  }

  const handleCompleteReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setResetError('')
    setResetNotice('')

    if (newPassword.length < 8) {
      setResetError('Mật khẩu mới phải có ít nhất 8 ký tự.')
      return
    }
    if (newPassword !== confirmPassword) {
      setResetError('Mật khẩu nhập lại không khớp.')
      return
    }

    setResetBusy(true)
    try {
      await withTimeout(
        resetPasswordFromRecoveryLink(newPassword),
        15000,
        'Không thể kết nối máy chủ. Vui lòng kiểm tra Internet rồi thử lại.'
      )
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setResetStep('success')
      onRecoveryComplete?.()
    } catch (caughtError) {
      setResetError(caughtError instanceof Error ? caughtError.message : 'Không thể đặt lại mật khẩu.')
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <main className="relative flex min-h-screen overflow-y-auto bg-[#003d35] text-white" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        @media (max-height: 950px) {
          .login-hero { margin-bottom: 14px; padding-bottom: 0; }
          .login-hero .login-logo { height: 58px; width: 70px; border-radius: 18px; }
          .login-hero h2 { margin-top: 12px; font-size: 31px; }
          .login-hero .login-accent { margin-top: 10px; }
          .login-hero p { margin-top: 10px; }
          .login-panel { padding-top: 12px; padding-bottom: 12px; }
          .login-panel .login-secure-note { margin-bottom: 10px; padding-top: 6px; padding-bottom: 6px; }
          .login-panel form { gap: 8px; }
          .login-panel input { height: 42px; }
          .login-panel button[type='submit'] { height: 44px; }
          .login-panel .login-divider { margin-top: 12px; }
          .login-panel .login-legal { margin-top: 12px; }
          .login-panel .login-version { margin-top: 8px; }
        }`}</style>
      <div className="app-titlebar-drag absolute inset-x-0 top-0 z-50 h-10" aria-hidden="true" />
      <img
        src={loginCinematicApartment}
        alt="Tòa nhà căn hộ hiện đại về đêm"
        className="absolute inset-0 h-full w-full object-cover object-[65%_center] transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: weatherScene.imageOpacity }}
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,8,8,0.86)_0%,rgba(3,10,10,0.72)_32%,rgba(2,9,9,0.62)_68%,rgba(1,6,6,0.88)_100%)] transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: weatherScene.shadeOpacity }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.48)_0%,transparent_28%,rgba(0,0,0,0.7)_100%)] transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: Math.min(1, weatherScene.shadeOpacity * 0.92) }}
        aria-hidden="true"
      />
      <WeatherBackdrop onSceneStyleChange={setWeatherScene} />
      <section className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="login-panel w-full max-w-[486px] rounded-[28px] border border-white/70 bg-[#fcfefd] px-7 py-7 text-slate-800 shadow-[0_24px_64px_-30px_rgba(0,21,18,0.9)] sm:px-10 sm:py-8">
          <div className="login-hero mb-6 text-center">
            <span className="login-logo mx-auto flex h-[72px] w-[86px] items-center justify-center rounded-[22px] border border-slate-100 bg-white p-2.5 shadow-[0_14px_32px_-20px_rgba(0,91,69,0.45)]"><img src={logoNavbar} alt="AN KHANG HOME" className="h-full w-full object-contain" /></span>
            <h2 className="mt-5 text-[36px] font-extrabold leading-none tracking-[-0.035em] drop-shadow-[0_3px_10px_rgba(0,91,69,0.12)]">
              <span className="text-[#073f35]">AN KHANG</span>{' '}
              <span className="text-[#00a779]">HOME</span>
            </h2>
            <div className="login-accent mx-auto mt-4 h-1 w-12 rounded-full bg-[#2fcf9b]" />
            <p className="mt-4 text-[13px] font-medium text-slate-500">Nhẹ việc quản lý · Vững vàng vận hành</p>
          </div>

          <div className="login-secure-note mb-6 flex items-center gap-3 rounded-[14px] border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d9f6ea] text-[#008461]"><i className="fa-solid fa-house-circle-check text-[17px]" aria-hidden="true" /></span>
            <p className="text-[12px] font-medium leading-5 text-slate-500"><span className="block text-[14px] font-extrabold text-[#006a50]">Trọ an khang · Chủ nhà an tâm</span>Phòng, hợp đồng và dòng tiền luôn trong tầm tay</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-[13px] font-bold text-slate-700">Email hoặc tên đăng nhập</span>
              <span className="group relative block">
                <i className="fa-regular fa-envelope pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[17px] text-slate-400 transition group-focus-within:text-[#008461]" aria-hidden="true" />
                <input value={login} onChange={(event) => setLogin(event.target.value)} autoFocus autoComplete="username" placeholder="Nhập email hoặc tên đăng nhập" className="h-[52px] w-full rounded-[12px] border border-slate-300 bg-white py-3 pl-12 pr-4 text-[14px] font-medium text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#00a779] focus:ring-4 focus:ring-emerald-500/10" />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-[13px] font-bold text-slate-700">Mật khẩu</span>
              <span className="group relative block">
                <i className="fa-solid fa-lock pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-slate-400 transition group-focus-within:text-[#008461]" aria-hidden="true" />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Nhập mật khẩu" className="h-[52px] w-full rounded-[12px] border border-slate-300 bg-white py-3 pl-12 pr-14 text-[14px] font-medium text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#00a779] focus:ring-4 focus:ring-emerald-500/10" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 transition hover:text-[#008461] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}><i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-[17px]`} aria-hidden="true" /></button>
              </span>
            </label>

            <div className="flex items-center justify-between gap-4 pt-1">
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-slate-600">
                <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 cursor-pointer rounded border-slate-300 bg-white accent-[#00a779]" />
                Ghi nhớ đăng nhập
              </label>
              <button type="button" onClick={openForgotPassword} className="text-[13px] font-bold text-[#008461] transition hover:text-[#005b45] hover:underline">Quên mật khẩu?</button>
            </div>

            {error && <div role="alert" className="flex items-start gap-3 rounded-[9px] border border-rose-200 bg-rose-50 p-4 text-[13px] font-medium leading-5 text-rose-700"><i className="fa-solid fa-circle-exclamation mt-0.5" aria-hidden="true" /><span>{error}</span></div>}

            <button type="submit" disabled={submitting} className="flex h-[54px] w-full items-center justify-center gap-3 rounded-[12px] bg-[#00a779] text-[15px] font-bold text-white shadow-[0_16px_26px_-15px_rgba(0,126,91,0.85)] transition hover:bg-[#008461] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65">
              <i className={`fa-solid ${submitting ? 'fa-circle-notch animate-spin' : 'fa-right-to-bracket'} text-[17px]`} aria-hidden="true" />
              {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className="login-divider mt-6 flex items-center gap-4 text-[12px] text-slate-400" aria-hidden="true"><span className="h-px flex-1 bg-slate-200" /><span>hoặc</span><span className="h-px flex-1 bg-slate-200" /></div>
          <p className="login-legal mt-5 text-center text-[11px] font-medium leading-5 text-slate-500">
            Bằng việc đăng nhập, bạn đồng ý với{' '}
            <button type="button" onClick={() => setOpenPolicy('terms')} className="font-semibold text-[#007c5d] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              Điều khoản sử dụng
            </button>{' '}
            và{' '}
            <button type="button" onClick={() => setOpenPolicy('privacy')} className="font-semibold text-[#007c5d] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              Chính sách bảo mật
            </button>.
          </p>
          <p className="login-version mt-5 text-center text-[10px] font-medium text-slate-400">Phiên bản v{version}</p>
        </div>
      </section>

      {forgotPasswordOpen && (
        <div
          className="app-no-drag fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !resetBusy) setForgotPasswordOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-reset-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.55)]"
          >
            <header className="flex items-center justify-between border-b border-emerald-800/20 bg-[#005b45] px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/12 text-xl ring-1 ring-white/15">
                  <i className={`fa-solid ${resetStep === 'success' ? 'fa-circle-check' : resetStep === 'sent' ? 'fa-envelope-circle-check' : 'fa-key'}`} aria-hidden="true" />
                </span>
                <div>
                  <h2 id="password-reset-title" className="text-lg font-extrabold tracking-[-0.03em]">
                    {resetStep === 'email' ? 'Quên mật khẩu' : resetStep === 'sent' ? 'Kiểm tra email' : resetStep === 'recovery' ? 'Tạo mật khẩu mới' : 'Đổi mật khẩu thành công'}
                  </h2>
                  <p className="mt-1 text-[11px] font-medium text-white/65">
                    {resetStep === 'email' ? 'Bước 1/2 · Xác nhận email' : resetStep === 'sent' ? 'Bước 2/2 · Mở liên kết trong thư' : resetStep === 'recovery' ? 'Nhập mật khẩu mới cho tài khoản' : 'Tài khoản của bạn đã sẵn sàng'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => setForgotPasswordOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Đóng cửa sổ"
              >
                <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
              </button>
            </header>

            {resetStep === 'email' && (
              <form className="p-6" onSubmit={handleRequestReset}>
                <p className="text-[13px] font-medium leading-6 text-slate-600">
                  Nhập email đã đăng ký. Hệ thống sẽ gửi một liên kết an toàn để bạn tạo mật khẩu mới.
                </p>
                <label className="mt-5 block">
                  <span className="mb-2 block text-[13px] font-bold text-slate-800">Email tài khoản</span>
                  <span className="group relative block">
                    <i className="fa-regular fa-envelope pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600" aria-hidden="true" />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      autoFocus
                      autoComplete="email"
                      required
                      placeholder="tenban@example.com"
                      className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-11 pr-4 text-[13px] font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    />
                  </span>
                </label>

                {resetError && (
                  <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] font-medium leading-5 text-rose-700">
                    <i className="fa-solid fa-circle-exclamation mt-0.5" aria-hidden="true" />
                    <span>{resetError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resetBusy}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[13px] font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <i className={`fa-solid ${resetBusy ? 'fa-circle-notch animate-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
                  {resetBusy ? 'Đang gửi...' : 'Gửi liên kết đặt lại mật khẩu'}
                </button>
              </form>
            )}

            {resetStep === 'sent' && (
              <div className="p-7 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                  <i className="fa-solid fa-envelope-circle-check" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-slate-900">Đã gửi email khôi phục</h3>
                <p className="mt-2 text-[13px] font-medium leading-6 text-slate-500">
                  Liên kết đã được gửi tới <span className="font-bold text-slate-700">{resetEmail}</span>. Hãy bấm <span className="font-bold text-emerald-700">Đặt lại mật khẩu</span> trong thư.
                </p>
                <button type="button" disabled={resetBusy} onClick={() => void sendResetCode()} className="mt-6 h-12 w-full rounded-lg bg-emerald-600 text-[13px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                  {resetBusy ? 'Đang gửi lại...' : 'Gửi lại liên kết'}
                </button>
                <button type="button" disabled={resetBusy} onClick={() => { setResetStep('email'); setResetError('') }} className="mt-4 text-[12px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                  Dùng email khác
                </button>
                {resetError && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] font-medium text-rose-700">{resetError}</div>}
              </div>
            )}

            {resetStep === 'recovery' && (
              <form className="p-6" onSubmit={handleCompleteReset}>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-[12px] font-medium leading-5 text-emerald-900">
                  <i className="fa-solid fa-shield-halved mr-2 text-emerald-600" aria-hidden="true" />
                  Liên kết đã được xác minh. Hãy nhập mật khẩu mới cho tài khoản của bạn.
                </div>

                <label className="mt-5 block">
                  <span className="mb-2 block text-[13px] font-bold text-slate-800">Mật khẩu mới</span>
                  <span className="relative block">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      autoFocus
                      required
                      minLength={8}
                      placeholder="Ít nhất 8 ký tự"
                      className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 pr-12 text-[13px] font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    />
                    <button type="button" onClick={() => setShowNewPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-emerald-600" aria-label={showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                      <i className={`fa-regular ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                    </button>
                  </span>
                </label>

                <label className="mt-4 block">
                  <span className="mb-2 block text-[13px] font-bold text-slate-800">Nhập lại mật khẩu mới</span>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Nhập lại mật khẩu"
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                </label>

                {resetNotice && <p className="mt-4 text-[11px] font-medium leading-5 text-slate-500">{resetNotice}</p>}
                {resetError && (
                  <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] font-medium leading-5 text-rose-700">
                    <i className="fa-solid fa-circle-exclamation mt-0.5" aria-hidden="true" />
                    <span>{resetError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resetBusy}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[13px] font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <i className={`fa-solid ${resetBusy ? 'fa-circle-notch animate-spin' : 'fa-key'}`} aria-hidden="true" />
                  {resetBusy ? 'Đang đổi mật khẩu...' : 'Đặt mật khẩu mới'}
                </button>

              </form>
            )}

            {resetStep === 'success' && (
              <div className="p-7 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                  <i className="fa-solid fa-check" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-slate-900">Mật khẩu đã được cập nhật</h3>
                <p className="mt-2 text-[13px] font-medium leading-6 text-slate-500">Bạn có thể đăng nhập bằng mật khẩu mới ngay bây giờ.</p>
                <button type="button" onClick={() => setForgotPasswordOpen(false)} className="mt-6 h-12 w-full rounded-lg bg-emerald-600 text-[13px] font-bold text-white transition hover:bg-emerald-700">
                  Quay lại đăng nhập
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {openPolicy && (() => {
        const document = policyDocuments[openPolicy]
        return (
          <div
            className="app-no-drag fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpenPolicy(null)
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="policy-dialog-title"
              className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.55)]"
            >
              <header className="flex shrink-0 items-center justify-between border-b border-emerald-800/20 bg-[#005b45] px-6 py-5 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/12 text-xl ring-1 ring-white/15">
                    <i className={`fa-solid ${document.icon}`} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="policy-dialog-title" className="text-xl font-extrabold tracking-[-0.03em]">{document.title}</h2>
                    <p className="mt-1 text-[11px] font-medium text-white/65">Cập nhật ngày 24/08/2026</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenPolicy(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-white/75 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Đóng cửa sổ"
                >
                  <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
                </button>
              </header>

              <div className="overflow-y-auto px-6 py-6 sm:px-8">
                <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] font-medium leading-6 text-emerald-900">
                  {document.introduction}
                </p>
                <div className="mt-6 space-y-6">
                  {document.sections.map((section) => (
                    <article key={section.heading}>
                      <h3 className="text-[15px] font-extrabold text-slate-900">{section.heading}</h3>
                      {section.paragraphs?.map((paragraph) => (
                        <p key={paragraph} className="mt-2 text-[13px] font-medium leading-6 text-slate-600">{paragraph}</p>
                      ))}
                      {section.bullets && (
                        <ul className="mt-2 space-y-2 text-[13px] font-medium leading-6 text-slate-600">
                          {section.bullets.map((bullet) => (
                            <li key={bullet} className="flex items-start gap-2.5">
                              <i className="fa-solid fa-circle-check mt-1.5 text-[10px] text-emerald-600" aria-hidden="true" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </div>

              <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:px-8">
                <p className="text-[11px] font-medium text-slate-400">AN KHANG HOME · Phiên bản v{version}</p>
                <button
                  type="button"
                  onClick={() => setOpenPolicy(null)}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/25"
                >
                  Đã hiểu
                </button>
              </footer>
            </section>
          </div>
        )
      })()}
    </main>
  )
}
