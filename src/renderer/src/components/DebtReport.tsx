import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

type DebtSummary = { totalDebt: number; paid: number; offset: number }
type EditableKey = 'totalDebt' | 'paid' | 'offset'
type DebtChangeMode = 'opening' | 'increase' | 'decrease'

export type DebtEntry = {
  id: string
  type: EditableKey
  amount: number
  reason: string
  createdAt: string
}

type PendingDebtChange = {
  amount: number
  reason: string
  mode: DebtChangeMode
}

const reasonOptions: Record<EditableKey, string[]> = {
  totalDebt: ['Nghĩa vụ ban đầu', 'Nợ chuyển từ kỳ trước'],
  paid: ['Trả nợ hàng tháng', 'Thanh toán bổ sung'],
  offset: ['Tiền kho', 'Tiền điện', 'Tiền nước']
}

const storageKey = 'an-khang-debt-summary'
const entriesStorageKey = 'an-khang-debt-entries'

const fmt = (value: number): string => new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))
const formatBalance = (value: number): string => value < 0 ? `Dư ${fmt(Math.abs(value))} đ` : `${fmt(value)} đ`
const formatAmountInput = (value: string | number): string => {
  const digits = String(value).replace(/\D/g, '')
  return digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : ''
}

const formatDateDisplay = (value: string): string => {
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}`
  } catch {
    return value
  }
}

const transactionLabel = (entry: DebtEntry): string => {
  if (entry.type === 'totalDebt') return entry.amount < 0 ? 'Điều chỉnh giảm nợ An Khang' : 'Khoản nợ ban đầu'
  if (entry.type === 'paid') return 'An Khang trả nợ'
  if (entry.reason === 'Tiền kho' || entry.reason === 'Trả tiền kho') return 'Tiền kho'
  if (entry.reason === 'Tiền điện' || entry.reason === 'Trả tiền điện') return 'Tiền điện'
  if (entry.reason === 'Tiền nước' || entry.reason === 'Trả tiền nước') return 'Tiền nước'
  return entry.reason || 'Đối tác nợ An Khang'
}

const isImportedBusinessEntry = (entry: Partial<DebtEntry>): boolean =>
  String(entry.id || '').startsWith('invoice-') || String(entry.reason || '').startsWith('Tự động thu qua SePay')

const summarizeEntries = (entries: DebtEntry[]): DebtSummary =>
  entries.reduce(
    (summary, entry) => ({
      ...summary,
      [entry.type]: summary[entry.type] + entry.amount
    }),
    { totalDebt: 0, paid: 0, offset: 0 }
  )

const readStoredEntries = (): DebtEntry[] => {
  if (typeof window === 'undefined') return []
  try {
    const stored = JSON.parse(window.localStorage.getItem(entriesStorageKey) || '[]')
    return Array.isArray(stored) ? stored.filter((entry) => !isImportedBusinessEntry(entry)) : []
  } catch {
    return []
  }
}

export function DebtReport({
  summary = { totalDebt: 0, paid: 0, offset: 0 },
  isAdmin = false
}: {
  summary?: DebtSummary
  isAdmin?: boolean
}): ReactElement {
  const [storedEntries] = useState<DebtEntry[]>(readStoredEntries)
  const hasStoredHistory = storedEntries.length > 0
  const [entries, setEntries] = useState<DebtEntry[]>(storedEntries)
  const localEditRef = useRef(hasStoredHistory)
  const [values, setValues] = useState<DebtSummary>(() => hasStoredHistory ? summarizeEntries(storedEntries) : summary)
  const [editing, setEditing] = useState<EditableKey | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [isCustomReason, setIsCustomReason] = useState(false)
  const [expanded, setExpanded] = useState<EditableKey[]>(['offset'])
  const [pendingDelete, setPendingDelete] = useState<DebtEntry | null>(null)
  const [debtAdjustmentMode, setDebtAdjustmentMode] = useState<'increase' | 'decrease' | null>(null)
  const [pendingDebtChange, setPendingDebtChange] = useState<PendingDebtChange | null>(null)
  const [isOpeningSetup, setIsOpeningSetup] = useState(false)

  useEffect(() => {
    if (!localEditRef.current) setValues(summary)
  }, [summary])

  useEffect(() => {
    if (entries.length > 0) return
    localEditRef.current = false
    setValues(summary)
  }, [entries.length, summary])

  useEffect(() => {
    if (localEditRef.current) window.localStorage.setItem(storageKey, JSON.stringify(values))
  }, [values])

  useEffect(() => {
    if (localEditRef.current) window.localStorage.setItem(entriesStorageKey, JSON.stringify(entries))
  }, [entries])

  // Keep the signed balance so an overpayment can be shown as a surplus.
  const remaining = values.totalDebt - values.paid - values.offset
  const baseTotal = values.totalDebt || 1
  const totalSettled = values.paid + values.offset
  const hasLockedOpeningDebt = entries.some((entry) => entry.type === 'totalDebt' && entry.amount > 0)
  const pendingDebtResult = pendingDebtChange
    ? pendingDebtChange.mode === 'opening'
      ? pendingDebtChange.amount
      : values.totalDebt + (pendingDebtChange.mode === 'decrease' ? -pendingDebtChange.amount : pendingDebtChange.amount)
    : null
  const pendingDebtInvalid = pendingDebtResult !== null && pendingDebtResult < 0
  const recoveryRate =
    values.totalDebt > 0
      ? Math.min(100, Math.round((totalSettled / values.totalDebt) * 100))
      : 100

  const toggleExpanded = (key: EditableKey) => {
    setExpanded((curr) =>
      curr.includes(key) ? curr.filter((k) => k !== key) : [...curr, key]
    )
  }

  const openEditor = (key: EditableKey) => {
    setEditing(key)
    setEditingEntryId(null)
    setAmount('')
    if (key === 'offset') {
      setReason('')
    } else {
      setReason(reasonOptions[key][0] || '')
    }
    setIsCustomReason(false)
    setDebtAdjustmentMode(null)
    setIsOpeningSetup(false)
  }

  const openDebtAdjustment = () => {
    if (!isAdmin || values.totalDebt <= 0) return
    setEditing('totalDebt')
    setEditingEntryId(null)
    setDebtAdjustmentMode('increase')
    setAmount('')
    setReason('')
    setIsCustomReason(true)
  }

  const openOpeningDebtSetup = () => {
    if (!isAdmin || hasLockedOpeningDebt) return
    setEditing('totalDebt')
    setEditingEntryId(null)
    setDebtAdjustmentMode(null)
    setIsOpeningSetup(true)
    setAmount('')
    setReason('Nợ gốc ban đầu')
    setIsCustomReason(true)
  }

  const openEntryEditor = (entry: DebtEntry) => {
    if (!isAdmin || entry.type === 'totalDebt') return
    setEditing(entry.type)
    setEditingEntryId(entry.id)
    setAmount(formatAmountInput(entry.amount))
    const presets = reasonOptions[entry.type] || []
    const isPreset = presets.includes(entry.reason)
    setReason(entry.reason || (entry.type === 'offset' ? '' : presets[0] || ''))
    setIsCustomReason(!isPreset && Boolean(entry.reason))
    setIsOpeningSetup(false)
  }

  const addQuickAmount = (val: number) => {
    const currentNum = Number(amount.replace(/\D/g, '')) || 0
    setAmount(formatAmountInput(currentNum + val))
  }

  const removeEntry = (entry: DebtEntry) => {
    if (!isAdmin || entry.type === 'totalDebt') return
    setPendingDelete(entry)
  }

  const confirmRemoveEntry = () => {
    if (!pendingDelete || pendingDelete.type === 'totalDebt') return
    const entry = pendingDelete
    localEditRef.current = true
    setEntries((current) => current.filter((item) => item.id !== entry.id))
    setValues((current) => ({
      ...current,
      [entry.type]: Math.max(0, current[entry.type] - entry.amount)
    }))
    setPendingDelete(null)
  }

  const confirmDebtChange = () => {
    if (!pendingDebtChange) return
    const signedAmount = pendingDebtChange.mode === 'decrease' ? -pendingDebtChange.amount : pendingDebtChange.amount
    const nextTotal = pendingDebtChange.mode === 'opening'
      ? pendingDebtChange.amount
      : values.totalDebt + signedAmount
    if (nextTotal < 0) return

    localEditRef.current = true
    setEntries((current) => [
      {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        type: 'totalDebt',
        amount: pendingDebtChange.mode === 'opening' ? pendingDebtChange.amount : signedAmount,
        reason: pendingDebtChange.reason,
        createdAt: new Date().toISOString()
      },
      ...current
    ])
    setValues((current) => ({ ...current, totalDebt: nextTotal }))
    setPendingDebtChange(null)
    setDebtAdjustmentMode(null)
    setIsOpeningSetup(false)
    setEditing(null)
    setAmount('')
    setReason('')
  }

  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedAmount = amount.trim().replace(/[.\s,]/g, '')
    const parsed = Number(normalizedAmount)
    if (
      !editing ||
      !/^\d+$/.test(normalizedAmount) ||
      !Number.isSafeInteger(parsed) ||
      parsed <= 0 ||
      !reason.trim()
    )
      return

    if (editing === 'totalDebt' && !editingEntryId) {
      const mode: DebtChangeMode = isOpeningSetup ? 'opening' : values.totalDebt > 0 ? debtAdjustmentMode || 'increase' : 'opening'
      if (values.totalDebt > 0 && !debtAdjustmentMode && !isOpeningSetup) return
      setPendingDebtChange({ amount: parsed, reason: reason.trim(), mode })
      return
    }

    localEditRef.current = true
    if (editingEntryId) {
      const previous = entries.find((entry) => entry.id === editingEntryId)
      setEntries((current) =>
        current.map((entry) =>
          entry.id === editingEntryId
            ? { ...entry, type: editing, amount: parsed, reason: reason.trim() }
            : entry
        )
      )
      if (previous) {
        setValues((current) => {
          const next = { ...current }
          next[previous.type] = Math.max(0, next[previous.type] - previous.amount)
          next[editing] += parsed
          return next
        })
      }
    } else {
      setEntries((current) => [
        {
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
          type: editing,
          amount: parsed,
          reason: reason.trim(),
          createdAt: new Date().toISOString()
        },
        ...current
      ])
      setValues((current) => ({ ...current, [editing]: current[editing] + parsed }))
    }
    setEditing(null)
    setEditingEntryId(null)
    setAmount('')
    setReason('')
  }

  const editorTitle = isOpeningSetup
    ? 'Thiết lập nợ gốc ban đầu'
    : editingEntryId
      ? 'Chỉnh sửa giao dịch công nợ'
      : 'Thêm giao dịch công nợ'

  // Sections configuration for tree view
  const sections = [
    {
      key: 'totalDebt' as EditableKey,
      letter: 'A',
      label: 'A. AN KHANG HOME NỢ',
      value: values.totalDebt,
      pct: values.totalDebt > 0 ? '100.0%' : '0.0%',
      pctTone: 'text-emerald-700 font-bold',
      tone: 'text-slate-900',
      note: 'Nghĩa vụ nợ ban đầu'
    },
    {
      key: 'paid' as EditableKey,
      letter: 'B',
      label: 'B. AN KHANG HOME ĐÃ TRẢ NỢ',
      value: values.paid,
      pct: values.totalDebt > 0 ? `${((values.paid / baseTotal) * 100).toFixed(1)}%` : '0.0%',
      pctTone: 'text-emerald-700 font-bold',
      tone: 'text-emerald-700',
      note: 'Tiền thực tế đã chuyển'
    },
    {
      key: 'offset' as EditableKey,
      letter: 'C',
      label: 'C. ĐỐI TÁC NỢ AN KHANG',
      value: values.offset,
      pct: values.totalDebt > 0 ? `${((values.offset / baseTotal) * 100).toFixed(1)}%` : '0.0%',
      pctTone: 'text-amber-700 font-bold',
      tone: 'text-amber-700',
      note: 'Khoản cấn trừ nợ (họ nợ lại)'
    }
  ]

  const remainingPct = values.totalDebt > 0
    ? remaining < 0
      ? `Dư ${((Math.abs(remaining) / baseTotal) * 100).toFixed(1)}%`
      : `${((remaining / baseTotal) * 100).toFixed(1)}%`
    : '0.0%'
  const remainingLabel = formatBalance(remaining)

  // Xây dựng chuỗi dữ liệu tăng trưởng / biến động công nợ theo thời gian
  const trendData = useMemo(() => {
    if (entries.length === 0) {
      return [
        { date: 'Khởi tạo', debt: values.totalDebt, settled: 0, remaining: values.totalDebt },
        { date: 'Hiện tại', debt: values.totalDebt, settled: totalSettled, remaining: remaining }
      ]
    }

    const sorted = [...entries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    let curDebt = entries.some((entry) => entry.type === 'totalDebt') ? 0 : values.totalDebt
    let curSettled = 0

    const list = sorted.map((entry) => {
      if (entry.type === 'totalDebt') curDebt += entry.amount
      else curSettled += entry.amount

      const rem = curDebt - curSettled
      const d = new Date(entry.createdAt)
      const dateLabel = `${d.getDate()}/${d.getMonth() + 1}`

      return {
        date: dateLabel,
        debt: curDebt,
        settled: curSettled,
        remaining: rem,
        note: entry.reason || transactionLabel(entry)
      }
    })

    if (list.length === 1) {
      return [
        { date: 'Ban đầu', debt: values.totalDebt, settled: 0, remaining: values.totalDebt, note: 'Khởi tạo' },
        ...list
      ]
    }

    return list
  }, [entries, values.totalDebt, totalSettled, remaining])

  return (
    <div className="mb-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-4">
      {/* CỘT TRÁI (75% - 3 PHẦN): BẢNG "CHI TIẾT THEO KHOẢN" MỞ RỘNG XEM LỊCH SỬ TRỰC TIẾP */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(25,50,74,0.04)] lg:col-span-3">
        {/* Header style Báo cáo tài chính */}
        <div className="flex flex-col justify-between gap-1 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-baseline">
          <div>
            <h2 className="text-[17px] font-black text-slate-900">Chi tiết theo khoản</h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              Bấm vào mũi tên hoặc hạng mục để mở rộng / thu gọn lịch sử giao dịch
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-slate-400">
            <i className="fa-solid fa-chart-column text-slate-400" aria-hidden="true"></i>
            Dữ liệu theo kỳ đã chọn
          </span>
        </div>

        {/* Bảng báo cáo theo chuẩn tài chính (Statement Tree Table) */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            {/* Header cột */}
            <thead className="border-b border-slate-100 bg-slate-50/60 text-[12px] font-semibold text-slate-500">
              <tr>
                <th className="w-[44%] px-6 py-3">Hạng mục</th>
                <th className="w-[20%] px-4 py-3 text-right">Số tiền</th>
                <th className="w-[14%] px-4 py-3 text-right">% Nợ</th>
                <th className="px-5 py-3 text-right">Lý do</th>
              </tr>
            </thead>

            {/* Thân bảng */}
            <tbody className="divide-y divide-slate-100">
              {sections.map((sec) => {
                const isSecExpanded = expanded.includes(sec.key)
                const catEntries = entries.filter((entry) => entry.type === sec.key)

                return (
                  <Fragment key={sec.key}>
                    {/* Dòng hạng mục chính (Mẹ) */}
                    <tr
                      onClick={() => toggleExpanded(sec.key)}
                      className="cursor-pointer bg-white transition-colors hover:bg-slate-50/80 select-none"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpanded(sec.key)
                            }}
                            className="text-slate-500 hover:text-slate-800"
                            aria-label={`Mở rộng ${sec.label}`}
                          >
                            <i
                              className={`fa-solid fa-caret-${isSecExpanded ? 'down' : 'right'} text-[13px] transition-transform`}
                              aria-hidden="true"
                            />
                          </button>
                          <span className={`font-black tracking-wide ${sec.tone}`}>
                            {sec.label}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-3.5 text-right font-black tabular-nums ${sec.tone}`}>
                        {fmt(sec.value)} đ
                      </td>
                      <td className={`px-4 py-3.5 text-right font-bold tabular-nums ${sec.pctTone}`}>
                        {sec.pct}
                      </td>
                      <td className="px-5 py-3.5 text-right text-[12px] text-slate-400">
                        <span>{sec.note}</span>
                        {sec.key === 'totalDebt' && isAdmin && (!hasLockedOpeningDebt || values.totalDebt > 0) && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              hasLockedOpeningDebt ? openDebtAdjustment() : openOpeningDebtSetup()
                            }}
                            className="ml-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700 transition hover:bg-sky-100"
                          >
                            {hasLockedOpeningDebt ? 'Điều chỉnh' : 'Thiết lập nợ gốc'}
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Các dòng con mở rộng ra trực tiếp khi bấm (Tree view items) */}
                    {isSecExpanded && (
                      <>
                        {catEntries.length === 0 ? (
                          <tr className="bg-slate-50/30 text-[12px] italic text-slate-400">
                            <td colSpan={4} className="py-2.5 pl-12 pr-6">
                              <span className="mr-2 font-normal text-slate-300">↳</span>
                              Chưa có giao dịch phát sinh.
                            </td>
                          </tr>
                        ) : (
                          catEntries.map((entry) => {
                            const entryPct =
                              values.totalDebt > 0
                                ? `${((entry.amount / baseTotal) * 100).toFixed(1)}%`
                                : '—'

                            return (
                              <tr
                                key={entry.id}
                                onClick={() => isAdmin && entry.type !== 'totalDebt' && openEntryEditor(entry)}
                                className={`group border-t border-slate-50 bg-slate-50/40 text-[12.5px] transition-colors hover:bg-slate-100/60 ${
                                  isAdmin && entry.type !== 'totalDebt' ? 'cursor-pointer' : ''
                                }`}
                                title={isAdmin && entry.type !== 'totalDebt' ? 'Nhấp để chỉnh sửa giao dịch này' : 'Nợ gốc được khóa'}
                              >
                                <td className="py-2.5 pl-12 pr-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-normal text-slate-400">↳</span>
                                    <span className="font-semibold text-slate-600 text-[12px] whitespace-nowrap">
                                      {formatDateDisplay(entry.createdAt)}
                                    </span>
                                  </div>
                                </td>
                                <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${sec.tone}`}>
                                  <span className="border-b border-dotted border-slate-300">
                                    {fmt(entry.amount)} đ
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-500">
                                  {entryPct}
                                </td>
                                <td className="px-5 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <span className="text-[12px] font-medium text-slate-700">
                                      {entry.reason || transactionLabel(entry)}
                                    </span>
                                    {entry.type === 'totalDebt' ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400" title="Nợ gốc được khóa, không thể sửa hoặc xóa">
                                        <i className="fa-solid fa-lock text-[10px]" /> Khóa
                                      </span>
                                    ) : isAdmin && (
                                      <div className="inline-flex items-center gap-1.5 opacity-30 transition-opacity group-hover:opacity-100">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            openEntryEditor(entry)
                                          }}
                                          className="text-slate-400 hover:text-sky-600 transition-colors"
                                          title="Sửa"
                                          aria-label="Sửa"
                                        >
                                          <i className="fa-solid fa-pen-to-square text-[10.5px]" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            removeEntry(entry)
                                          }}
                                          className="text-slate-400 hover:text-rose-600 transition-colors"
                                          title="Xóa"
                                          aria-label="Xóa"
                                        >
                                          <i className="fa-solid fa-trash-can text-[10.5px]" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </>
                    )}
                  </Fragment>
                )
              })}

              {/* Dòng tổng kết cuối cùng: D. AN KHANG HOME CÒN NỢ (A - B - C) */}
              <tr className="border-t-2 border-b-2 border-slate-800 bg-[#e9fbf6] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-black tracking-wide text-emerald-900">
                      D. AN KHANG HOME CÒN NỢ (A – B – C)
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right text-[16px] font-black tabular-nums text-emerald-900">
                  {remainingLabel}
                </td>
                <td className="px-4 py-4 text-right text-[13px] font-black tabular-nums text-emerald-800">
                  {remainingPct}
                </td>
                <td className="px-5 py-4 text-right text-[12px] font-bold text-emerald-700">
                  {remaining < 0 ? 'Đang dư' : remaining === 0 ? 'Đã tất toán' : 'Còn phải trả'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* CỘT PHẢI (25% - 1 PHẦN): BIỂU ĐỒ TĂNG TRƯỞNG & BIẾN ĐỘNG SỐ DƯ NỢ */}
      <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(25,50,74,0.04)] lg:col-span-1">
        {/* Header cột biểu đồ */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-black text-[#132e62]">Tăng trưởng nợ</h2>
          </div>
          <button
            type="button"
            onClick={() => (hasLockedOpeningDebt ? openEditor('paid') : openOpeningDebtSetup())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0faf7a] px-2.5 py-1.5 text-[11px] font-black text-white shadow-sm transition hover:bg-[#0a9668]"
          >
            <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
            {hasLockedOpeningDebt ? 'Thêm GD' : 'Thiết lập nợ gốc'}
          </button>
        </div>

        {/* Chỉ số tóm tắt trên đầu biểu đồ */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/50 p-3 text-[11.5px]">
          <div>
            <span className="block text-[10.5px] font-semibold text-slate-400">{remaining < 0 ? 'An Khang đang dư' : 'An Khang còn nợ'}</span>
            <span className={`text-[14px] font-black tabular-nums ${remaining > 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
              {remainingLabel}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10.5px] font-semibold text-slate-400">Đã trả & cấn trừ</span>
            <span className="text-[14px] font-black tabular-nums text-emerald-700">
              {recoveryRate}%
            </span>
          </div>
        </div>

        {/* Biểu đồ AreaChart tăng trưởng số nợ theo thời gian */}
        <div className="p-3">
          <div className="h-[185px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  {/* Gradient cho đường nợ còn lại */}
                  <linearGradient id="remainingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  {/* Gradient cho đường đã thanh toán */}
                  <linearGradient id="settledGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0faf7a" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0faf7a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                  tickFormatter={(val) => {
                    const num = Number(val)
                    if (num >= 1_000_000) return `${Math.round(num / 1_000_000)}M`
                    if (num >= 1_000) return `${Math.round(num / 1_000)}k`
                    return `${num}`
                  }}
                />
                <Tooltip
                  formatter={(val: unknown, name: unknown) => [
                    formatBalance(Number(val) || 0),
                    name === 'remaining' ? 'Còn phải trả' : name === 'settled' ? 'Đã trả & cấn trừ' : 'An Khang nợ'
                  ]}
                  labelFormatter={(lbl) => `Thời điểm: ${lbl}`}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '11px',
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.08)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="remaining"
                  name="remaining"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#remainingGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="settled"
                  name="settled"
                  stroke="#0faf7a"
                  strokeWidth={2}
                  fill="url(#settledGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chú giải đường & Tiến độ thu hồi nợ */}
        <div className="border-t border-slate-100 bg-slate-50/50 p-3 text-[11px]">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-[#2563eb]" />
              <span className="font-semibold text-slate-600">Còn phải trả</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-[#0faf7a]" />
              <span className="font-semibold text-slate-600">Đã trả & cấn trừ</span>
            </div>
          </div>

          {/* Thanh tiến độ thu hồi */}
          <div className="mt-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[#0faf7a] transition-all duration-500"
                style={{ width: `${recoveryRate}%` }}
              />
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-slate-500">
            <span>Tổng nợ phát sinh:</span>
            <strong className="text-slate-800">{fmt(values.totalDebt)} đ</strong>
          </div>
          <div className="mt-1 flex items-center justify-between text-slate-500">
            <span>Đã thanh lý & cấn trừ:</span>
            <strong className="text-emerald-700">{fmt(totalSettled)} đ</strong>
          </div>
        </div>
      </section>

      {/* Modal xác nhận điều chỉnh tổng nợ */}
      {pendingDebtChange && (
        <div
          className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={() => setPendingDebtChange(null)}
        >
          <div
            className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <i className="fa-solid fa-shield-halved" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-black text-[#17345f]">
                  {pendingDebtChange.mode === 'opening' ? 'Xác nhận ghi nhận tổng nợ' : 'Xác nhận điều chỉnh tổng nợ'}
                </h3>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">
                  {pendingDebtChange.mode === 'opening'
                    ? 'Sau khi xác nhận, bản ghi nợ gốc sẽ được khóa và không thể sửa hoặc xóa.'
                    : 'Hệ thống sẽ giữ nguyên bản ghi cũ và thêm một dòng điều chỉnh mới vào lịch sử.'}
                </p>
              </div>
              <button type="button" onClick={() => setPendingDebtChange(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Đóng"><i className="fa-solid fa-xmark" /></button>
            </div>
            <div className="space-y-2 bg-slate-50/70 px-5 py-4 text-[12px]">
              <div className="flex justify-between text-slate-500"><span>Tổng nợ hiện tại</span><strong className="text-slate-800">{fmt(values.totalDebt)} đ</strong></div>
              <div className="flex justify-between text-slate-500"><span>{pendingDebtChange.mode === 'opening' ? 'Mức nợ gốc thiết lập' : pendingDebtChange.mode === 'decrease' ? 'Giảm' : 'Tăng'}</span><strong className={pendingDebtChange.mode === 'decrease' ? 'text-amber-700' : 'text-emerald-700'}>{pendingDebtChange.mode === 'opening' ? fmt(pendingDebtChange.amount) : `${pendingDebtChange.mode === 'decrease' ? '-' : '+'}${fmt(pendingDebtChange.amount)}`} đ</strong></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-black text-slate-800"><span>Tổng nợ sau xác nhận</span><strong>{fmt(pendingDebtResult || 0)} đ</strong></div>
              <p className="pt-1 text-slate-600"><span className="font-semibold">Lý do:</span> {pendingDebtChange.reason}</p>
            </div>
            {pendingDebtInvalid && <p className="px-5 pt-3 text-[12px] font-semibold text-rose-600">Tổng nợ không thể nhỏ hơn 0 đ.</p>}
            <div className="flex justify-end gap-2 px-5 py-4">
              <button type="button" onClick={() => setPendingDebtChange(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
              <button type="button" disabled={pendingDebtInvalid} onClick={confirmDebtChange} className="rounded-xl bg-sky-700 px-4 py-2.5 text-[12px] font-black text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">Xác nhận</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <i className="fa-solid fa-trash-can" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-black text-[#17345f]">Xóa giao dịch?</h3>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">
                  Giao dịch này sẽ bị xóa khỏi lịch sử và số dư công nợ sẽ được cập nhật.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Đóng"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="bg-slate-50/70 px-5 py-3 text-[12px] text-slate-600">
              <span className="font-semibold">{fmt(pendingDelete.amount)} đ</span>
              <span className="mx-2 text-slate-300">•</span>
              {pendingDelete.reason || 'Không có lý do'}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmRemoveEntry}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-[12px] font-black text-white shadow-sm transition hover:bg-rose-700"
              >
                Xóa giao dịch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm / Sửa giao dịch */}
      {editing && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={() => {
            setEditing(null)
            setEditingEntryId(null)
            setDebtAdjustmentMode(null)
            setIsOpeningSetup(false)
          }}
        >
          <form
            onSubmit={submitEditor}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-[540px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    editing === 'totalDebt'
                      ? 'border-sky-100 bg-sky-50 text-sky-600'
                      : editing === 'paid'
                        ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                        : 'border-amber-100 bg-amber-50 text-amber-600'
                  }`}
                >
                  <i
                    className={`fa-solid ${
                      editingEntryId
                        ? 'fa-pen-to-square'
                        : editing === 'totalDebt'
                          ? 'fa-file-invoice-dollar'
                          : editing === 'paid'
                            ? 'fa-circle-check'
                            : 'fa-scale-balanced'
                    } text-base`}
                  />
                </div>
                <div>
                  <h3 className="text-[16px] font-black text-[#17345f]">{editorTitle}</h3>
                  <p className="text-[12px] text-slate-400">
                    {editing === 'totalDebt' && (debtAdjustmentMode ? 'Điều chỉnh nợ của An Khang bằng một bút toán mới' : 'Ghi nhận nghĩa vụ nợ của An Khang Home')}
                    {editing === 'paid' && 'Ghi nhận số tiền An Khang Home đã thanh toán trả nợ'}
                    {editing === 'offset' && 'Ghi nhận khoản đối tác nợ An Khang để cấn trừ nợ'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setEditingEntryId(null)
                  setDebtAdjustmentMode(null)
                  setIsOpeningSetup(false)
                }}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Đóng"
              >
                <i className="fa-solid fa-xmark text-base" />
              </button>
            </div>

            <div className="px-6 py-5">
              {/* Loại giao dịch: Segmented cards */}
              <div className="mb-4">
                <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-400">
                  Loại giao dịch
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      key: 'totalDebt' as EditableKey,
                      label: 'A. An Khang Home nợ',
                      sub: 'Tăng nợ',
                      activeStyle: 'border-sky-500 bg-sky-50/70 text-sky-950 ring-2 ring-sky-500/20',
                      dot: 'bg-sky-500'
                    },
                    {
                      key: 'paid' as EditableKey,
                      label: 'B. An Khang đã trả nợ',
                      sub: 'Đã thanh toán',
                      activeStyle: 'border-emerald-500 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-500/20',
                      dot: 'bg-emerald-500'
                    },
                    {
                      key: 'offset' as EditableKey,
                      label: 'C. Đối tác nợ An Khang',
                      sub: 'Cấn trừ nợ',
                      activeStyle: 'border-amber-500 bg-amber-50/70 text-amber-950 ring-2 ring-amber-500/20',
                      dot: 'bg-amber-500'
                    }
                  ].map((item) => {
                    const isCurrent = editing === item.key
                    const isLockedDebt = item.key === 'totalDebt' && values.totalDebt > 0 && !debtAdjustmentMode && !isOpeningSetup
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={isLockedDebt}
                        onClick={() => {
                          if (isLockedDebt) return
                          setEditing(item.key)
                          if (!editingEntryId) {
                            if (item.key === 'offset') {
                              setReason('')
                            } else {
                              setReason(reasonOptions[item.key][0] || '')
                            }
                            setIsCustomReason(false)
                          }
                        }}
                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                          isCurrent
                            ? `${item.activeStyle} shadow-xs`
                            : isLockedDebt
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100/70 text-slate-400 opacity-70'
                              : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:border-slate-300 hover:bg-slate-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${isCurrent ? item.dot : 'bg-slate-300'}`}
                          />
                          <span className="text-[12px] font-black leading-tight">{item.label}</span>
                        </div>
                        <span
                          className={`mt-1 text-[11px] font-medium leading-tight ${
                            isCurrent ? 'text-slate-600' : 'text-slate-400'
                          }`}
                        >
                          {item.sub}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {editing === 'totalDebt' && debtAdjustmentMode && (
                <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                  <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-sky-800">Hướng điều chỉnh</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDebtAdjustmentMode('increase')}
                      className={`rounded-lg border px-3 py-2 text-left text-[12px] font-bold transition ${debtAdjustmentMode === 'increase' ? 'border-emerald-400 bg-white text-emerald-700 shadow-sm' : 'border-slate-200 bg-white/60 text-slate-500'}`}
                    >
                      <i className="fa-solid fa-arrow-trend-up mr-1.5" />Tăng tổng nợ
                    </button>
                    <button
                      type="button"
                      onClick={() => setDebtAdjustmentMode('decrease')}
                      className={`rounded-lg border px-3 py-2 text-left text-[12px] font-bold transition ${debtAdjustmentMode === 'decrease' ? 'border-amber-400 bg-white text-amber-700 shadow-sm' : 'border-slate-200 bg-white/60 text-slate-500'}`}
                    >
                      <i className="fa-solid fa-arrow-trend-down mr-1.5" />Giảm tổng nợ
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-sky-700">Bản ghi tổng nợ gốc vẫn được giữ nguyên; thao tác này chỉ thêm một dòng điều chỉnh.</p>
                </div>
              )}

              {/* Màn hình nhập số tiền chuẩn POS siêu thị */}
              <div className="mb-4">
                <div className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/50 via-white to-slate-50/50 p-4 shadow-[0_4px_20px_rgba(16,185,129,0.06)] transition-all focus-within:border-emerald-500 focus-within:bg-white focus-within:shadow-[0_8px_30px_rgba(16,185,129,0.12)] focus-within:ring-4 focus-within:ring-emerald-500/15">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      <label
                        htmlFor="debt-amount"
                        className="text-[11px] font-black uppercase tracking-widest text-emerald-800"
                      >
                        Số tiền giao dịch <span className="text-rose-500">*</span>
                      </label>
                    </div>
                    {amount && (
                      <button
                        type="button"
                        onClick={() => setAmount('')}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold text-slate-400 transition hover:bg-slate-200/70 hover:text-rose-600"
                        title="Xóa số để nhập lại"
                      >
                        <i className="fa-solid fa-rotate-left text-[10px]" />
                        <span>Xóa số (C)</span>
                      </button>
                    )}
                  </div>

                  {/* Dòng số tiền hiển thị cực to POS */}
                  <div className="mt-2 flex items-baseline gap-2 border-b border-emerald-500/20 pb-3">
                    <span className="select-none text-[32px] font-black text-emerald-600/70">₫</span>
                    <input
                      id="debt-amount"
                      autoFocus
                      inputMode="numeric"
                      value={amount}
                      onChange={(event) => setAmount(formatAmountInput(event.target.value))}
                      placeholder="0"
                      className="w-full bg-transparent text-[38px] font-black tracking-tight text-slate-900 outline-none tabular-nums placeholder:text-slate-300"
                    />
                    <span className="shrink-0 select-none text-[12px] font-black tracking-wider text-emerald-700/80 uppercase">
                      VN ĐỒNG
                    </span>
                  </div>

                  {/* Nút cộng tiền nhanh như máy tính tiền POS siêu thị */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="mr-0.5 text-[10px] font-black uppercase text-slate-400">
                      Cộng nhanh:
                    </span>
                    {[
                      { label: '+100k', val: 100000 },
                      { label: '+200k', val: 200000 },
                      { label: '+500k', val: 500000 },
                      { label: '+1tr', val: 1000000 },
                      { label: '+2tr', val: 2000000 },
                      { label: '+5tr', val: 5000000 }
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={() => addQuickAmount(btn.val)}
                        className="rounded-lg border border-emerald-200/80 bg-white px-2.5 py-1 text-[11px] font-black text-emerald-800 shadow-xs transition hover:border-emerald-500 hover:bg-emerald-600 hover:text-white active:scale-95"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] text-slate-500">
                  <i className="fa-solid fa-circle-info text-[10px] text-slate-400" />
                  <span>
                    {editing === 'totalDebt' && (debtAdjustmentMode === 'decrease' ? 'Khoản tiền này sẽ được trừ khỏi tổng công nợ.' : 'Khoản tiền này sẽ được cộng vào tổng công nợ phát sinh.')}
                    {editing === 'paid' && 'Khoản tiền thanh toán thực tế sẽ làm giảm dư nợ còn lại.'}
                    {editing === 'offset' && 'Khoản cấn trừ dịch vụ (điện, nước, kho...) sẽ khấu trừ vào nợ.'}
                  </span>
                </p>
              </div>

              {/* Lý do giao dịch (Bắt buộc dạng Dropdown) */}
              <div className="mb-5">
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="debt-reason-select"
                    className="text-[11px] font-black uppercase tracking-wider text-slate-500"
                  >
                    Lý do giao dịch <span className="text-rose-500">*</span>
                  </label>
                  {reason && !isCustomReason && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                      {reason}
                    </span>
                  )}
                </div>

                {/* Dropdown chọn lý do */}
                <div className="relative">
                  <select
                    id="debt-reason-select"
                    value={isCustomReason ? '__other__' : reason}
                    onChange={(event) => {
                      const val = event.target.value
                      if (val === '__other__') {
                        setIsCustomReason(true)
                        setReason('')
                      } else {
                        setIsCustomReason(false)
                        setReason(val)
                      }
                    }}
                    className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50/50 px-4 pr-10 text-[13px] font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  >
                    {editing === 'offset' && (
                      <option value="" disabled className="text-slate-400">
                        -- Vui lòng chọn lý do cấn trừ --
                      </option>
                    )}
                    {reasonOptions[editing].map((option) => (
                      <option key={option} value={option} className="py-2 font-semibold text-slate-800">
                        {option}
                      </option>
                    ))}
                    <option value="__other__" className="py-2 font-bold text-amber-700">
                      Khác (tự ghi lý do)
                    </option>
                  </select>
                  <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <i className="fa-solid fa-chevron-down text-xs" />
                  </div>
                </div>

                {editing === 'offset' && !reason && !isCustomReason && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-600">
                    <i className="fa-solid fa-circle-exclamation text-[10.5px]" />
                    <span>Bắt buộc chọn một lý do cấn trừ hoặc tự nhập mục khác</span>
                  </p>
                )}

                {/* Khi chọn Khác: Bắt buộc hiển thị thêm ô nhập để ghi lý do */}
                {isCustomReason && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/30 p-3 animate-in fade-in zoom-in-95 duration-150">
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        htmlFor="custom-debt-reason"
                        className="text-[11px] font-black uppercase tracking-wider text-amber-900"
                      >
                        Ghi rõ lý do cụ thể <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10.5px] font-bold italic text-amber-700">
                        Bắt buộc nhập
                      </span>
                    </div>
                    <input
                      id="custom-debt-reason"
                      autoFocus
                      type="text"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={
                        editing === 'offset'
                          ? 'Ví dụ: Sửa máy lạnh phòng 201, trừ cọc...'
                          : 'Nhập chi tiết lý do giao dịch...'
                      }
                      className="h-10 w-full rounded-lg border border-amber-300 bg-white px-3 text-[13px] font-semibold text-slate-800 outline-none transition focus:border-amber-500 focus:ring-3 focus:ring-amber-500/20"
                    />
                    {!reason.trim() && (
                      <p className="mt-1 text-[11px] font-medium text-rose-500">
                        * Vui lòng điền lý do để hoàn tất giao dịch
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <div>
                  {editingEntryId && (
                    <button
                      type="button"
                      onClick={() => {
                        const currentEntry = entries.find((e) => e.id === editingEntryId)
                        if (currentEntry) {
                          setEditing(null)
                          setEditingEntryId(null)
                          setDebtAdjustmentMode(null)
                          setIsOpeningSetup(false)
                          setPendingDelete(currentEntry)
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-[12px] font-bold text-rose-600 transition hover:bg-rose-100/70"
                    >
                      <i className="fa-solid fa-trash-can text-[11px]" />
                      Xóa GD này
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null)
                      setEditingEntryId(null)
                      setDebtAdjustmentMode(null)
                      setIsOpeningSetup(false)
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!amount.trim() || !reason.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-[12px] font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="fa-solid fa-check text-[11px]" />
                    {editingEntryId ? 'Cập nhật' : 'Lưu giao dịch'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
