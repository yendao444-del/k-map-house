import { useEffect, useRef, type RefObject } from 'react'
import { UserRound, Settings, LockKeyhole, FileText, LogOut, ChevronRight, Shield } from 'lucide-react'
import type { AppUser } from '../lib/db'
import headerArt from '../assets/profile-header.webp'
import brandMark from '../assets/profile-brand-mark.png'
import './account-profile.css'

export type ProfileSection = 'profile' | 'security' | 'activity'

export const accountAvatar = (user: AppUser): string => user.avatar_url || (user.role === 'admin'
  ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4,c0aede'
  : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username)}&background=d9f5ee&color=14273d&bold=true`)

export function useAccountFocus(ref: RefObject<HTMLDivElement | null>, onClose: () => void, modal = false) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    const items = () => Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), a[href], [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0)
    items()[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
      if (modal && event.key === 'Tab') {
        const focusable = items()
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    root?.addEventListener('keydown', handleKey)
    return () => {
      root?.removeEventListener('keydown', handleKey)
      if (document.activeElement === document.body || root?.contains(document.activeElement)) previous?.focus()
    }
  }, [ref, modal])
}

export function AccountHeader({ user }: { user: AppUser }) {
  return <header className="account-identity" style={{ backgroundImage: `url(${headerArt})` }}>
    <div className="account-brand"><img src={brandMark} alt="" /><span>AN KHANG HOME</span></div>
    <div className="account-person">
      <img className="account-avatar" src={accountAvatar(user)} alt="Ảnh đại diện" />
      <div className="account-person-copy">
        <h2>{user.full_name || user.username}</h2>
        <span className="account-role"><Shield size={14} aria-hidden="true" /> Quyền: {user.role === 'admin' ? 'Admin' : 'Nhân viên'}</span>
      </div>
    </div>
  </header>
}

interface Props {
  currentUser: AppUser
  onOpen: (section: ProfileSection) => void
  onManage: () => void
  onLogout: () => void | Promise<void>
  onClose: () => void
}

export function AccountMenu({ currentUser, onOpen, onManage, onLogout, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useAccountFocus(ref, onClose)
  return <div id="account-menu" className="account-menu account-surface" ref={ref} role="region" aria-label="Tài khoản của bạn">
    <AccountHeader user={currentUser} />
    <div className="account-actions">
      <button type="button" className="account-row" onClick={() => onOpen('profile')}>
        <UserRound aria-hidden="true" /><span><strong>Hồ sơ cá nhân</strong><small>Cập nhật tên và ảnh đại diện</small></span><ChevronRight aria-hidden="true" />
      </button>
      <button type="button" className="account-row" onClick={onManage}>
        <Settings aria-hidden="true" /><span><strong>Quản lý tài khoản</strong><small>{currentUser.role === 'admin' ? 'Vai trò quản trị viên' : 'Thông tin tài khoản của bạn'}</small></span><ChevronRight aria-hidden="true" />
      </button>
      <button type="button" className="account-row account-security-row" onClick={() => onOpen('security')}>
        <span className="account-security-icon"><LockKeyhole aria-hidden="true" /></span><span><strong>2FA</strong><small>Authenticator, Gmail và các phương thức xác minh</small></span><span className="account-security-cta">Mở 2FA <ChevronRight size={16} aria-hidden="true" /></span>
      </button>
      <button type="button" className="account-row" onClick={() => onOpen('activity')}>
        <FileText aria-hidden="true" /><span><strong>Nhật ký hoạt động</strong><small>Lần đăng nhập gần đây</small></span><ChevronRight aria-hidden="true" />
      </button>
      <button type="button" className="account-row account-signout" onClick={onLogout}>
        <LogOut aria-hidden="true" /><span><strong>Đăng xuất hệ thống</strong></span><ChevronRight aria-hidden="true" />
      </button>
    </div>
  </div>
}
