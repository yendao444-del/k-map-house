import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRooms, getInvoices, type Invoice } from '../lib/db'

interface ElectricWaterOverviewProps {
  onSelectRoom: (roomId: string) => void;
}

export const ElectricWaterOverview: React.FC<ElectricWaterOverviewProps> = ({ onSelectRoom }) => {
  const { data: rooms = [], isLoading: loadingRooms } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })

  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())

  // Calculate averages and abnormal status for each room
  const roomStats = useMemo(() => {
    const stats: Record<string, { currentInvoice: Invoice | null, elecAbnormal: boolean, waterAbnormal: boolean }> = {}

    rooms.forEach(room => {
      // Sort invoices for this room latest first
      const roomInvoices = invoices
        .filter(inv => inv.room_id === room.id)
        .sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year
          return b.month - a.month
        })

      const currentInvoice = roomInvoices.find(inv => inv.month === selectedMonth && inv.year === selectedYear) || null

      // Get last 3 invoices before current month/year for average
      const previousInvoices = roomInvoices.filter(inv => 
        inv.year < selectedYear || (inv.year === selectedYear && inv.month < selectedMonth)
      ).slice(0, 3)

      let elecAbnormal = false
      let waterAbnormal = false

      if (currentInvoice && previousInvoices.length > 0) {
        const avgElec = previousInvoices.reduce((sum, inv) => sum + (inv.electric_usage || 0), 0) / previousInvoices.length
        const avgWater = previousInvoices.reduce((sum, inv) => sum + (inv.water_usage || 0), 0) / previousInvoices.length

        if (avgElec > 0 && currentInvoice.electric_usage > avgElec * 3) elecAbnormal = true
        if (avgWater > 0 && currentInvoice.water_usage > avgWater * 3) waterAbnormal = true
      }

      stats[room.id] = {
        currentInvoice,
        elecAbnormal,
        waterAbnormal
      }
    })

    return stats
  }, [rooms, invoices, selectedMonth, selectedYear])

  const changeMonth = (offset: number) => {
    let newMonth = selectedMonth + offset;
    let newYear = selectedYear;

    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }

    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  }

  const isLoading = loadingRooms || loadingInvoices;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col flex-1 mx-4 my-4 overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded bg-blue-50 flex items-center justify-center text-blue-500 text-xl">
            <i className="fa-solid fa-bolt"></i>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Tổng quan Điện & Nước</h2>
            <p className="text-xs text-gray-500">
              Theo dõi mức tiêu thụ và phát hiện bất thường
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => changeMonth(-1)} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-100 transition text-gray-600">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          
          <div className="font-bold text-gray-800 bg-white border border-gray-200 px-4 py-1.5 rounded-lg shadow-sm">
            Tháng {selectedMonth.toString().padStart(2, '0')} / {selectedYear}
          </div>

          <button onClick={() => changeMonth(1)} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-100 transition text-gray-600">
            <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1 h-0">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="text-[12px] text-gray-500 bg-gray-50 uppercase font-semibold sticky top-0 z-10 shadow-sm border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 border-b border-gray-100">Phòng</th>
              <th className="px-6 py-4 border-b border-gray-100">Điện (kWh)</th>
              <th className="px-6 py-4 border-b border-gray-100">Nước (m³)</th>
              <th className="px-6 py-4 border-b border-gray-100">Trạng thái</th>
              <th className="px-6 py-4 border-b border-gray-100 text-right">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                  <i className="fa-solid fa-spinner fa-spin mr-2"></i> Đang tải dữ liệu...
                </td>
              </tr>
            ) : rooms.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                  Chưa có phòng nào.
                </td>
              </tr>
            ) : (
              rooms.map(room => {
                const stats = roomStats[room.id]
                const inv = stats?.currentInvoice

                let statusBadge = (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> Chưa có dữ liệu
                  </span>
                )

                if (inv) {
                  if (stats.elecAbnormal || stats.waterAbnormal) {
                    let text: string[] = []
                    if (stats.elecAbnormal) text.push('Điện cao')
                    if (stats.waterAbnormal) text.push('Nước cao')
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        <i className="fa-solid fa-triangle-exclamation text-amber-500"></i> {text.join(', ')} bất thường
                      </span>
                    )
                  } else {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                        <i className="fa-solid fa-circle-check text-emerald-500"></i> Bình thường
                      </span>
                    )
                  }
                }

                return (
                  <tr 
                    key={room.id} 
                    className="hover:bg-gray-50/80 transition cursor-pointer group"
                    onClick={() => onSelectRoom(room.id)}
                  >
                    <td className="px-6 py-4 font-bold text-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs">
                          <i className="fa-solid fa-door-open"></i>
                        </div>
                        {room.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {inv ? (
                        <div className="flex items-center gap-2">
                          <span className={`font-bold tabular-nums text-base ${stats.elecAbnormal ? 'text-amber-600' : 'text-gray-800'}`}>
                            {inv.electric_usage}
                          </span>
                          {stats.elecAbnormal && <i className="fa-solid fa-arrow-trend-up text-amber-500 text-xs"></i>}
                        </div>
                      ) : (
                        <span className="text-gray-300 font-bold">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {inv ? (
                        <div className="flex items-center gap-2">
                          <span className={`font-bold tabular-nums text-base ${stats.waterAbnormal ? 'text-amber-600' : 'text-gray-800'}`}>
                            {inv.water_usage}
                          </span>
                          {stats.waterAbnormal && <i className="fa-solid fa-arrow-trend-up text-amber-500 text-xs"></i>}
                        </div>
                      ) : (
                        <span className="text-gray-300 font-bold">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {statusBadge}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-400 group-hover:text-primary transition">
                      <i className="fa-solid fa-chevron-right"></i>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
