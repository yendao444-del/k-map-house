import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { recordInvoicePayment, type Invoice, type Room } from '../lib/db'
import { buildInvoiceTransferDescription, normalizeTransferText } from '../lib/invoiceTransfer'
import { playPayment } from '../lib/sound'
import { LogoLoading } from './LogoLoading'

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
  account_name?: string
  sub_account?: string
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

interface InvoiceCodeInfo {
  invoice: Invoice
  roomName: string
  room?: Room
  code: string
  normalizedCode: string
  remaining: number
  isPending: boolean
}

const formatVND = (v: number): string => new Intl.NumberFormat('vi-VN').format(v)

const fmtDate = (d?: string): string =>
  d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

const getInvoiceTitle = (invoice: Invoice): string => {
  if (invoice.billing_reason === 'deposit_refund') return 'Trả tiền cọc'
  if (invoice.billing_reason === 'deposit_collect') return 'Thu tiền cọc'
  if (invoice.billing_reason === 'contract_end') return 'Tất toán hợp đồng'
  if (invoice.billing_reason === 'service') return 'Thu phí dịch vụ'
  if (invoice.is_first_month) return 'Thu tiền tháng đầu tiên'
  return `Thu tiền tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`
}

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

  const roomById = useMemo(() => {
    const map = new Map<string, Room>()
    rooms.forEach((room) => map.set(room.id, room))
    return map
  }, [rooms])

  const pendingInvoices = invoices.filter(
    (inv) => !inv.is_settlement && ['unpaid', 'partial'].includes(inv.payment_status)
  )

  const invoiceCodeInfos = useMemo<InvoiceCodeInfo[]>(
    () =>
      invoices
        .filter((inv) => inv.payment_status !== 'cancelled' && inv.payment_status !== 'merged' && !inv.is_settlement)
        .map((invoice) => {
          const roomName = roomNameById.get(invoice.room_id) || ''
          const code = buildInvoiceTransferDescription(invoice, roomName)
          return {
            invoice,
            roomName,
            room: rooms.find((room) => room.id === invoice.room_id),
            code,
            normalizedCode: normalizeTransferText(code),
            remaining: Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0)),
            isPending: ['unpaid', 'partial'].includes(invoice.payment_status)
          }
        }),
    [invoices, roomNameById, rooms]
  )

  const pendingCodeInfos = useMemo(
    () => invoiceCodeInfos.filter((info) => info.isPending),
    [invoiceCodeInfos]
  )

  const recentTxDiagnostics = useMemo(() => {
    return rawTxs.slice(0, 5).map((tx) => {
      const amount = Number(tx.amount_in)
      const accountLabel = [tx.account_name, tx.bank_brand_name].filter(Boolean).join(' - ') || 'Tài khoản nhận'
      const accountNumber = tx.account_number || tx.sub_account || ''
      const normalizedContent = normalizeTransferText(tx.transaction_content || '')
      const pendingCodeMatches = pendingCodeInfos.filter((info) =>
        normalizedContent.includes(info.normalizedCode)
      )
      const allCodeMatches = invoiceCodeInfos.filter((info) =>
        normalizedContent.includes(info.normalizedCode)
      )
      const roomToken = normalizedContent.match(/P([A-Z0-9]+)T\d{6}C/)?.[1] || ''
      const roomMatch = roomToken
        ? rooms.find((room) => (room.name.match(/\d+/g)?.join('') || '') === roomToken)
        : undefined
      const pendingByRoom = roomMatch
        ? pendingCodeInfos.filter((info) => info.invoice.room_id === roomMatch.id)
        : []

      let status: 'ok' | 'warn' | 'error' = 'error'
      let title = 'Chưa khớp hóa đơn'
      let detail = 'Không tìm thấy mã chuyển khoản của hóa đơn đang chờ thu.'

      if (pendingCodeMatches.length === 1) {
        const info = pendingCodeMatches[0]
        if (Math.abs(amount - info.remaining) < 1) {
          status = 'ok'
          title = 'Khớp đủ điều kiện'
          detail = `${info.roomName}: đúng mã và đúng số còn thu ${formatVND(info.remaining)} đ.`
        } else {
          status = 'warn'
          title = 'Đúng mã nhưng lệch tiền'
          detail = `${info.roomName}: SePay ${formatVND(amount)} đ, hóa đơn còn thu ${formatVND(info.remaining)} đ.`
        }
      } else if (pendingCodeMatches.length > 1) {
        status = 'warn'
        title = 'Một giao dịch khớp nhiều hóa đơn'
        detail = 'Nội dung chuyển khoản chứa nhiều mã hóa đơn, cần kiểm tra thủ công.'
      } else if (allCodeMatches.length > 0) {
        const info = allCodeMatches[0]
        if (info.invoice.payment_status === 'paid') {
          const paidAt = tx.transaction_date
            ? new Date(tx.transaction_date).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })
            : ''
          status = 'ok'
          title = 'Đã chuyển khoản'
          detail = `${info.roomName}: hóa đơn đã thu đủ${paidAt ? ` lúc ${paidAt}` : ''}.`
        } else {
          status = 'warn'
          title = 'Đúng mã nhưng chưa cần chốt'
          detail = `${info.roomName}: trạng thái hiện tại là ${info.invoice.payment_status}.`
        }
      } else if (roomMatch && pendingByRoom.length > 0) {
        status = 'warn'
        title = `Có vẻ là ${roomMatch.name}, nhưng sai mã hóa đơn`
        detail = `Mã đang chờ: ${pendingByRoom.map((info) => info.code).join(', ')}.`
      } else if (roomMatch) {
        status = 'warn'
        title = `Có vẻ là ${roomMatch.name}`
        detail = 'Phòng này hiện không có hóa đơn đang chờ thu trong danh sách đồng bộ.'
      }

      const relatedInfo = pendingCodeMatches[0] || allCodeMatches[0] || pendingByRoom[0]
      const relatedInvoice = relatedInfo?.invoice
      const relatedRoom = relatedInfo?.room || (relatedInvoice ? rooms.find((room) => room.id === relatedInvoice.room_id) : roomMatch)
      const relatedRoomName = relatedInfo?.roomName || relatedRoom?.name || roomMatch?.name || ''
      const tenantName = relatedRoom?.tenant_name || ''
      const tenantPhone = relatedRoom?.tenant_phone || ''
      const invoiceTitle = relatedInvoice ? getInvoiceTitle(relatedInvoice) : ''
      const periodText = relatedInvoice
        ? relatedInvoice.billing_period_start && relatedInvoice.billing_period_end
          ? `${fmtDate(relatedInvoice.billing_period_start)} - ${fmtDate(relatedInvoice.billing_period_end)}`
          : `T.${String(relatedInvoice.month).padStart(2, '0')}/${relatedInvoice.year}`
        : ''
      const transferCode = relatedInfo?.code || ''

      return {
        tx,
        amount,
        accountLabel,
        accountNumber,
        status,
        title,
        detail,
        roomName: relatedRoomName,
        tenantName,
        tenantPhone,
        invoiceTitle,
        periodText,
        transferCode,
        remaining: relatedInfo?.remaining,
      }
    })
  }, [invoiceCodeInfos, pendingCodeInfos, rawTxs, rooms])

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
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
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
            <LogoLoading message="Đang tải lịch sử từ SePay..." className="py-12" />
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
                <div className="mt-6 w-full space-y-3 text-left">
                  <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                    <div className="mb-3">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        5 giao dịch SePay gần nhất
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        Hiển thị lý do từng giao dịch chưa được tự động chốt.
                      </div>
                    </div>
                    <div className="space-y-2">
                      {recentTxDiagnostics.map(({
                        tx,
                        amount,
                        accountLabel,
                        accountNumber,
                        status,
                        title,
                        detail,
                        roomName,
                        tenantName,
                        tenantPhone,
                        invoiceTitle,
                        periodText,
                        transferCode,
                        remaining,
                      }) => (
                        <div
                          key={tx.id}
                          className={`rounded-lg border px-3 py-2 ${
                            status === 'ok'
                              ? 'border-emerald-200 bg-emerald-50'
                              : status === 'warn'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                {roomName && (
                                  <span className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-black text-emerald-700 border border-emerald-100">
                                    {roomName}
                                  </span>
                                )}
                                {tenantName && <span className="font-bold text-slate-800">{tenantName}</span>}
                                {tenantPhone && <span className="text-[11px] font-semibold text-slate-500">{tenantPhone}</span>}
                                <span className="font-black text-slate-900">{formatVND(amount)} đ</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                    status === 'ok'
                                      ? 'bg-emerald-600 text-white'
                                      : status === 'warn'
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-slate-300 text-slate-700'
                                  }`}
                                >
                                  {title}
                                </span>
                              </div>
                              <div className="mt-1 break-all rounded bg-white/70 px-2 py-1 font-mono text-[11px] text-slate-600">
                                {tx.transaction_content || 'Không có nội dung'}
                              </div>
                              {(invoiceTitle || periodText || transferCode) && (
                                <div className="mt-2 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
                                  {invoiceTitle && (
                                    <div>
                                      <span className="font-semibold text-slate-500">Hóa đơn:</span>{' '}
                                      <span className="font-bold text-slate-800">{invoiceTitle}</span>
                                    </div>
                                  )}
                                  {periodText && (
                                    <div>
                                      <span className="font-semibold text-slate-500">Kỳ thu:</span>{' '}
                                      <span className="font-bold text-slate-800">{periodText}</span>
                                    </div>
                                  )}
                                  {typeof remaining === 'number' && (
                                    <div>
                                      <span className="font-semibold text-slate-500">Còn thu:</span>{' '}
                                      <span className="font-bold text-red-600">{formatVND(remaining)} đ</span>
                                    </div>
                                  )}
                                  {transferCode && (
                                    <div>
                                      <span className="font-semibold text-slate-500">Mã CK:</span>{' '}
                                      <span className="font-mono font-bold text-blue-700">{transferCode}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                                <span>Người nhận: {accountLabel}</span>
                                {accountNumber && <span>STK: {accountNumber}</span>}
                              </div>
                              <div className="mt-1 text-[11px] font-semibold text-slate-600">{detail}</div>
                            </div>
                            <div className="shrink-0 text-[10px] text-slate-400">
                              {tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString('vi-VN') : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-700">
                      Mã chuyển khoản đang chờ thu
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {pendingCodeInfos.map((info) => (
                        <div key={info.invoice.id} className="rounded-lg bg-white px-3 py-2 text-xs shadow-sm">
                          <div className="font-bold text-slate-800">{info.roomName || 'Phòng ?'}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-emerald-700">{info.code}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">Còn thu {formatVND(info.remaining)} đ</div>
                        </div>
                      ))}
                      {pendingCodeInfos.length === 0 && (
                        <div className="text-xs font-semibold text-emerald-700">Không còn hóa đơn nào đang chờ thu.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {false && rawTxs.length > 0 && (
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
                const invoice = match.invoice
                const room = roomById.get(invoice.room_id)
                const roomName = room?.name || roomNameById.get(invoice.room_id) || 'Phòng ?'
                const tenantName = room?.tenant_name || 'Chưa rõ khách thuê'
                const tenantPhone = room?.tenant_phone || ''
                const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount)
                const transferCode = buildInvoiceTransferDescription(invoice, roomName)
                const periodText = invoice.billing_period_start && invoice.billing_period_end
                  ? `${fmtDate(invoice.billing_period_start)} - ${fmtDate(invoice.billing_period_end)}`
                  : `T.${String(invoice.month).padStart(2, '0')}/${invoice.year}`
                return (
                  <div
                    key={match.transaction.id}
                    className="bg-white border text-sm border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-black text-emerald-700 border border-emerald-100">
                            {roomName}
                          </span>
                          <span className="font-bold text-gray-800">{tenantName}</span>
                          {tenantPhone && <span className="text-xs font-semibold text-gray-500">{tenantPhone}</span>}
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-mono border border-gray-200">
                            Ref: {match.transaction.reference_number}
                          </span>
                          <span className="font-bold text-emerald-600">{formatVND(actual)} đ</span>
                        </div>
                        <div className="grid gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
                          <div>
                            <span className="font-semibold text-slate-500">Hóa đơn:</span>{' '}
                            <span className="font-bold text-slate-800">{getInvoiceTitle(invoice)}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500">Kỳ thu:</span>{' '}
                            <span className="font-bold text-slate-800">{periodText}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500">Cần thu:</span>{' '}
                            <span className="font-bold text-red-600">{formatVND(remaining)} đ</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-500">Mã CK:</span>{' '}
                            <span className="font-mono font-bold text-blue-700">{transferCode}</span>
                          </div>
                        </div>
                        <div className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500 border border-slate-100">
                          {match.transaction.transaction_content || 'Không có nội dung chuyển khoản'}
                        </div>
                        <div className="mt-2 text-xs text-green-600 font-bold">Khớp mã + khớp đúng số tiền. Có thể duyệt chốt phiếu.</div>
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
