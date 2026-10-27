import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getInvoices,
  getOutstandingInvoices,
  getRooms,
  getTenants,
  getAppSettings,
  deleteInvoice,
  reopenInvoiceDebt,
  isDepositOnlyInvoice,
  type Invoice,
  type Room,
  type AppUser,
  type Tenant,
  type AppSettings
} from '../lib/db'
import { PaymentModal } from './PaymentModal'
import { EditInvoiceModal } from './EditInvoiceModal'
import { InvoiceDetailModal } from './InvoiceDetailModal'
import { SePaySyncModal } from './SePaySyncModal'
import { LogoLoading } from './LogoLoading'
import { PriorInvoiceDebt } from './PriorInvoiceDebt'
import { getPriorOutstandingInvoices } from '../lib/invoiceDebt'
import { readInvoiceMonthCounts, readInvoiceMonthSummary, seedInvoiceMonthPage } from '../lib/invoice-summary-query'
import { useMobile } from '../lib/use-mobile'
import { MobileInvoiceCard } from './MobileInvoiceCard'
import { InvoiceToolbar } from './InvoiceToolbar'
import { InvoiceExportPicker } from './InvoiceExportPicker'
import { selectedExportInvoice } from '../lib/invoice-export-selection'
import { getInvoiceMenuPermissions, getInvoiceMenuPosition, getMobileInvoiceState } from '../lib/mobile-invoice-state'
import { buildInvoiceDetailExportHtml, getImageDataUrl } from '../lib/invoice-export'
import logoNgang from '../assets/an_khang_home_logo_ngang.png'
import logoMark from '../assets/an_khang_home_logo.png'

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v)
const INVOICE_EXPORT_MARKER = '[INVOICE_EXPORTED]'

const isInvoiceExported = (invoice: Invoice): boolean =>
  (invoice.note || '').includes(INVOICE_EXPORT_MARKER)

const appendInvoiceExportNote = (note: string | undefined, filePath: string): string => {
  const marker = `${INVOICE_EXPORT_MARKER} ${new Date().toISOString()} ${filePath}`
  const cleanNote = (note || '')
    .split('\n')
    .filter((line) => !line.includes(INVOICE_EXPORT_MARKER))
    .join('\n')
    .trim()
  return [cleanNote, marker].filter(Boolean).join('\n')
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

function getInvoiceLabel(invoice: Invoice): string {
  if (invoice.is_settlement) return 'Hóa đơn tất toán hợp đồng'
  if (invoice.billing_reason === 'deposit_refund') return 'Trả tiền cọc'
  if (invoice.billing_reason === 'deposit_collect' || isDepositOnlyInvoice(invoice))
    return 'Thu tiền cọc'
  if (invoice.is_first_month) return 'Thu tiền tháng đầu tiên'
  if (invoice.billing_reason === 'contract_end') return 'Tất toán hợp đồng'
  return `Thu tiền tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`
}

/** Lấy khoảng thời gian kỳ hóa đơn từ dữ liệu đã lưu */
function getBillingPeriod(
  invoice: Invoice,
  _room: Room | undefined
): { start: string; end: string } | null {
  if (!invoice.billing_period_start || !invoice.billing_period_end) return null
  const monthEnd = new Date(invoice.year, invoice.month, 0).toISOString().split('T')[0]
  const savedEnd = new Date(invoice.billing_period_end)
  const isMonthlyInvoice =
    !invoice.is_settlement &&
    !isDepositOnlyInvoice(invoice) &&
    invoice.billing_reason !== 'deposit_collect' &&
    invoice.billing_reason !== 'deposit_refund' &&
    invoice.billing_reason !== 'contract_end'
  const savedEndIsInsideInvoiceMonth =
    !Number.isNaN(savedEnd.getTime()) &&
    savedEnd.getFullYear() === invoice.year &&
    savedEnd.getMonth() + 1 === invoice.month &&
    invoice.billing_period_end < monthEnd
  return {
    start: invoice.billing_period_start,
    end: isMonthlyInvoice && savedEndIsInsideInvoiceMonth ? monthEnd : invoice.billing_period_end
  }
}

export const InvoicesTab: React.FC<{
  currentUser?: AppUser | null
  openSePaySyncSignal?: number
  onSePaySyncSignalHandled?: () => void
}> = ({ currentUser, openSePaySyncSignal = 0, onSePaySyncSignalHandled }) => {
  const INVOICE_PAGE_SIZE = 50
  const isMobile = useMobile()
  const isAdmin = currentUser?.role === 'admin'
  const queryClient = useQueryClient()
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [debtView, setDebtView] = useState(false)
  const [showSePaySync, setShowSePaySync] = useState(false)
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const {
    data: invoicePages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['invoices', 'month', selectedYear, selectedMonth],
    queryFn: ({ pageParam }) =>
      getInvoices({
        month: selectedMonth,
        year: selectedYear,
        limit: INVOICE_PAGE_SIZE,
        offset: pageParam
      }),
    initialPageParam: 0,
    initialData: () => seedInvoiceMonthPage(queryClient, selectedMonth, selectedYear, INVOICE_PAGE_SIZE),
    initialDataUpdatedAt: () => queryClient.getQueryState(['invoices'])?.dataUpdatedAt,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < INVOICE_PAGE_SIZE ? undefined : allPages.length * INVOICE_PAGE_SIZE
  })
  const invoices = useMemo(
    () => invoicePages?.pages.flatMap((page) => page) || [],
    [invoicePages]
  )
  const { data: outstandingInvoices = [], isLoading: outstandingLoading, error: outstandingError, refetch: refetchOutstanding } = useQuery({
    queryKey: ['invoices', 'outstanding'],
    queryFn: getOutstandingInvoices,
    staleTime: 15_000
  })
  const priorOutstandingInvoices = useMemo(
    () => getPriorOutstandingInvoices(outstandingInvoices, selectedMonth, selectedYear),
    [outstandingInvoices, selectedMonth, selectedYear]
  )
  const loadingAllPagesRef = useRef<Promise<void> | null>(null)
  const loadAllInvoicePages = async (): Promise<void> => {
    if (loadingAllPagesRef.current) return loadingAllPagesRef.current
    const loadPromise = (async () => {
    let more = Boolean(hasNextPage)
    while (more) {
      const result = await fetchNextPage()
      more = Boolean(result.hasNextPage)
    }
    })()
    loadingAllPagesRef.current = loadPromise
    try {
      await loadPromise
    } finally {
      loadingAllPagesRef.current = null
    }
  }
  const { data: invoiceMonthCounts = {} } = useQuery({
    queryKey: ['invoiceMonthCounts'],
    queryFn: () => readInvoiceMonthCounts(queryClient),
    staleTime: 60_000
  })
  const { data: invoiceMonthSummary } = useQuery({
    queryKey: ['invoiceMonthSummary', selectedYear, selectedMonth],
    queryFn: () => readInvoiceMonthSummary(queryClient, selectedMonth, selectedYear),
    staleTime: 60_000
  })
  const { data: sepayInvoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => getInvoices(),
    enabled: showSePaySync,
    staleTime: 15_000
  })

  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: getTenants })
  const { data: appSettings = {}, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['appSettings'],
    queryFn: getAppSettings
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'room_asc' | 'room_desc' | 'amount_desc' | 'newest'>(
    'newest'
  )
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reopeningId, setReopeningId] = useState<string | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)

  useEffect(() => {
    if (openSePaySyncSignal > 0) {
      setShowSePaySync(true)
      onSePaySyncSignalHandled?.()
    }
  }, [openSePaySyncSignal, onSePaySyncSignalHandled])
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [bulkExporting, setBulkExporting] = useState(false)
  const [bulkExportMessage, setBulkExportMessage] = useState('')
  const [showExportPicker, setShowExportPicker] = useState(false)
  const { data: exportInvoices = [], isFetching: exportLoading, error: exportLoadError } = useQuery({
    queryKey: ['invoices', 'export-picker', selectedYear, selectedMonth, debtView],
    queryFn: () => debtView ? getOutstandingInvoices() : getInvoices({ month: selectedMonth, year: selectedYear }),
    enabled: showExportPicker,
    staleTime: 0
  })

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: (cancelledInvoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoiceMonthCounts'] })
      queryClient.invalidateQueries({ queryKey: ['invoiceMonthSummary', selectedYear, selectedMonth] })
      if (cancelledInvoice?.room_id) {
        queryClient.invalidateQueries({ queryKey: ['invoices', cancelledInvoice.room_id] })
      }
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['activeContracts'] })
      setDeletingId(null)
      setDeleteError(null)
    },
    onError: (err: Error) => {
      setDeleteError(err.message)
    }
  })
  const reopenMutation = useMutation({
    mutationFn: reopenInvoiceDebt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setReopeningId(null)
      queryClient.invalidateQueries({ queryKey: ['room'] })
    },
    onError: (err: Error) => {
      setReopeningId(null)
      window.alert(err.message || 'Không thể hoàn tác chốt nợ.')
    }
  })
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Multi-select filter dạng checkbox
  const [filters, setFilters] = useState({
    paid: false,
    unpaid: true,
    partial: false,
    settlement: false,
    cancelled: false
  })

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
    void loadAllInvoicePages()
  }

  const monthYearOptions = useMemo(() => {
    const options: { month: number; year: number }[] = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      options.push({ month: date.getMonth() + 1, year: date.getFullYear() })
    }
    return options
  }, [])

  const monthInvoices = useMemo(
    () => invoices.filter((inv) => inv.month === selectedMonth && inv.year === selectedYear),
    [invoices, selectedMonth, selectedYear]
  )

  const roomById = useMemo(() => {
    const map = new Map<string, (typeof rooms)[number]>()
    for (const room of rooms) map.set(room.id, room)
    return map
  }, [rooms])

  const tenantById = useMemo(() => {
    const map = new Map<string, (typeof tenants)[number]>()
    for (const tenant of tenants) map.set(tenant.id, tenant)
    return map
  }, [tenants])

  const statusCounts = useMemo(() => {
    const counts = invoiceMonthSummary || {
      total: 0,
      paid: 0,
      unpaid: 0,
      partial: 0,
      settlement: 0,
      merged: 0,
      cancelled: 0
    }
    if (invoiceMonthSummary) return counts
    for (const invoice of monthInvoices) {
      if (invoice.is_settlement) counts.settlement++
      if (invoice.payment_status === 'merged') counts.merged++
      if (invoice.payment_status === 'cancelled') counts.cancelled++
      if (invoice.is_settlement) continue
      if (invoice.payment_status === 'paid') counts.paid++
      if (invoice.payment_status === 'unpaid') counts.unpaid++
      if (invoice.payment_status === 'partial') counts.partial++
    }
    return counts
  }, [invoiceMonthSummary, monthInvoices])

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = searchQuery.toLowerCase()
    const sourceInvoices = debtView ? outstandingInvoices : monthInvoices
    const result = sourceInvoices.filter((inv) => {
      const roomName = roomById.get(inv.room_id)?.name || ''
      const tenantName = tenantById.get(inv.tenant_id)?.full_name || ''
      if (debtView) {
        return (
          inv.total_amount > inv.paid_amount &&
          `${roomName} ${tenantName} ${inv.month}/${inv.year}`.toLowerCase().includes(normalizedSearch)
        )
      }
      // Hóa đơn đã hủy hợp đồng
      if (inv.payment_status === 'cancelled') return filters.cancelled
      // Hóa đơn tất toán đã xong chỉ hiện khi bật filter Tất toán.
      // Nếu còn phải thu/hoàn thì vẫn hiện trong luồng Chưa thu mặc định.
      if (inv.is_settlement) {
        const total = Number(inv.total_amount || 0)
        const paid = Number(inv.paid_amount || 0)
        const hasPendingSettlementWork = total < 0 ? paid > total : total > paid
        return filters.settlement || (filters.unpaid && hasPendingSettlementWork)
      }
      // Hóa đơn đã gộp (merged): luôn hiện nếu settlement bật
      if (inv.payment_status === 'merged') return filters.settlement
      // Hóa đơn thường
      if (inv.payment_status === 'paid' && !filters.paid) return false
      if (inv.payment_status === 'unpaid' && !filters.unpaid) return false
      if (inv.payment_status === 'partial' && !filters.partial) return false
      return roomName.toLowerCase().includes(normalizedSearch)
    })
    return result.sort((a, b) => {
      const roomA = roomById.get(a.room_id)?.name || ''
      const roomB = roomById.get(b.room_id)?.name || ''
      if (sortOrder === 'room_asc') return roomA.localeCompare(roomB)
      if (sortOrder === 'room_desc') return roomB.localeCompare(roomA)
      if (sortOrder === 'amount_desc') return b.total_amount - a.total_amount
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [debtView, outstandingInvoices, monthInvoices, filters, roomById, tenantById, searchQuery, sortOrder])

  // Keep aggregate totals on the complete result, but avoid mounting thousands
  // of debt rows at once when the history grows.
  const [visibleInvoiceCount, setVisibleInvoiceCount] = useState(100)
  useEffect(() => {
    setVisibleInvoiceCount(100)
  }, [debtView, selectedMonth, selectedYear, searchQuery, sortOrder, filters])
  const visibleInvoices = useMemo(
    () => filteredInvoices.slice(0, visibleInvoiceCount),
    [filteredInvoices, visibleInvoiceCount]
  )

  const filteredInvoiceSummary = useMemo(() => {
    let count = 0
    let total = 0
    let paid = 0
    let remaining = 0
    for (const invoice of filteredInvoices) {
      if (invoice.payment_status === 'cancelled') continue
      count++
      total += invoice.total_amount
      paid += invoice.paid_amount
      remaining += Math.max(0, invoice.total_amount - invoice.paid_amount)
    }
    return { count, total, paid, remaining }
  }, [filteredInvoices])

  const handleExportSelectedInvoice = async (roomId: string, invoiceId: string) => {
    if (bulkExporting) return

    setBulkExporting(true)
    setBulkExportMessage('')

    try {
      // Export is explicit and scoped to the selected room; never export a whole month by accident.
      const latest = debtView ? await getOutstandingInvoices() : await getInvoices({ month: selectedMonth, year: selectedYear })
      const exportInvoice = selectedExportInvoice(latest, roomId, invoiceId)

      const saveImage = window.api.invoice.saveImage
      if (typeof saveImage !== 'function') throw new Error('Trình duyệt chưa sẵn sàng để tải ảnh hóa đơn.')

      const logoSrc = await getImageDataUrl(logoNgang)
      const logoMarkSrc = await getImageDataUrl(logoMark)
      const room = roomById.get(exportInvoice.room_id)
      const tenant = tenantById.get(exportInvoice.tenant_id)
      const html = buildInvoiceDetailExportHtml(exportInvoice, room, tenant, appSettings, logoSrc, logoMarkSrc)
      const roomName = (room?.name || 'phong').replace(/\s+/g, '-')
      const fileName = `hoa-don-${roomName}-T${String(exportInvoice.month).padStart(2, '0')}-${exportInvoice.year}-${exportInvoice.id.slice(-8)}.png`
      const result = await saveImage({ html, fileName })
      if (!result.ok) throw new Error(result.error || `Không thể xuất hóa đơn ${room?.name || exportInvoice.id}.`)
      // Download initiation is not proof of saving or delivery. Never mutate
      // financial records or overwrite invoice notes just to download an image.
      setBulkExportMessage(`Đã bắt đầu tải hóa đơn ${room?.name || 'đã chọn'}. Kiểm tra mục Tải xuống trên thiết bị.`)
      setShowExportPicker(false)
    } catch (err) {
      setBulkExportMessage(err instanceof Error ? err.message : 'Không thể xuất hóa đơn đã chọn.')
    } finally {
      setBulkExporting(false)
    }
  }

  return (
    <div className="pwa-invoices-screen flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <InvoiceToolbar onExport={() => { setShowExportPicker(true); setBulkExportMessage('') }} onSync={() => setShowSePaySync(true)} busy={bulkExporting} settingsLoading={isSettingsLoading} />
        {bulkExportMessage && (
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-xs font-semibold text-emerald-700">
            <i className="fa-solid fa-circle-info mr-1.5"></i>
            {bulkExportMessage}
          </div>
        )}

        {showExportPicker && <InvoiceExportPicker invoices={exportInvoices} rooms={rooms} period={debtView ? 'Đang nợ · Tất cả tháng' : `Kỳ ${selectedMonth}/${selectedYear}`} loading={exportLoading} busy={bulkExporting} error={exportLoadError instanceof Error ? exportLoadError.message : bulkExportMessage} onClose={() => { if (!bulkExporting) setShowExportPicker(false) }} onExport={(roomId, invoiceId) => void handleExportSelectedInvoice(roomId, invoiceId)} />}


        {/* Month Tabs */}
        <div className="px-4 pt-3 overflow-x-auto border-b border-gray-100">
          <div className="flex gap-1.5 pb-0 min-w-max">
            <button
              type="button"
              onClick={() => setDebtView(true)}
              className={`relative flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-bold transition-colors ${debtView ? 'border-b-2 border-rose-600 bg-rose-50 text-rose-700' : 'bg-gray-50 text-gray-500 hover:bg-rose-50'}`}
            >
              <i className="fa-solid fa-file-circle-exclamation" /> Đang nợ · Tất cả tháng
            </button>
            {monthYearOptions.map((opt) => {
              const isActive = !debtView && selectedMonth === opt.month && selectedYear === opt.year
              const count = invoiceMonthCounts[`${opt.year}-${opt.month}`] || 0
              return (
                <button
                  key={`${opt.month}-${opt.year}`}
                  onClick={() => {
                    setDebtView(false)
                    setSelectedMonth(opt.month)
                    setSelectedYear(opt.year)
                  }}
                  className={`relative px-4 py-2 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-green-100 text-green-700 border-b-2 border-green-600'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  T.{opt.month} {opt.year}
                  {count > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Filter bar — checkbox style */}
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          {/* Filter icon + badge */}
          <div className="relative">
            <i className="fa-solid fa-filter text-gray-500 text-sm"></i>
            <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {filteredInvoices.length}
            </span>
          </div>

          {/* Checkboxes */}
          {!debtView && [
            {
              key: 'paid' as const,
              label: 'Đã thu',
              count: statusCounts.paid,
              color: 'text-emerald-700'
            },
            {
              key: 'unpaid' as const,
              label: 'Chưa thu',
              count: statusCounts.unpaid,
              color: 'text-orange-600'
            },
            {
              key: 'partial' as const,
              label: 'Thu thiếu',
              count: statusCounts.partial,
              color: 'text-red-600'
            },
            {
              key: 'settlement' as const,
              label: 'Tất toán',
              count: statusCounts.settlement,
              color: 'text-purple-600'
            },
            {
              key: 'cancelled' as const,
              label: 'Đã hủy HĐ',
              count: statusCounts.cancelled,
              color: 'text-gray-500'
            }
          ].map(({ key, label, count, color }) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={() => toggleFilter(key)}
                className="w-3.5 h-3.5 accent-green-600"
              />
              <span className="text-xs text-gray-600">{label}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 ${color}`}
              >
                {count}
              </span>
            </label>
          ))}
          {debtView && <span className="text-xs font-semibold text-rose-700">Toàn bộ hóa đơn còn phải thu, không giới hạn tháng</span>}

          <div className="flex-1" />

          {/* Sort */}
          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as typeof sortOrder)
              void loadAllInvoicePages()
            }}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:border-green-400"
          >
            <option value="room_asc">Thứ tự phòng tăng dần</option>
            <option value="room_desc">Thứ tự phòng giảm dần</option>
            <option value="amount_desc">Tiền nhiều nhất</option>
            <option value="newest">Mới nhất</option>
          </select>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Tìm tên phòng..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (e.target.value.trim()) void loadAllInvoicePages()
              }}
              className="w-44 text-xs border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-white outline-none focus:border-green-400"
            />
            <i className="fa-solid fa-magnifying-glass absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
          </div>
        </div>

        {!debtView && (
          <>
            <PriorInvoiceDebt
              invoices={priorOutstandingInvoices}
              month={selectedMonth}
              year={selectedYear}
              roomById={roomById}
              tenantById={tenantById}
              searchQuery={searchQuery}
              loading={outstandingLoading}
              error={outstandingError}
              onRetry={() => { void refetchOutstanding() }}
              onPay={setPayingInvoice}
              onView={setViewingInvoice}
            />
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-bold text-gray-800">
              Hóa đơn tháng {selectedMonth}/{selectedYear}
            </h3>
          </>
        )}

        {isMobile && (
          <div className="pwa-invoice-mobile-list space-y-3 bg-[#f8fbfa] p-3">
            {(debtView ? outstandingLoading : isLoading) ? <LogoLoading message="Đang tải hóa đơn..." className="min-h-[30vh] rounded-xl bg-white" /> : filteredInvoices.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400"><i className="fa-solid fa-inbox mb-2 block text-2xl opacity-40" />Không có hóa đơn nào</div> : visibleInvoices.map(invoice => {
              const room = roomById.get(invoice.room_id)
              const tenant = tenantById.get(invoice.tenant_id)
              return <MobileInvoiceCard key={invoice.id} invoice={invoice} roomName={room?.name || invoice.room_id} tenantName={tenant?.full_name || 'Chưa gắn khách thuê'} label={getInvoiceLabel(invoice)} onView={() => setViewingInvoice(invoice)} onPay={() => setPayingInvoice(invoice)} onMenu={button => {
                setMenuPos(getInvoiceMenuPosition(button.getBoundingClientRect(), window.innerWidth, window.innerHeight))
                setOpenMenuId(openMenuId === invoice.id ? null : invoice.id)
              }} />
            })}
          </div>
        )}

        {/* Table */}
        <div className={`overflow-x-auto min-h-[300px] ${isMobile ? 'hidden' : ''}`}>
          <table className="w-full text-left text-sm">
            <thead className="bg-blue-50 text-gray-600 text-xs font-semibold sticky top-0 z-10 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 w-10"></th>
                <th className="px-3 py-3 min-w-[180px]">Tên phòng</th>
                <th className="px-3 py-3 min-w-[140px] text-right">Tiền phòng</th>
                <th className="px-3 py-3 min-w-[120px] text-right">Điện nước</th>
                <th className="px-3 py-3 min-w-[110px] text-right">Thu/trả cọc</th>
                <th className="px-3 py-3 min-w-[110px] text-right">Cộng thêm/Giảm trừ</th>
                <th className="px-3 py-3 min-w-[140px] text-right font-bold">Tổng cộng</th>
                <th className="px-3 py-3 min-w-[110px] text-right">Cần thu</th>
                <th className="px-3 py-3 text-center min-w-[130px]">Trạng thái</th>
                <th className="px-3 py-3 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(debtView ? outstandingLoading : isLoading) ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <LogoLoading message="Đang tải hóa đơn..." className="min-h-[45vh]" />
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <i className="fa-solid fa-inbox text-2xl mb-2 block opacity-40"></i>
                    Không có hóa đơn nào
                  </td>
                </tr>
              ) : (
                visibleInvoices.map((invoice) => {
                  const room = roomById.get(invoice.room_id)
                  const isPaid = invoice.payment_status === 'paid'
                  const isPartial = invoice.payment_status === 'partial'
                  const isCancelled = invoice.payment_status === 'cancelled'
                  const exported = isInvoiceExported(invoice)
                  const remaining = invoice.total_amount - invoice.paid_amount
                  const elecWaterCost = invoice.electric_cost + invoice.water_cost
                  const depositAmt = invoice.deposit_amount || 0
                  const adjustmentAmt = invoice.adjustment_amount || 0
                  const period = getBillingPeriod(invoice, room)
                  const label = getInvoiceLabel(invoice)

                  const isSettlement = !!invoice.is_settlement
                  const isMerged = invoice.payment_status === 'merged'
                  return (
                    <tr
                      key={invoice.id}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 92px' }}
                      className={`transition hover:brightness-95 ${
                        isCancelled
                          ? 'bg-gray-50 opacity-60'
                          : isSettlement
                            ? 'bg-purple-50/60'
                            : isMerged
                              ? 'bg-gray-50'
                              : isPaid
                                ? 'bg-emerald-50/60'
                                : 'bg-white'
                      }`}
                    >
                      {/* Color dot */}
                      <td className="px-3 py-3 text-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs mx-auto shadow-sm ${
                            isCancelled
                              ? 'bg-gray-400'
                              : isSettlement
                                ? 'bg-gradient-to-br from-purple-500 to-indigo-500'
                                : isMerged
                                  ? 'bg-gray-400'
                                  : isPaid
                                    ? 'bg-gradient-to-br from-emerald-400 to-green-500'
                                    : isPartial
                                      ? 'bg-yellow-400'
                                      : 'bg-orange-400'
                          }`}
                        >
                          <i
                            className={`fa-solid ${
                              isCancelled
                                ? 'fa-ban'
                                : isSettlement
                                  ? 'fa-door-closed'
                                  : isMerged
                                    ? 'fa-layer-group'
                                    : isPaid
                                      ? 'fa-check'
                                      : isPartial
                                        ? 'fa-hourglass-half'
                                        : 'fa-clock'
                            }`}
                          ></i>
                        </div>
                      </td>

                      {/* Tên phòng */}
                      <td className="px-3 py-3">
                        <div className="font-bold text-gray-800">
                          {room?.name || 'Phòng đã xóa'}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                          <i className="fa-regular fa-clock text-[9px]"></i>
                          {new Date(invoice.created_at).toLocaleString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </div>
                      </td>

                      {/* Tiền phòng + date range */}
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold text-gray-800 tabular-nums">
                          {formatVND(invoice.room_cost)} đ
                        </div>
                        {period && (
                          <div className="text-[10px] text-green-600 mt-0.5 tabular-nums">
                            [{fmtDate(period.start)} - {fmtDate(period.end)}]
                          </div>
                        )}
                      </td>

                      {/* Điện nước */}
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold text-gray-700 tabular-nums">
                          {formatVND(elecWaterCost)} đ
                        </div>
                        {elecWaterCost > 0 && (
                          <div className="text-[10px] text-gray-400 space-y-0.5 mt-0.5">
                            {invoice.electric_cost > 0 && (
                              <div>Điện: {formatVND(invoice.electric_cost)}</div>
                            )}
                            {invoice.water_cost > 0 && (
                              <div>Nước: {formatVND(invoice.water_cost)}</div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Thu/trả cọc */}
                      <td className="px-3 py-3 text-right">
                        {depositAmt !== 0 ? (
                          <div>
                            <span
                              className={`font-semibold tabular-nums ${depositAmt < 0 ? 'text-blue-600' : 'text-gray-700'}`}
                            >
                              {depositAmt < 0 ? '-' : '+'}
                              {formatVND(Math.abs(depositAmt))} đ
                            </span>
                            {isSettlement && depositAmt < 0 && (
                              <div className="text-[10px] text-blue-500 font-medium mt-0.5">
                                Hoàn cọc
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">0 đ</span>
                        )}
                      </td>

                      {/* Cộng thêm / Giảm trừ */}
                      <td className="px-3 py-3 text-right">
                        {adjustmentAmt !== 0 ? (
                          <div>
                            <span
                              className={`font-semibold tabular-nums ${adjustmentAmt < 0 ? 'text-red-500' : 'text-orange-600'}`}
                            >
                              {adjustmentAmt < 0 ? '-' : '+'}
                              {formatVND(Math.abs(adjustmentAmt))} đ
                            </span>
                            {isSettlement && adjustmentAmt > 0 && invoice.adjustment_note && (
                              <div
                                className="text-[10px] text-orange-500 font-medium mt-0.5 max-w-[100px] truncate"
                                title={invoice.adjustment_note}
                              >
                                {invoice.adjustment_note}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">0 đ</span>
                        )}
                      </td>

                      {/* Tổng cộng */}
                      <td className="px-3 py-3 text-right">
                        {invoice.total_amount < 0 ? (
                          <div>
                            <div className="font-bold text-blue-600 text-base tabular-nums">
                              Hoàn {formatVND(Math.abs(invoice.total_amount))} đ
                            </div>
                            {invoice.paid_amount > 0 && (
                              <div className="text-[10px] text-emerald-600 mt-0.5 italic">
                                Đã hoàn
                                <br />
                                <span className="font-bold tabular-nums">
                                  {formatVND(invoice.paid_amount)} đ
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-gray-800 text-base tabular-nums">
                              {formatVND(invoice.total_amount)} đ
                            </div>
                            {invoice.paid_amount > 0 && (
                              <div className="text-[10px] text-emerald-600 mt-0.5 italic">
                                Số tiền đã thu
                                <br />
                                <span className="font-bold tabular-nums">
                                  {formatVND(invoice.paid_amount)} đ
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Cần thu / Cần hoàn */}
                      <td className="px-3 py-3 text-right">
                        {invoice.total_amount < 0 && invoice.paid_amount === 0 ? (
                          <span className="font-bold text-blue-500 tabular-nums">
                            Hoàn {formatVND(Math.abs(invoice.total_amount))} đ
                          </span>
                        ) : remaining > 0 ? (
                          <span className="font-bold text-red-500 tabular-nums">
                            {formatVND(remaining)} đ
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-600">0 đ</span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-3 py-3 text-center">
                        {isCancelled ? (
                          <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap line-through">
                            <i className="fa-solid fa-ban mr-1"></i>Đã hủy HĐ
                          </span>
                        ) : isSettlement ? (
                          <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-door-closed mr-1"></i>Tất toán
                          </span>
                        ) : isMerged ? (
                          <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-layer-group mr-1"></i>Đã gộp
                          </span>
                        ) : isPaid ? (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-check mr-1"></i>Đã thu xong
                          </span>
                        ) : invoice.debt_confirmed_at ? (
                          <span className="rounded bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-700">Đã chốt · Đang nợ</span>
                        ) : isPartial ? (
                          <span className="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-hourglass-half mr-1"></i>Thu thiếu
                          </span>
                        ) : (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                              <i className="fa-solid fa-clock mr-1"></i>Chưa thu
                            </span>
                            {exported && (
                              <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                                <i className="fa-solid fa-file-export mr-1"></i>Đã xuất HĐ
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={(e) => {
                            const rect = (
                              e.currentTarget as HTMLButtonElement
                            ).getBoundingClientRect()
                            setMenuPos({
                              top: rect.bottom + 4,
                              right: window.innerWidth - rect.right
                            })
                            setOpenMenuId(openMenuId === invoice.id ? null : invoice.id)
                          }}
                          className="text-gray-400 hover:text-gray-600 transition w-7 h-7 rounded hover:bg-gray-100 flex items-center justify-center mx-auto"
                        >
                          <i className="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {visibleInvoiceCount < filteredInvoices.length && (
          <div className="flex items-center justify-center gap-3 border-t border-gray-100 bg-white px-4 py-3">
            <span className="text-xs text-gray-500">
              Đang hiển thị {visibleInvoices.length}/{filteredInvoices.length} hóa đơn
            </span>
            <button
              type="button"
              onClick={() => setVisibleInvoiceCount((count) => count + 100)}
              className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-50"
            >
              Hiển thị thêm
            </button>
          </div>
        )}

        {!debtView && hasNextPage && (
          <div className="flex items-center justify-center gap-3 border-t border-gray-100 bg-white px-4 py-3">
            <span className="text-xs text-gray-500">
              Đã tải {invoices.length}/{invoiceMonthCounts[`${selectedYear}-${selectedMonth}`] || invoices.length} hóa đơn
            </span>
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-50 disabled:cursor-wait disabled:opacity-60"
            >
              {isFetchingNextPage ? 'Đang tải...' : 'Tải thêm'}
            </button>
          </div>
        )}

        {/* Footer Stats */}
        {filteredInvoices.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">
                Tổng hóa đơn{!debtView && hasNextPage ? ' (đã tải)' : ''}
              </div>
              <div className="font-bold text-gray-800">{filteredInvoiceSummary.count}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Tổng tiền{!debtView && hasNextPage ? ' (đã tải)' : ''}</div>
              <div className="font-bold text-blue-600 tabular-nums">
                {formatVND(filteredInvoiceSummary.total)} đ
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Đã thu{!debtView && hasNextPage ? ' (đã tải)' : ''}</div>
              <div className="font-bold text-emerald-600 tabular-nums">
                {formatVND(filteredInvoiceSummary.paid)} đ
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Còn thu{!debtView && hasNextPage ? ' (đã tải)' : ''}</div>
              <div className="font-bold text-red-500 tabular-nums">
                {formatVND(filteredInvoiceSummary.remaining)} đ
              </div>
            </div>
          </div>
        )}
      </div>
      {openMenuId &&
        (() => {
          const invoice = filteredInvoices.find((i) => i.id === openMenuId)
          if (!invoice) return null
          const permissions = getInvoiceMenuPermissions(invoice, isAdmin)
          const isRefundMenu = getMobileInvoiceState(invoice).isRefund
          const canEditInvoice = permissions.canEdit
          const canDeleteInvoice = permissions.canCancel
          return (
            <div
              ref={menuRef}
              style={{ top: menuPos.top, right: menuPos.right }}
              className="fixed z-[200] max-h-[calc(100dvh-16px)] w-44 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl py-1 text-sm"
            >
              <button
                onClick={() => {
                  setViewingInvoice(invoice)
                  setOpenMenuId(null)
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-green-700 hover:bg-green-50 font-semibold"
              >
                <i className="fa-solid fa-file-invoice w-4"></i>Xem chi tiết
              </button>
              {permissions.canPay && (
                <button
                  onClick={() => {
                    setPayingInvoice(invoice)
                    setOpenMenuId(null)
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-emerald-700 hover:bg-emerald-50 font-semibold"
                >
                  <i className="fa-solid fa-money-bill-wave w-4"></i>
                  {isRefundMenu ? 'Hoàn tiền' : 'Thu tiền'}
                </button>
              )}
              {permissions.canReopen && (
                <button
                  onClick={() => {
                    if (!window.confirm('Hoàn tác chốt nợ để sửa hoặc hủy hóa đơn này?')) return
                    setReopeningId(invoice.id)
                    reopenMutation.mutate(invoice.id)
                    setOpenMenuId(null)
                  }}
                  disabled={reopeningId === invoice.id || reopenMutation.isPending}
                  className="flex w-full items-center gap-2 px-4 py-2 font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  <i className="fa-solid fa-rotate-left w-4"></i>
                  {reopeningId === invoice.id ? 'Đang hoàn tác...' : 'Hoàn tác chốt nợ'}
                </button>
              )}
              <button
                onClick={() => {
                  if (!canEditInvoice) return
                  setEditingInvoice(invoice)
                  setOpenMenuId(null)
                }}
                disabled={!canEditInvoice}
                className={`flex w-full items-center gap-2 px-4 py-2 font-semibold ${canEditInvoice ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 cursor-not-allowed'}`}
                title={canEditInvoice ? 'Sửa hóa đơn' : 'Đã thu tiền — chỉ admin mới sửa được'}
              >
                <i className="fa-solid fa-pen-to-square w-4"></i>
                {canEditInvoice ? 'Sửa hóa đơn' : 'Đã khóa'}
              </button>
              <button
                onClick={() => {
                  if (!canDeleteInvoice) return
                  setDeletingId(invoice.id)
                  setDeleteError(null)
                  setOpenMenuId(null)
                }}
                disabled={!canDeleteInvoice}
                className={`flex w-full items-center gap-2 px-4 py-2 font-semibold ${canDeleteInvoice ? 'text-red-600 hover:bg-red-50' : 'text-gray-400 cursor-not-allowed'}`}
                title={canDeleteInvoice ? 'Hủy phiếu thu' : 'Đã thu tiền — chỉ admin mới hủy được'}
              >
                <i className="fa-solid fa-ban w-4"></i>
                {canDeleteInvoice ? 'Hủy phiếu' : 'Đã khóa'}
              </button>
            </div>
          )
        })()}

      {deletingId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !deleteMutation.isPending && !deleteError)
              deleteMutation.mutate(deletingId)
          }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <i className="fa-solid fa-ban"></i>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Hủy phiếu thu?</h3>
                <p className="text-xs text-gray-500">
                  Phiếu sẽ chuyển sang trạng thái đã hủy để giữ lịch sử đối chiếu.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0"></i>
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeletingId(null)
                  setDeleteError(null)
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Hủy
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletingId)}
                disabled={deleteMutation.isPending || !!deleteError}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Đang hủy...' : 'Hủy phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          room={roomById.get(editingInvoice.room_id)}
          onClose={() => setEditingInvoice(null)}
        />
      )}

      {payingInvoice && (
        <PaymentModal
          invoice={payingInvoice}
          room={roomById.get(payingInvoice.room_id)}
          onClose={() => setPayingInvoice(null)}
        />
      )}

      {showSePaySync && !isSettingsLoading && (
        <SePaySyncModal
          invoices={sepayInvoices}
          rooms={rooms}
          userId={currentUser?.id}
          onClose={() => setShowSePaySync(false)}
        />
      )}

      {viewingInvoice &&
        (() => {
          const vRoom = roomById.get(viewingInvoice.room_id)
          const vTenant = tenantById.get(viewingInvoice.tenant_id)
          return (
            <InvoiceDetailModal
              invoice={viewingInvoice}
              room={vRoom}
              tenantName={vTenant?.full_name}
              tenantPhone={vTenant?.phone}
              settings={appSettings}
              onClose={() => setViewingInvoice(null)}
            />
          )
        })()}
    </div>
  )
}
