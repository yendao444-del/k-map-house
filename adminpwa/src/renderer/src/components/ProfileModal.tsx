import React, { useState, useRef } from 'react'
import { X, Upload } from 'lucide-react'
import { updateUser, changeOwnPassword, type AppUser } from '../lib/db'
import { AccountHeader, useAccountFocus, type ProfileSection } from './AccountMenu'
import { SecurityProfilePanel } from './SecurityProfilePanel'

interface ProfileModalProps {
    currentUser: AppUser
    onClose: () => void
    onUpdate: (user: AppUser) => void
    initialSection?: ProfileSection
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
    currentUser,
    onClose,
    onUpdate,
    initialSection = 'profile'
}) => {
    const isLegacyLocalAdmin = currentUser.id === 'legacy-local-admin'
    const [fullName, setFullName] = useState(currentUser.full_name || '')
    const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || '')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [passwordPending, setPasswordPending] = useState(false)
    const [securityPending, setSecurityPending] = useState(false)
    const busy = saving || processing || passwordPending || securityPending
    const [section, setSection] = useState<ProfileSection>(initialSection)
    const securitySurface = section !== 'profile'
    const ref = useRef<HTMLDivElement>(null)
    const uploadRef = useRef<HTMLInputElement>(null)
    useAccountFocus(ref, () => { if (!busy) onClose() }, true)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        if (!fullName.trim()) {
            setError('Vui lòng nhập họ tên')
            return
        }
        setSaving(true)
        try {
            if (isLegacyLocalAdmin) {
                onUpdate({
                    ...currentUser,
                    full_name: fullName.trim(),
                    avatar_url: avatarUrl
                })
                onClose()
                return
            }

            const updatedUser = await updateUser(currentUser.id, {
                full_name: fullName.trim(),
                avatar_url: avatarUrl
            })
            onUpdate(updatedUser)
            onClose()
        } catch (err: any) {
            setError(err.message || 'Không thể cập nhật hồ sơ')
        } finally {
            setSaving(false)
        }
    }

    /** Crop hình vuông giữa ảnh, resize 256×256, nén JPEG ≤ 150KB */
    const processAvatarImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const MAX_SIZE_KB = 150
            const OUTPUT_PX = 256

            const reader = new FileReader()
            reader.onerror = () => reject(new Error('Không đọc được file'))
            reader.onload = (ev) => {
                const img = new Image()
                img.onerror = () => reject(new Error('File ảnh không hợp lệ'))
                img.onload = () => {
                    // --- Center crop: cắt hình vuông ở giữa ---
                    const side = Math.min(img.width, img.height)
                    const sx = (img.width - side) / 2
                    const sy = (img.height - side) / 2

                    const canvas = document.createElement('canvas')
                    canvas.width = OUTPUT_PX
                    canvas.height = OUTPUT_PX
                    const ctx = canvas.getContext('2d')
                    if (!ctx) { reject(new Error('Không thể xử lý ảnh trên thiết bị này.')); return }
                    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_PX, OUTPUT_PX)

                    // --- Nén JPEG, giảm chất lượng cho đến khi ≤ MAX_SIZE_KB ---
                    let quality = 0.92
                    let dataUrl = canvas.toDataURL('image/jpeg', quality)

                    while (dataUrl.length * 0.75 > MAX_SIZE_KB * 1024 && quality > 0.1) {
                        quality = Math.max(0.1, quality - 0.08)
                        dataUrl = canvas.toDataURL('image/jpeg', quality)
                    }

                    const finalKB = Math.round(dataUrl.length * 0.75 / 1024)
                    console.log(`[Avatar] Đã xử lý: ${OUTPUT_PX}×${OUTPUT_PX}px | JPEG q=${quality.toFixed(2)} | ~${finalKB}KB`)
                    resolve(dataUrl)
                }
                img.src = ev.target?.result as string
            }
            reader.readAsDataURL(file)
        })
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setError('Vui lòng chọn file ảnh hợp lệ (JPG, PNG, GIF...)')
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            setError('File quá lớn. Vui lòng chọn ảnh nhỏ hơn 10MB.')
            return
        }
        setError('')
        setProcessing(true)
        try {
            const processed = await processAvatarImage(file)
            setAvatarUrl(processed)
        } catch (err: any) {
            setError(err.message || 'Không xử lý được ảnh')
        } finally {
            setProcessing(false)
        }
        // Reset input để cho phép chọn lại cùng file
        e.target.value = ''
    }

    const avatarOptions = [
        { name: 'Felix', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4,c0aede' },
        { name: 'Aneka', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=ffdfbf,ffd5dc' },
        { name: 'Nala', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nala&backgroundColor=b6e3f4' },
        { name: 'Bastian', url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bastian&backgroundColor=c0aede' },
    ]

    return (
        <div className="account-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
            <div className={`account-surface account-dialog${securitySurface ? ' account-security-dialog' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-label="Hồ sơ và bảo mật tài khoản" aria-busy={busy}>
                {securitySurface ? <header className="account-security-heading"><div className="account-security-brand">AN KHANG HOME</div><button className="account-text-button account-profile-link" type="button" disabled={busy} onClick={() => setSection('profile')}>Hồ sơ cá nhân</button><h2>Bảo mật tài khoản</h2><p>Quản lý phương thức bảo mật, thiết bị tin cậy và phiên đăng nhập của bạn.</p></header> : <AccountHeader user={{ ...currentUser, full_name: fullName || currentUser.username, avatar_url: avatarUrl }} />}
                <button type="button" className="account-close" aria-label="Đóng hồ sơ" disabled={busy} onClick={onClose}><X size={18} /></button>
                {!securitySurface && <div className="account-tabs" role="tablist" aria-label="Thông tin tài khoản">
                    {([['profile', 'Hồ sơ cá nhân'], ['security', '2FA'], ['activity', 'Hoạt động']] as const).map(([key, label]) =>
                        <button key={key} id={`account-tab-${key}`} type="button" role="tab" aria-selected={section === key} aria-controls="account-panel" tabIndex={section === key ? 0 : -1} disabled={busy}
                            onClick={() => setSection(key)} onKeyDown={event => {
                                const sections: ProfileSection[] = ['profile', 'security', 'activity']
                                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                                    event.preventDefault()
                                    const next = event.key === 'Home' ? 'profile' : event.key === 'End' ? 'activity' : sections[(sections.indexOf(section) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]
                                    setSection(next)
                                    document.getElementById(`account-tab-${next}`)?.focus()
                                }
                            }}>{label}</button>)}
                </div>}
                <div id="account-panel" role={securitySurface ? undefined : 'tabpanel'} aria-labelledby={securitySurface ? undefined : `account-tab-${section}`} className="account-content">
                    {section === 'profile' && <form className="account-form" onSubmit={handleSubmit}>
                        <div><h3>Thông tin cá nhân</h3><p>Để mọi người dễ dàng nhận ra bạn.</p></div>
                        <div className="account-field">
                            <label htmlFor="profile-name">Họ và tên</label>
                            <input id="profile-name" className="account-input" required maxLength={120} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} disabled={saving} placeholder="Nhập họ tên của bạn" />
                        </div>
                        <fieldset className="account-field account-fieldset" disabled={saving || processing}>
                            <legend>Ảnh đại diện</legend>
                            <input ref={uploadRef} type="file" accept="image/*" className="hidden" aria-label="Chọn ảnh đại diện" onChange={handleFileUpload} />
                            <button type="button" className="account-upload" onClick={() => uploadRef.current?.click()}><Upload size={17} /> {processing ? 'Đang xử lý ảnh…' : 'Tải ảnh từ thiết bị'}</button>
                            <label htmlFor="profile-avatar-url">Hoặc dùng đường dẫn ảnh</label>
                            <input id="profile-avatar-url" className="account-input" type="url" value={avatarUrl.startsWith('data:') ? '' : avatarUrl} onChange={event => setAvatarUrl(event.target.value)} placeholder={avatarUrl.startsWith('data:') ? 'Đang dùng ảnh đã tải lên' : 'https://…'} />
                            <div className="account-presets" aria-label="Ảnh đại diện có sẵn">
                                {avatarOptions.map(opt => <button key={opt.name} type="button" aria-label={`Dùng ảnh ${opt.name}`} aria-pressed={avatarUrl === opt.url} onClick={() => setAvatarUrl(opt.url)}><img src={opt.url} alt="" /></button>)}
                                <button type="button" className="account-auto" aria-pressed={!avatarUrl} onClick={() => setAvatarUrl('')}>Mặc định</button>
                            </div>
                        </fieldset>
                        <div className="account-field"><label htmlFor="profile-username">Tên đăng nhập</label><input id="profile-username" className="account-input" value={currentUser.username} readOnly autoComplete="username" /></div>
                        {currentUser.email && <div className="account-field"><label htmlFor="profile-email">Email tài khoản</label><input id="profile-email" className="account-input" value={currentUser.email} readOnly /></div>}
                        {error && <div className="account-alert" role="alert">{error}</div>}
                        <div className="account-buttons"><button type="button" className="account-secondary" disabled={saving || processing} onClick={onClose}>Hủy</button><button type="submit" className="account-primary" disabled={saving || processing}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
                    </form>}
                    {securitySurface && <SecurityProfilePanel isLegacyLocalAdmin={isLegacyLocalAdmin} onPendingChange={setSecurityPending} initialView={section === 'activity' ? 'activity' : 'security'} passwordForm={!isLegacyLocalAdmin ? <PasswordForm onPendingChange={setPasswordPending} /> : undefined} passwordPending={passwordPending} />}
                </div>
            </div>
        </div>
    )
}


function PasswordForm({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) {
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const completionLock = useRef(false)
    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (completionLock.current) return
        setError(''); setSuccess(false)
        if (!currentPassword) { setError('Nhập mật khẩu hiện tại.'); return }
        if (newPassword.length < 12) { setError('Mật khẩu mới cần ít nhất 12 ký tự.'); return }
        if (newPassword !== confirmation) { setError('Mật khẩu xác nhận không khớp.'); return }
        completionLock.current = true
        setPending(true); onPendingChange(true)
        try {
            await changeOwnPassword(newPassword, currentPassword)
            setSuccess(true)
        } catch (err) { setError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu. Vui lòng thử lại.') }
        finally {
            setCurrentPassword(''); setNewPassword(''); setConfirmation('')
            completionLock.current = false; setPending(false); onPendingChange(false)
        }
    }
    return <form className="account-form" onSubmit={submit}>
        <div><h3>Đổi mật khẩu</h3><p>Nhập mật khẩu hiện tại để xác nhận. Mật khẩu mới cần ít nhất 12 ký tự.</p></div>
        {([
            ['profile-current-password', 'Mật khẩu hiện tại', currentPassword, setCurrentPassword, 'current-password'],
            ['profile-new-password', 'Mật khẩu mới', newPassword, setNewPassword, 'new-password'],
            ['profile-confirm-password', 'Xác nhận mật khẩu mới', confirmation, setConfirmation, 'new-password']
        ] as const).map(([id, label, value, setter, autoComplete]) => <div key={id} className="account-field"><label htmlFor={id}>{label}</label><input id={id} className="account-input" type="password" required maxLength={256} disabled={pending} autoComplete={autoComplete} value={value} onChange={event => { setter(event.target.value); setError(''); setSuccess(false) }} /></div>)}
        {error && <div className="account-alert" role="alert">{error}</div>}
        {success && <div className="account-alert account-success" role="status">Đổi mật khẩu thành công.</div>}
        <button type="submit" className="account-primary" disabled={pending}>{pending ? 'Đang lưu…' : 'Xác nhận và đổi mật khẩu'}</button>
    </form>
}
