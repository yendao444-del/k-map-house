import React, { useState } from 'react'
import { updateUser, type AppUser } from '../lib/db'
import { playSuccess, playClick } from '../lib/sound'

interface ProfileModalProps {
    currentUser: AppUser
    onClose: () => void
    onUpdate: (user: AppUser) => void
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
    currentUser,
    onClose,
    onUpdate
}) => {
    const isLegacyLocalAdmin = currentUser.id === 'legacy-local-admin'
    const [fullName, setFullName] = useState(currentUser.full_name || '')
    const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || '')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

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
                    full_name: fullName,
                    avatar_url: avatarUrl
                })
                playSuccess()
                onClose()
                return
            }

            const updatedUser = await updateUser(currentUser.id, {
                full_name: fullName,
                avatar_url: avatarUrl
            })
            onUpdate(updatedUser)
            playSuccess()
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
                    const ctx = canvas.getContext('2d')!
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
        try {
            const processed = await processAvatarImage(file)
            setAvatarUrl(processed)
        } catch (err: any) {
            setError(err.message || 'Không xử lý được ảnh')
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                <div className="relative h-24 bg-gradient-to-r from-emerald-500 to-teal-600 p-6">
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                    <h2 className="text-xl font-black text-white">Hồ sơ cá nhân</h2>
                </div>

                <div className="relative -mt-10 px-6 pb-8">
                    <div className="flex justify-center">
                        <div className="h-24 w-24 rounded-[28px] border-4 border-white bg-white p-1 shadow-xl">
                            <img
                                src={avatarUrl || (currentUser.role === 'admin' ? avatarOptions[0].url : `https://ui-avatars.com/api/?name=${fullName || currentUser.username}&background=00ffcc&color=00151a&bold=true`)}
                                className="h-full w-full rounded-[24px] object-cover"
                                alt="Avatar Preview"
                            />
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Họ và tên</label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                                placeholder="Nhập họ tên của bạn"
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ảnh đại diện</label>

                            {/* Upload từ PC */}
                            <input
                                id="avatar-file-input"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    playClick()
                                    document.getElementById('avatar-file-input')?.click()
                                }}
                                className="flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-600 transition-all hover:border-emerald-400 hover:bg-emerald-100 active:scale-95"
                            >
                                <i className="fa-solid fa-upload text-xs"></i>
                                Upload ảnh từ máy tính
                            </button>

                            {/* URL input */}
                            <input
                                type="text"
                                value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                                onChange={(e) => setAvatarUrl(e.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                                placeholder={avatarUrl.startsWith('data:') ? '📎 Đang dùng ảnh từ máy tính' : 'Hoặc dán link ảnh tại đây...'}
                            />

                            <div className="flex justify-between gap-2">
                                {avatarOptions.map((opt) => (
                                    <button
                                        key={opt.name}
                                        type="button"
                                        onClick={() => {
                                            playClick()
                                            setAvatarUrl(opt.url)
                                        }}
                                        className={`h-12 w-12 rounded-xl border-2 p-0.5 transition-all hover:scale-110 ${avatarUrl === opt.url ? 'border-emerald-500 ring-4 ring-emerald-500/10' : 'border-transparent'}`}
                                    >
                                        <img src={opt.url} className="h-full w-full rounded-[8px] object-cover" alt={opt.name} />
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => {
                                        playClick()
                                        setAvatarUrl('')
                                    }}
                                    className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-[10px] font-bold transition-all hover:scale-110 ${!avatarUrl ? 'border-emerald-500 ring-4 ring-emerald-500/10 bg-emerald-50 text-emerald-600' : 'border-slate-100 text-slate-400'}`}
                                >
                                    Auto
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-[11px] font-bold text-red-600 animate-in fade-in slide-in-from-top-1">
                                <i className="fa-solid fa-circle-exclamation mr-2"></i>
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 rounded-[20px] bg-slate-100 py-4 text-xs font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-200"
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-[2] rounded-[20px] bg-emerald-500 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
                            >
                                {saving ? (
                                    <i className="fa-solid fa-spinner animate-spin"></i>
                                ) : (
                                    'Lưu thay đổi'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
