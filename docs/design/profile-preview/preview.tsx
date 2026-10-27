import { useState, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountMenu, type ProfileSection } from '../../../adminpwa/src/renderer/src/components/AccountMenu'
import { ProfileModal } from '../../../adminpwa/src/renderer/src/components/ProfileModal'
import { SecurityAccessPanel } from '../../../adminpwa/src/renderer/src/components/SecurityAccessPanel'
import type { AppUser } from '../../../adminpwa/src/renderer/src/lib/db'
import '../../../adminpwa/src/renderer/src/assets/main.css'
import './preview.css'
import avatar from './reference-avatar.png'

function Preview() {
  const previewMode = new URLSearchParams(window.location.search).get('mode')
  if (previewMode === 'setup' || previewMode === 'recovery') return <main className="security-preview-page"><SecurityAccessPanel initialState={previewMode === 'setup' ? 'enroll' : 'recovery_codes'} onCancel={async () => { window.location.href = '/' }} onComplete={async () => { window.location.href = '/' }} /></main>
  const [user, setUser] = useState<AppUser>({id:'profile-demo',username:'profile-demo',full_name:'Đào Bình Yên',avatar_url:avatar,role:'admin',status:'active',created_at:'2026-10-09'})
  const [open, setOpen] = useState(true)
  const [section, setSection] = useState<ProfileSection | null>(null)
  const [notice, setNotice] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])
  return <main>
    <header className="preview-bar"><span>Xem trước hồ sơ · Dữ liệu mẫu</span><div ref={ref}>
      <button className="preview-open" type="button" aria-label="Mở tài khoản của bạn" aria-expanded={open} aria-controls="account-menu" onClick={() => {setOpen(!open);setNotice('')}}>Tài khoản</button>
      {open && <AccountMenu currentUser={user} onClose={() => setOpen(false)} onOpen={value => {setOpen(false);setSection(value)}} onManage={() => {setOpen(false);setNotice('Ứng dụng sẽ mở phần quản lý tài khoản trong Cài đặt.')}} onLogout={() => {setOpen(false);setNotice('Đã kiểm tra thao tác đăng xuất trong bản xem trước.')}} />}
    </div></header>
    {notice && <p className="preview-notice" role="status">{notice}</p>}
    {section && <ProfileModal key={section} currentUser={user} initialSection={section} onClose={() => {setSection(null);setOpen(true)}} onUpdate={value => {setUser({...user,...value});setNotice('Đã lưu thay đổi trong dữ liệu mẫu.')}} />}
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
