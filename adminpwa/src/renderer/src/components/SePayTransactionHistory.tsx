import React, { useEffect, useMemo, useState } from 'react'
import { formatSepayTransactionTime } from '../lib/sepay-transaction-time'
import {
  loadSepayReadKeys,
  saveSepayReadKey,
  sepayReadKey,
  sepayReadStorageKey
} from '../lib/sepay-read-state'

export interface SepayDiagnostic {
  tx: {
    id: string
    amount_in: string
    bank_brand_name: string
    account_number: string
    reference_number: string
    transaction_date: string
    transaction_content: string
  }
  amount: number
  accountLabel: string
  accountNumber: string
  status: 'ok' | 'warn' | 'error'
  title: string
  detail: string
  roomName: string
  tenantName: string
  tenantPhone: string
  invoiceTitle: string
  periodText: string
  transferCode: string
  remaining?: number
  suggestionInvoiceId?: string
  canRecordBank?: boolean
}

interface Props {
  diagnostics: SepayDiagnostic[]
  userId?: string
  onRecord: (tx: SepayDiagnostic['tx']) => void
  onApproveSuggestion?: (tx: SepayDiagnostic['tx'], invoiceId: string) => void
  actionPending?: boolean
  processingKeys: string[]
  recordedKeys: string[]
}

const formatVND = (value: number): string => new Intl.NumberFormat('vi-VN').format(value)
const normalizeSearch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export const SePayTransactionHistory: React.FC<Props> = ({
  diagnostics,
  userId,
  onRecord,
  onApproveSuggestion,
  actionPending,
  processingKeys,
  recordedKeys
}) => {
  const [readKeys, setReadKeys] = useState(() => loadSepayReadKeys(userId))
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(5)
  const [storageWarning, setStorageWarning] = useState(false)

  useEffect(() => {
    setReadKeys(loadSepayReadKeys(userId))
    setStorageWarning(false)
    const reload = (event: StorageEvent): void => {
      if (!event.key || (userId && event.key === sepayReadStorageKey(userId))) {
        setReadKeys(loadSepayReadKeys(userId))
      }
    }
    window.addEventListener('storage', reload)
    return () => window.removeEventListener('storage', reload)
  }, [userId])

  const readSet = useMemo(() => new Set(readKeys), [readKeys])
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi-VN')
    const normalized = normalizeSearch(query)
    return diagnostics.filter((item) => {
      if (!query) return true
      const text = [
        ...Object.values(item.tx),
        item.amount,
        formatVND(item.amount),
        item.accountLabel,
        item.accountNumber,
        item.roomName,
        item.tenantName,
        item.tenantPhone,
        item.invoiceTitle,
        item.periodText,
        item.transferCode,
        item.title,
        item.detail,
        formatSepayTransactionTime(item.tx.transaction_date).full
      ].join(' ')
      return (
        text.toLocaleLowerCase('vi-VN').includes(query) ||
        Boolean(normalized && normalizeSearch(text).includes(normalized))
      )
    })
  }, [diagnostics, search])

  const groups = [
    {
      label: 'Chưa xem',
      seen: false,
      items: filtered.filter((item) => !readSet.has(sepayReadKey(item.tx)))
    },
    {
      label: 'Đã xem',
      seen: true,
      items: filtered.filter((item) => readSet.has(sepayReadKey(item.tx)))
    }
  ]
  const visibleCount = groups.reduce(
    (total, group) => total + Math.min(group.items.length, search.trim() ? Infinity : limit),
    0
  )

  const markRead = (item: SepayDiagnostic): void => {
    const key = sepayReadKey(item.tx)
    if (!key) return
    const result = saveSepayReadKey(userId, key, readKeys)
    setReadKeys(result.keys)
    setStorageWarning(!result.persisted)
  }

  return (
    <section className="sepay-history space-y-2.5 text-left" aria-label="Lịch sử giao dịch SePay">
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        <label
          htmlFor="sepay-transaction-search"
          className="mb-2 block text-xs font-bold uppercase tracking-wide text-blue-700"
        >
          Tìm giao dịch SePay
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 focus-within:ring-2 focus-within:ring-blue-100">
          <i className="fa-solid fa-magnifying-glass text-sm text-blue-500" aria-hidden="true" />
          <input
            id="sepay-transaction-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setLimit(5)
            }}
            placeholder="Tìm mã giao dịch, phòng hoặc khách thuê…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Xóa nội dung tìm kiếm"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-blue-600">
          {search.trim()
            ? `Tìm thấy ${filtered.length} giao dịch trong ${diagnostics.length} giao dịch đã tải.`
            : `Đang hiển thị ${visibleCount} / ${diagnostics.length} giao dịch đã tải.`}
        </p>
      </div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">
        {search.trim() ? 'Kết quả tìm kiếm' : 'Giao dịch SePay gần nhất'}
      </h3>
      {storageWarning && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Đã đánh dấu trong lần mở này, nhưng trình duyệt chưa lưu được trạng thái trên thiết bị.
        </p>
      )}
      {groups.map((group) => (
        <section
          key={group.label}
          aria-label={group.label}
          className={group.seen ? 'border-t border-slate-200 pt-4' : ''}
        >
          <div className="mb-2 flex items-center gap-2">
            <i
              className={`fa-solid ${group.seen ? 'fa-circle-check text-slate-400' : 'fa-circle text-blue-500'} text-xs`}
              aria-hidden="true"
            />
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
              {group.label}
            </h4>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-600">
              {group.items.length}
            </span>
          </div>
          <div className="space-y-3">
            {group.items.slice(0, search.trim() ? undefined : limit).map((item) => {
              const { tx } = item
              const key = sepayReadKey(tx)
              const timestamp = formatSepayTransactionTime(tx.transaction_date)
              const txKey = tx.reference_number || tx.id
              return (
                <article
                  key={key}
                  data-sepay-seen={group.seen}
                  className={`rounded-xl border px-3 py-2 ${
                    group.seen
                      ? 'border-slate-200 bg-white text-slate-600'
                      : 'border-emerald-200 bg-emerald-50/70 text-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                        {!group.seen && (
                          <i
                            className="fa-solid fa-circle text-[8px] text-blue-500"
                            aria-label="Chưa xem"
                          />
                        )}
                        {item.roomName && (
                          <span className="rounded-lg border border-emerald-100 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {item.roomName}
                          </span>
                        )}
                        {item.tenantName && (
                          <span
                            className={
                              group.seen
                                ? 'text-sm font-semibold text-slate-600'
                                : 'text-sm font-bold text-slate-900'
                            }
                          >
                            {item.tenantName}
                          </span>
                        )}
                        {item.tenantPhone && (
                          <span className="text-xs text-slate-500">{item.tenantPhone}</span>
                        )}
                        <span
                          className={`text-sm tabular-nums ${group.seen ? 'font-semibold text-slate-600' : 'font-bold text-slate-900'}`}
                        >
                          {formatVND(item.amount)} đ
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.status === 'ok'
                              ? 'bg-emerald-600 text-white'
                              : item.status === 'warn'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="break-all text-xs text-slate-500">
                          Mã giao dịch: {tx.reference_number || tx.id}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] tabular-nums leading-5 text-slate-500">
                      <div>{timestamp.date}</div>
                      <div>{timestamp.time}</div>
                    </div>
                  </div>
                  {(item.invoiceTitle || item.periodText) && (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5">
                      {item.invoiceTitle && (
                        <span>
                          Hóa đơn:{' '}
                          <span
                            className={group.seen ? 'font-medium' : 'font-semibold text-slate-800'}
                          >
                            {item.invoiceTitle}
                          </span>
                        </span>
                      )}
                      {item.periodText && <span>Kỳ thu: {item.periodText}</span>}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-3">
                      <p className="min-w-0 break-words text-xs leading-4 text-slate-500">
                        Ngân hàng: {item.accountLabel}
                        {item.accountNumber && <> · STK: {item.accountNumber}</>}
                      </p>
                      <details className="min-w-0 max-w-full text-[11px] leading-4 text-slate-500 open:basis-full">
                        <summary className="cursor-pointer rounded leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                          Chi tiết giao dịch
                        </summary>
                        <p className="mt-1 break-all font-mono leading-5">
                          {tx.transaction_content || 'Không có nội dung chuyển khoản'}
                        </p>
                        <p className="mt-1 leading-5">{item.detail}</p>
                        {typeof item.remaining === 'number' && (
                          <p className="mt-1">Còn thu: {formatVND(item.remaining)} đ</p>
                        )}
                        {item.transferCode && (
                          <p className="mt-1 break-all">
                            Mã CK: <span className="font-mono">{item.transferCode}</span>
                          </p>
                        )}
                      </details>
                    </div>
                    {!group.seen && (
                      <button
                        type="button"
                        onClick={() => markRead(item)}
                        aria-label={`Đánh dấu đã xem giao dịch ${tx.reference_number || tx.id}`}
                        className="min-h-9 sm:min-h-7 rounded-lg px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        Đã xem
                      </button>
                    )}
                  </div>
                  {item.status !== 'ok' && (
                    <div className="mt-2 space-y-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-5 text-amber-900">
                      <p>{item.detail}</p>
                      {typeof item.remaining === 'number' && (
                        <p>
                          Còn thu: <strong>{formatVND(item.remaining)} đ</strong>
                        </p>
                      )}
                      {item.transferCode && (
                        <p className="break-all">
                          Mã CK: <span className="font-mono">{item.transferCode}</span>
                        </p>
                      )}
                      {item.suggestionInvoiceId && onApproveSuggestion && (
                        <button type="button"
                          onClick={() => onApproveSuggestion(tx, item.suggestionInvoiceId!)}
                          disabled={actionPending || processingKeys.includes(txKey)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                          {processingKeys.includes(txKey) ? 'Đang duyệt…' : `Duyệt ghép với ${item.roomName || 'hóa đơn'}`}
                        </button>
                      )}
                      {(item.canRecordBank === true || item.canRecordBank === undefined) && <button
                        type="button"
                        onClick={() => onRecord(tx)}
                        disabled={actionPending || processingKeys.includes(txKey) || recordedKeys.includes(txKey)}
                        className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {recordedKeys.includes(txKey) ? 'Đã ghi sổ ngân hàng' : 'Ghi vào sổ ngân hàng'}
                      </button>}
                    </div>
                  )}
                </article>
              )
            })}
            {group.items.length === 0 && (
              <p className="py-1 text-xs text-slate-500">
                {search.trim()
                  ? 'Không có giao dịch phù hợp.'
                  : group.seen
                    ? 'Chưa có giao dịch đã xem.'
                    : 'Bạn đã xem hết giao dịch đã tải.'}
              </p>
            )}
          </div>
          {!search.trim() && group.items.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((value) => value + 5)}
              className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              Xem thêm {group.seen ? 'giao dịch đã xem' : 'giao dịch chưa xem'}
            </button>
          )}
        </section>
      ))}
    </section>
  )
}
