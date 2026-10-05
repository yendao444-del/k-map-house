import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { Invoice, Room, Tenant } from '../lib/db'

const formatVND = (amount: number): string => new Intl.NumberFormat('vi-VN').format(amount)

export function PriorInvoiceDebt({
  invoices,
  month,
  year,
  roomById,
  tenantById,
  searchQuery,
  loading,
  error,
  onRetry,
  onPay,
  onView
}: {
  invoices: Invoice[]
  month: number
  year: number
  roomById: Map<string, Room>
  tenantById: Map<string, Tenant>
  searchQuery: string
  loading: boolean
  error: Error | null
  onRetry: () => void
  onPay: (invoice: Invoice) => void
  onView: (invoice: Invoice) => void
}): ReactElement {
  const [visibleCount, setVisibleCount] = useState(50)
  useEffect(() => setVisibleCount(50), [month, year, searchQuery])
  const matchingInvoices = useMemo(() => {
    const search = searchQuery.trim().toLowerCase()
    return invoices.filter((invoice) =>
      `${roomById.get(invoice.room_id)?.name || ''} ${tenantById.get(invoice.tenant_id)?.full_name || ''} ${invoice.month}/${invoice.year}`
        .toLowerCase()
        .includes(search)
    )
  }, [invoices, roomById, tenantById, searchQuery])
  const remaining = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_amount) - Number(invoice.paid_amount),
    0
  )

  return (
    <section aria-label="Nợ các tháng trước" className="border-b border-rose-100">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-rose-50 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-rose-800">
            <i className="fa-solid fa-file-circle-exclamation mr-2" aria-hidden="true" />
            Nợ các tháng trước
            {!loading && !error && (
              <span className="ml-2 font-semibold">· {invoices.length} hóa đơn</span>
            )}
          </h3>
          <p className="mt-1 text-xs text-rose-700">
            Trước tháng {month}/{year} · Bao gồm nợ đã chốt, còn phải thu.
          </p>
        </div>
        {!loading && !error && (
          <div className="text-sm font-bold tabular-nums text-rose-700">
            Tổng nợ cũ: {formatVND(remaining)} đ
          </div>
        )}
      </div>
      {loading ? (
        <p role="status" className="px-4 py-4 text-sm text-gray-500">
          Đang tải nợ các tháng trước...
        </p>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 px-4 py-4 text-sm text-rose-700"
        >
          <span>Không tải được nợ cũ: {error.message}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-rose-200 px-3 py-1.5 font-semibold hover:bg-rose-50"
          >
            Thử lại
          </button>
        </div>
      ) : matchingInvoices.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-500">
          {invoices.length === 0
            ? 'Không có hóa đơn còn nợ trước tháng đang chọn.'
            : 'Không có nợ cũ khớp tìm kiếm. Tổng nợ cũ phía trên gồm tất cả phòng.'}
        </p>
      ) : (
        <>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-white text-gray-500">
                <tr>
                  <th className="px-4 py-2">Phòng / Khách thuê</th>
                  <th className="px-4 py-2">Tháng nợ</th>
                  <th className="px-4 py-2 text-right">Còn thu</th>
                  <th className="px-4 py-2">Trạng thái</th>
                  <th className="px-4 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matchingInvoices.slice(0, visibleCount).map((invoice) => {
                  const roomName = roomById.get(invoice.room_id)?.name || invoice.room_id
                  const tenantName = tenantById.get(invoice.tenant_id)?.full_name
                  return (
                    <tr key={invoice.id} className="hover:bg-rose-50/40">
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => onView(invoice)}
                          className="font-bold text-gray-800 hover:text-green-700 hover:underline"
                        >
                          {roomName}
                        </button>
                        {tenantName && <p className="mt-0.5 text-gray-500">{tenantName}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-gray-600">
                        {String(invoice.month).padStart(2, '0')}/{invoice.year}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-bold tabular-nums text-rose-600">
                        {formatVND(Number(invoice.total_amount) - Number(invoice.paid_amount))} đ
                      </td>
                      <td className="px-4 py-2 text-rose-700">
                        {invoice.payment_status === 'partial' ? 'Thu thiếu' : 'Chưa thu'}
                        {invoice.debt_confirmed_at && (
                          <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 font-semibold">
                            Đã chốt nợ
                          </span>
                        )}
                        {invoice.is_settlement && (
                          <span className="ml-2 text-gray-500">Tất toán</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onPay(invoice)}
                          aria-label={`Thu tiền ${roomName} tháng ${invoice.month}/${invoice.year}`}
                          className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-1.5 font-semibold text-white hover:bg-green-700"
                        >
                          Thu tiền
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {visibleCount < matchingInvoices.length && (
            <div className="flex items-center justify-center gap-3 px-4 py-2 text-xs text-gray-500">
              {visibleCount}/{matchingInvoices.length} hóa đơn nợ cũ
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 50)}
                className="rounded-lg border border-rose-200 px-3 py-1.5 font-semibold text-rose-700 hover:bg-rose-50"
              >
                Hiển thị thêm
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
