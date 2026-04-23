import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { recordInvoicePayment, type Invoice, type Room } from '../lib/db'
import { buildInvoiceTransferDescription, normalizeTransferText } from '../lib/invoiceTransfer'
import { playPayment } from '../lib/sound'

interface SePaySyncModalProps {
  apiToken: string
  invoices: Invoice[]
  rooms: Room[]
  onClose: () => void
}

interface SepayTransaction {
  id: string
  amount_in: string
  transaction_content: string
  transaction_date: string
  bank_brand_name: string
  account_number: string
  reference_number: string
}

interface SepayResponse {
  status: number
  error?: string
  transactions?: SepayTransaction[]
}

interface SepayFetchResult {
  ok: boolean
  error?: string
  data: SepayResponse
}

interface MatchResult {
  invoice: Invoice
  transaction: SepayTransaction
  matchType: 'exact' | 'partial' | 'over'
}

const formatVND = (v: number): string => new Intl.NumberFormat('vi-VN').format(v)

export const SePaySyncModal: React.FC<SePaySyncModalProps> = ({ apiToken, invoices, rooms, onClose }) => {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [successCount, setSuccessCount] = useState(0)
  const [rawTxs, setRawTxs] = useState<SepayTransaction[]>([])

  const roomNameById = useMemo(() => {
    const map = new Map<string, string>()
    rooms.forEach((room) => map.set(room.id, room.name || ''))
    return map
  }, [rooms])

  const pendingInvoices = invoices.filter(
    (inv) => !inv.is_settlement && ['unpaid', 'partial'].includes(inv.payment_status)
  )

  const fetchTransactions = async (): Promise<void> => {
    setLoading(true)
    setError('')

    try {
      const res = (await window.api.sepay.fetchTransactions(apiToken)) as SepayFetchResult
      if (!res.ok) throw new Error(res.error || 'Lỗi kết nối API SePay')

      const data = res.data
      if (data.status !== 200) throw new Error(data.error || 'Lỗi từ API SePay')

      const txs = data.transactions || []
      const foundMatches: MatchResult[] = []
      const codeToInvoice = new Map<string, Invoice>()

      pendingInvoices.forEach((inv) => {
        const roomName = roomNameById.get(inv.room_id) || ''
        codeToInvoice.set(buildInvoiceTransferDescription(inv, roomName), inv)
      })

      txs.forEach((tx) => {
        const normalizedContent = normalizeTransferText(tx.transaction_content || '')
        const amount = Number(tx.amount_in)
        const matchedInvoices = [...codeToInvoice.entries()]
          .filter(([code]) => normalizedContent.includes(code))
          .map(([, inv]) => inv)
        const uniqueInvoiceIds = [...new Set(matchedInvoices.map((inv) => inv.id))]

        // Strict: 1 giao dịch chỉ được map đúng 1 hóa đơn.
        if (uniqueInvoiceIds.length !== 1) return

        const inv = matchedInvoices[0]
        const needToPay = inv.total_amount - inv.paid_amount

        // Strict: chỉ cho phép sync khi số tiền đúng bằng số còn nợ.
        if (Math.abs(amount - needToPay) >= 1) return

        foundMatches.push({
          invoice: inv,
          transaction: tx,
          matchType: 'exact'
        })
      })

      setRawTxs(txs)
      setMatches(foundMatches)
    } catch (err) {
      console.error('SePay Sync Error:', err)
      setError(err instanceof Error ? err.message : 'Không thể kết nối (Lỗi CORS hoặc Mạng)')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!apiToken) {
      setError('Vui lòng thiết lập API Token của SePay trong tab Cài đặt trước.')
      setLoading(false)
      return
    }
    fetchTransactions()
  }, [apiToken, invoices, rooms])

  const updateMutation = useMutation({
    mutationFn: async ({ match }: { match: MatchResult }) => {
      const inv = match.invoice
      const tx = match.transaction
      const txAmount = Number(tx.amount_in)

      return recordInvoicePayment(inv.id, {
        amount: txAmount,
        payment_method: 'transfer',
        payment_date: new Date().toISOString(),
        note: `Thu qua SePay: ${tx.transaction_content} (Ref: ${tx.reference_number})`
      })
    },
    onSuccess: (_, variables) => {
      playPayment()
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setSuccessCount((s) => s + 1)
      setMatches((prev) => prev.filter((m) => m.transaction.id !== variables.match.transaction.id))
    }
  })

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 bg-blue-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl shadow-sm">
              <i className="fa-solid fa-arrows-rotate disabled:animate-spin"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Đồng bộ lịch sử SePay</h2>
              <p className="text-sm text-gray-500">Tự động đối chiếu ngân hàng với hóa đơn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500 transition"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <i className="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i>
              <p className="text-gray-600 font-medium">Đang tải lịch sử từ SePay...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-center">
              <i className="fa-solid fa-circle-exclamation text-rose-500 text-3xl mb-3"></i>
              <p className="text-rose-700 font-medium">{error}</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center opacity-70">
              <i className="fa-solid fa-clipboard-check text-5xl text-emerald-400 mb-4"></i>
              <h3 className="text-lg font-bold text-gray-800">Không có giao dịch chờ xử lý</h3>
              <p className="text-gray-500 text-sm mt-1">Lịch sử SePay hiện không có khoản tiền khớp đủ điều kiện strict.</p>

              {rawTxs.length > 0 && (
                <div className="mt-6 text-left border border-gray-200 rounded-lg p-4 bg-white w-full">
                  <div className="text-xs font-bold text-gray-500 mb-2">DEBUG: 5 GIAO DỊCH GẦN NHẤT TỪ SEPAY</div>
                  <ul className="text-xs text-gray-600 space-y-2">
                    {rawTxs.slice(0, 5).map((tx) => (
                      <li key={tx.id} className="border-b border-gray-100 pb-2">
                        <span className="text-blue-600 font-mono">[{tx.amount_in.split('.')[0]}đ]</span>
                        <span className="ml-2 bg-gray-100 px-1 rounded font-mono">&quot;{tx.transaction_content}&quot;</span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-xs font-bold text-gray-500 mt-4 mb-2">TRANSFER CODE đang chờ thu:</div>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {pendingInvoices.map((inv) => (
                      <li key={inv.id} className="font-mono text-emerald-600">
                        {roomNameById.get(inv.room_id) || 'Phòng ?'}:{' '}
                        &quot;{buildInvoiceTransferDescription(inv, roomNameById.get(inv.room_id) || '')}&quot;
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-semibold text-gray-600 mb-2">Phát hiện {matches.length} giao dịch khớp tuyệt đối:</div>
              {matches.map((match) => {
                const actual = Number(match.transaction.amount_in)
                return (
                  <div
                    key={match.transaction.id}
                    className="bg-white border text-sm border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-gray-800">Giao dịch</span>
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-mono border border-gray-200">
                            Ref: {match.transaction.reference_number}
                          </span>
                          <span className="font-bold text-emerald-600">{formatVND(actual)} đ</span>
                        </div>
                        <div className="text-xs text-green-600 font-bold">Khớp mã + khớp đúng số tiền</div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0 justify-center">
                        <button
                          onClick={() => updateMutation.mutate({ match })}
                          disabled={updateMutation.isPending}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg px-4 py-2 text-xs font-bold transition shadow-sm border border-emerald-600 disabled:opacity-50"
                        >
                          Duyệt: Chốt phiếu
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-white flex justify-between items-center">
          <div className="text-sm font-medium text-gray-500">
            {successCount > 0 ? (
              <span className="text-emerald-600 mr-2">
                <i className="fa-solid fa-check-circle mr-1"></i>Đã chốt thành công: {successCount} hóa đơn
              </span>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition text-sm"
          >
            Đóng bảng
          </button>
        </div>
      </div>
    </div>
  )
}
