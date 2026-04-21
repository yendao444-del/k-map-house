import { useEffect, useState } from 'react'
import logoNavbar from '../assets/logo_navbar.png'
import type { AppUser } from '../lib/db'

const seasonStyles = `
@keyframes fall {
  0% { transform: translateY(-10vh) translateX(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) translateX(100px) rotate(360deg); opacity: 0.1; }
}
@keyframes floatUp {
  0% { transform: translateY(110vh) translateX(0) scale(0.5); opacity: 0; }
  20% { opacity: 0.8; }
  80% { opacity: 0.8; }
  100% { transform: translateY(-10vh) translateX(50px) scale(1.2); opacity: 0; }
}
@keyframes heatGlaze {
  0% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.05); }
  100% { opacity: 0.3; transform: scale(1); }
}
`;

const getSeason = () => {
  const month = new Date().getMonth() + 1;
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
};

const SeasonalBackground = () => {
  const season = getSeason();

  if (season === 'winter') {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/60 blur-[1px]"
            style={{
              left: `${Math.random() * 100}%`,
              top: '-10%',
              width: `${Math.random() * 6 + 2}px`,
              height: `${Math.random() * 6 + 2}px`,
              animation: `fall ${Math.random() * 5 + 5}s linear infinite`,
              animationDelay: `-${Math.random() * 10}s`
            }}
          />
        ))}
      </div>
    );
  }

  if (season === 'spring') {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className="absolute bg-pink-300/40 blur-[1px]"
            style={{
              left: `${Math.random() * 100}%`,
              top: '-10%',
              width: `${Math.random() * 12 + 6}px`,
              height: `${Math.random() * 8 + 4}px`,
              borderRadius: '50% 0 50% 50%',
              animation: `fall ${Math.random() * 6 + 6}s linear infinite`,
              animationDelay: `-${Math.random() * 10}s`
            }}
          />
        ))}
      </div>
    );
  }

  if (season === 'autumn') {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute bg-orange-400/50 blur-[1px]"
            style={{
              left: `${Math.random() * 100}%`,
              top: '-10%',
              width: `${Math.random() * 15 + 8}px`,
              height: `${Math.random() * 8 + 4}px`,
              borderRadius: '50% 0 50% 0',
              animation: `fall ${Math.random() * 5 + 5}s linear infinite`,
              animationDelay: `-${Math.random() * 10}s`
            }}
          />
        ))}
      </div>
    );
  }

  // summer
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className="absolute -right-[10%] -top-[20%] h-[800px] w-[800px] rounded-full bg-amber-500/10 blur-[150px] mix-blend-screen"
        style={{ animation: 'heatGlaze 6s infinite ease-in-out' }}
      />
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-yellow-300/60 blur-[2px]"
          style={{
            left: `${Math.random() * 100}%`,
            width: `${Math.random() * 5 + 2}px`,
            height: `${Math.random() * 5 + 2}px`,
            animation: `floatUp ${Math.random() * 8 + 6}s linear infinite`,
            animationDelay: `-${Math.random() * 10}s`
          }}
        />
      ))}
    </div>
  );
};
interface LoginScreenProps {
  onLogin: (user: AppUser) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps): React.JSX.Element {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState('...')

  useEffect(() => {
    window.api.update
      .getCurrentVersion()
      .then((result) => {
        if (result.success && result.data) {
          setVersion(result.data)
        }
      })
      .catch(() => undefined)
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const result = await window.api.auth.login(username, password)
      if (!result.ok || !result.user) {
        setError(result.error || 'Đăng nhập thất bại.')
        return
      }

      onLogin(result.user as AppUser)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#002b36] p-6"
      style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
      `}</style>
      <style>{seasonStyles}</style>

      {/* Hiệu ứng phân mùa */}
      <SeasonalBackground />

      {/* Premium Background Glow effects (thay thế cho nền xanh đặc) */}
      <div
        className="pointer-events-none absolute -left-[20%] top-[-10%] h-[800px] w-[800px] animate-pulse rounded-full bg-emerald-600/20 blur-[120px]"
        style={{ animationDuration: '8s' }}
      />
      <div
        className="pointer-events-none absolute -right-[10%] bottom-[-10%] h-[800px] w-[800px] animate-pulse rounded-full bg-teal-600/20 blur-[120px]"
        style={{ animationDuration: '6s', animationDelay: '1s' }}
      />
      <div className="pointer-events-none absolute left-[30%] top-[30%] h-[500px] w-[500px] rounded-full bg-slate-400/5 blur-[100px]" />

      <div className="z-10 w-full max-w-[420px]">
        {/* THẺ ĐĂNG NHẬP */}
        <div className="rounded-[24px] bg-white p-10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] md:p-12">
          {/* Logo & Title */}
          <div className="mb-10 text-center">
            <div className="mb-4 flex justify-center">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/80 bg-gradient-to-br from-white via-emerald-50 to-amber-50 p-4 shadow-[0_22px_55px_-24px_rgba(15,23,42,0.5),inset_0_1px_0_rgba(255,255,255,0.95)]">
                <img src={logoNavbar} alt="DBY HOME" className="h-full w-full object-contain drop-shadow-sm" />
                <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-300 to-yellow-500 shadow-lg shadow-amber-500/25">
                  <i className="fa-solid fa-crown text-[10px] text-white"></i>
                </span>
              </div>
            </div>
            <h2 className="text-2xl font-extrabold uppercase tracking-tight text-slate-800">
              DBY HOME
            </h2>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Property Management System
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Username */}
            <div className="group relative">
              <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-300 transition-colors group-focus-within:text-emerald-500"></i>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
                placeholder="Tên đăng nhập"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm font-semibold text-slate-700 transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>

            {/* Password */}
            <div className="group relative">
              <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-300 transition-colors group-focus-within:text-emerald-500"></i>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mật khẩu"
                className="w-full rounded-xl border-[1.5px] border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm font-semibold text-slate-700 transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>

            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs font-semibold text-rose-600 animate-in fade-in slide-in-from-top-1">
                <i className="fa-solid fa-circle-exclamation shrink-0"></i>
                {error}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? (
                <i className="fa-solid fa-circle-notch animate-spin"></i>
              ) : (
                <i className="fa-solid fa-right-to-bracket"></i>
              )}
              {submitting ? 'ĐANG ĐĂNG NHẬP...' : 'Đăng nhập'}
            </button>
          </form>
        </div>

      </div>

      {/* Footer Info - Đẩy xuống đáy màn hình */}
      <div className="absolute bottom-8 left-0 z-10 w-full space-y-1.5 text-center font-medium tracking-wide">
        <p className="text-[11px] text-white/50">
          Developer: {' '}
          <span
            className="inline-block font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]"
            style={{ animation: 'heatGlaze 3s infinite ease-in-out' }}
          >
            Dao Yen
          </span>
          {' '} by DBY SOFTWARE
        </p>
        <p className="text-[10px] italic text-white/30">
          &copy; 2026 DBY HOME Luxury. All rights reserved.
        </p>
        <p className="block text-[10px] text-white/30">
          Phiên bản v{version}
        </p>
      </div>
    </div>
  )
}
