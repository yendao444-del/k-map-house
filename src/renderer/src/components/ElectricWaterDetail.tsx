import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRooms, getInvoices } from '../lib/db'
import { LogoLoading } from './LogoLoading'

interface ElectricWaterDetailProps {
  roomId: string;
  onBack: () => void;
}

export const ElectricWaterDetail: React.FC<ElectricWaterDetailProps> = ({ roomId, onBack }) => {
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })

  const room = rooms.find(r => r.id === roomId)

  const history = useMemo(() => {
    // Lấy hóa đơn của phòng và sắp xếp mới nhất lên đầu
    const roomInvoices = invoices
      .filter(i => i.room_id === roomId)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year
        return b.month - a.month
      })
      .slice(0, 12) // Lấy tối đa 12 tháng gần nhất

    // Tính trạng thái bất thường cho từng hóa đơn
    return roomInvoices.map((inv, index) => {
      // Tính trung bình 3 tháng trước đó (nghĩa là từ index + 1 đến index + 3 trong mảng đã sort)
      const previousInvoices = roomInvoices.slice(index + 1, index + 4)
      
      let elecAbnormal = false
      let waterAbnormal = false

      if (previousInvoices.length > 0) {
        const avgElec = previousInvoices.reduce((sum, i) => sum + (i.electric_usage || 0), 0) / previousInvoices.length
        const avgWater = previousInvoices.reduce((sum, i) => sum + (i.water_usage || 0), 0) / previousInvoices.length

        if (avgElec > 0 && inv.electric_usage > avgElec * 3) elecAbnormal = true
        if (avgWater > 0 && inv.water_usage > avgWater * 3) waterAbnormal = true
      }

      return {
        ...inv,
        elecAbnormal,
        waterAbnormal
      }
    })
  }, [invoices, roomId])

  if (!room) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col flex-1 mx-4 my-4 animate-[fadeIn_0.2s_ease-out] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center gap-4 bg-gray-50/50 rounded-t-xl">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-500 flex items-center justify-center hover:bg-gray-100 hover:text-gray-800 transition shadow-sm"
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-primary">{room.name}</span>
            <span className="text-gray-300">|</span>
            <span className="text-sm font-medium text-gray-600">Lịch sử Điện Nước (12 tháng gần nhất)</span>
          </h2>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1 h-0">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="text-[12px] text-gray-500 bg-gray-50 uppercase font-semibold sticky top-0 z-10 shadow-sm border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 border-b border-gray-100">Kỳ thu</th>
              <th className="px-6 py-4 border-b border-gray-100 text-right">Điện cũ</th>
              <th className="px-6 py-4 border-b border-gray-100 text-right">Điện mới</th>
              <th className="px-6 py-4 border-b border-gray-100 text-right bg-amber-50/30 text-amber-800">Dùng (kWh)</th>
              <th className="px-6 py-4 border-b border-gray-100 text-right">Nước cũ</th>
              <th className="px-6 py-4 border-b border-gray-100 text-right">Nước mới</th>
              <th className="px-6 py-4 border-b border-gray-100 text-right bg-blue-50/30 text-blue-800">Dùng (m³)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                  <LogoLoading className="min-h-[45vh]" />
                </td>
              </tr>
            ) : history.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 text-2xl mx-auto mb-3">
                    <i className="fa-solid fa-clock-rotate-left"></i>
                  </div>
                  <p className="text-gray-500 font-medium">Chưa có lịch sử hóa đơn nào cho phòng này.</p>
                </td>
              </tr>
            ) : (
              history.map((inv) => (
                <tr 
                  key={inv.id} 
                  className={`hover:bg-gray-50 transition ${inv.elecAbnormal || inv.waterAbnormal ? 'bg-amber-50/20' : ''}`}
                >
                  <td className="px-6 py-4 font-bold text-gray-800">
                    Tháng {inv.month.toString().padStart(2, '0')}/{inv.year}
                  </td>
                  
                  {/* Điện */}
                  <td className="px-6 py-4 text-right text-gray-500 tabular-nums">{inv.electric_old.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-medium text-gray-700 tabular-nums">{inv.electric_new.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-right font-bold tabular-nums text-base border-r border-gray-50 ${inv.elecAbnormal ? 'text-amber-600 bg-amber-50/50' : 'text-amber-600'}`}>
                    +{inv.electric_usage.toLocaleString()}
                    {inv.elecAbnormal && (
                      <div className="text-[10px] text-red-500 flex items-center justify-end gap-1 mt-0.5">
                        <i className="fa-solid fa-triangle-exclamation"></i> Tăng đột biến
                      </div>
                    )}
                  </td>
                  
                  {/* Nước */}
                  <td className="px-6 py-4 text-right text-gray-500 tabular-nums">{inv.water_old.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-medium text-gray-700 tabular-nums">{inv.water_new.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-right font-bold tabular-nums text-base ${inv.waterAbnormal ? 'text-blue-600 bg-blue-50/50' : 'text-blue-600'}`}>
                    +{inv.water_usage.toLocaleString()}
                    {inv.waterAbnormal && (
                      <div className="text-[10px] text-red-500 flex items-center justify-end gap-1 mt-0.5">
                        <i className="fa-solid fa-triangle-exclamation"></i> Tăng đột biến
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
