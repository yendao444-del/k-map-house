import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateRoom, type Room } from '../lib/db'
import { playSuccess } from '../lib/sound'

interface Props {
  room: Room
  onClose: () => void
}

function lastDayOfMonth(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

export function EndContractNoticeModal({ room, onClose }: Props) {
  const queryClient = useQueryClient()
  const today = new Date()
  const defaultEnd = lastDayOfMonth(today)
  const [endDate, setEndDate] = useState(defaultEnd)

  const daysLeft = endDate ? daysBetween(today, new Date(endDate)) : 0

  const mutation = useMutation({
    mutationFn: () =>
      updateRoom(room.id, {
        status: 'ending',
        expected_end_date: endDate,
      } as any),
    onSuccess: () => {
      playSuccess()
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      onClose()
    },
  })

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.2s_ease-out]">

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <i className="fa-solid fa-bell text-white text-lg"></i>
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Báo kết thúc hợp đồng</h2>
              <p className="text-orange-100 text-xs">{room.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/20 w-8 h-8 rounded-lg flex items-center justify-center transition">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">

          {/* Thông tin hiện tại */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2 border border-gray-100">
            <div className="flex justify-between">
              <span className="text-gray-500">Khách thuê</span>
              <span className="font-semibold text-gray-800">{room.tenant_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ngày vào ở</span>
              <span className="font-semibold text-gray-800">
                {room.move_in_date
                  ? new Date(room.move_in_date).toLocaleDateString('vi-VN')
                  : '—'}
              </span>
            </div>
          </div>

          {/* Ngày dự kiến chuyển đi */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Ngày dự kiến chuyển đi <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={endDate}
              min={today.toISOString().split('T')[0]}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none transition"
            />
            {endDate && (
              <p className={`mt-2 text-sm font-medium flex items-center gap-1.5 ${daysLeft <= 3 ? 'text-red-500' : 'text-orange-500'}`}>
                <i className={`fa-solid ${daysLeft <= 3 ? 'fa-triangle-exclamation' : 'fa-clock'}`}></i>
                Còn <strong>{daysLeft} ngày</strong> kể từ hôm nay
              </p>
            )}
          </div>

          {/* Cảnh báo */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800 flex gap-2">
            <i className="fa-solid fa-circle-info text-yellow-500 mt-0.5 shrink-0"></i>
            <span>Sau khi xác nhận, phòng sẽ chuyển sang trạng thái <strong>Sắp kết thúc</strong>. Bạn có thể hoàn tác bằng cách chọn "Hủy báo kết thúc" từ menu phòng.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition"
          >
            Hủy
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!endDate || mutation.isPending}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-md shadow-orange-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending
              ? <><i className="fa-solid fa-spinner animate-spin"></i> Đang lưu...</>
              : <><i className="fa-solid fa-bell"></i> Xác nhận báo kết thúc</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
