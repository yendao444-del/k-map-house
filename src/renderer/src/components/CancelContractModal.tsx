import { useState } from 'react'
import { cancelContract, type Room } from '../lib/db'
import { playDelete } from '../lib/sound'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
    room: Room
    onClose: () => void
}

export function CancelContractModal({ room, onClose }: Props) {
    const queryClient = useQueryClient()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleConfirm = async () => {
        setLoading(true)
        setError('')
        try {
            await cancelContract(room.id)
            playDelete()
            queryClient.invalidateQueries({ queryKey: ['rooms'] })
            queryClient.invalidateQueries({ queryKey: ['contracts'] })
            queryClient.invalidateQueries({ queryKey: ['activeContracts'] })
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            onClose()
        } catch (err: any) {
            setError(err.message || 'Có lỗi xảy ra')
            setLoading(false)
        }
    }

    return (
        <div
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80]"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <i className="fa-solid fa-ban text-red-500 text-2xl"></i>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800">Hủy hợp đồng?</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Phòng <span className="font-semibold text-gray-700">{room.name}</span> — <span className="font-semibold text-gray-700">{room.tenant_name}</span>
                    </p>
                </div>

                {/* Nội dung */}
                <div className="mx-6 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-1.5">
                    <div className="flex items-start gap-2">
                        <i className="fa-solid fa-circle-check text-amber-500 mt-0.5 shrink-0"></i>
                        <span>Phòng được đặt lại thành <strong>Đang trống</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                        <i className="fa-solid fa-circle-check text-amber-500 mt-0.5 shrink-0"></i>
                        <span>Hóa đơn đầu kỳ chưa thu sẽ bị <strong>xóa</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                        <i className="fa-solid fa-circle-check text-amber-500 mt-0.5 shrink-0"></i>
                        <span>Hợp đồng chuyển sang trạng thái <strong>Đã hủy</strong></span>
                    </div>
                </div>

                {error && (
                    <div className="mx-6 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 flex items-center gap-2">
                        <i className="fa-solid fa-triangle-exclamation shrink-0"></i>
                        <span>{error}</span>
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 pb-6 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50"
                    >
                        Giữ lại
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 shadow-md shadow-red-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading
                            ? <><i className="fa-solid fa-spinner animate-spin"></i> Đang hủy...</>
                            : <><i className="fa-solid fa-ban"></i> Xác nhận hủy</>
                        }
                    </button>
                </div>
            </div>
        </div>
    )
}
