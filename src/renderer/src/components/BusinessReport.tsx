import { useMemo, useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_EXPENSE_CATEGORIES,
  getCashTransactions,
  getContracts,
  getInvoices,
  getInvoicePaymentRecords,
  getCollectedDepositAmount,
  getRooms,
  getTenants,
  isDepositOnlyInvoice,
  type CashTransaction,
  type CashTransactionCategory,
  type Contract,
  type ExpenseCategory,
  type Invoice,
  type InvoicePaymentRecord,
  type AppUser,
} from '../lib/db'
import { CashFlowTab } from './CashFlowTab'
import { OverviewTab } from './OverviewTab'

type InvoiceDrillType =
  | 'roomMonthly'
  | 'roomFirstMonth'
  | 'roomTransfer'
  | 'electric'
  | 'water'
  | 'internet'
  | 'cleaning'
  | 'transferService'
  | 'adjustment'
  | 'damage'
  | 'oldDebt'
  | 'deposit'
  | 'refund'
  | 'cash'
  | 'receivable'

type Drill =
  | { mode: 'invoice'; type: InvoiceDrillType; title: string }
  | { mode: 'cash'; type: 'income' | 'expense'; category?: CashTransactionCategory; title: string }

type UtilityBuildingDrill = {
  building: string
  utility: 'electric' | 'water'
  title: string
}

type PnlSection = 'revenue' | 'opex' | 'result'

type PnlRow = {
  key: string
  label: string
  amount: number
  section: PnlSection
  invoiceType?: InvoiceDrillType
  cashType?: 'income' | 'expense'
  cashCategory?: CashTransactionCategory
  group?: boolean
  total?: boolean
  indent?: boolean
  color?: string
}

type InvoiceCashRow = {
  invoice: Invoice
  record: InvoicePaymentRecord
}

type ReportPeriodMode = 'all' | 'range' | 'daily'

export type ReportPeriod = {
  mode: ReportPeriodMode
  start: Date | null
  end: Date | null
  days: number | null
  label: string
  emptyLabel: string
}

const fmt = (value: number) => new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))
const iso = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type ExpenseCategoryOption = { value: CashTransactionCategory; label: string }

const toExpenseOptions = (categories: ExpenseCategory[]): ExpenseCategoryOption[] =>
  categories
    .filter(item => item.type === 'expense')
    .map(item => ({ value: item.value, label: item.name }))

const categoryLabel = (category: CashTransactionCategory, options: ExpenseCategoryOption[]) =>
  options.find(item => item.value === category)?.label || (category === 'other_income' ? 'Khoản thu khác' : 'Khác')

const getInvoiceDate = (invoice: Invoice) =>
  invoice.invoice_date || invoice.payment_date || invoice.created_at?.split('T')[0] || `${invoice.year}-${String(invoice.month).padStart(2, '0')}-01`

const getInvoicePeriodDate = (invoice: Invoice) =>
  toDate(`${invoice.year}-${String(invoice.month).padStart(2, '0')}-01`)

const getUtilityCollectionRatio = (invoice: Invoice) => {
  if (invoice.payment_status === 'paid') return 1
  const total = Number(invoice.total_amount || 0)
  const paid = Number(invoice.paid_amount || 0)
  if (total > 0 && paid > 0) return Math.max(0, Math.min(1, paid / total))
  return 0
}

const getBuildingKeyFromRoomName = (roomName?: string) => {
  const firstNumber = normalizeSearch(roomName || '').match(/\d+/)?.[0]
  return firstNumber?.[0] ? `Tòa ${firstNumber[0]}` : 'Chưa rõ tòa'
}

const getBuildingKeyFromCash = (item: CashTransaction) => {
  const text = normalizeSearch(`${item.note || ''} ${item.room_id || ''}`)
  const explicit = text.match(/toa\s*(\d+)/)?.[1]
  if (explicit) return `Tòa ${explicit}`
  return 'Chưa rõ tòa'
}

type UtilityBuildingRow = {
  building: string
  electricRevenue: number
  waterRevenue: number
  electricExpense: number
  waterExpense: number
  electricRevenueRoomIds: Set<string>
  waterRevenueRoomIds: Set<string>
  electricUtilityRoomIds: Set<string>
  waterUtilityRoomIds: Set<string>
}

const toDate = (value: string) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const formatPeriodDate = (date: Date) => date.toLocaleDateString('vi-VN')
const normalizeSearch = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')

const isDateInPeriod = (date: Date, period: ReportPeriod) => {
  if (!period.start || !period.end) return true
  return date >= period.start && date <= period.end
}

const getInvoiceDrillAmount = (invoice: Invoice, type: InvoiceDrillType) => {
  switch (type) {
    case 'roomMonthly':
      return invoice.is_first_month ? 0 : (invoice.room_cost || 0)
    case 'roomFirstMonth':
      return invoice.is_first_month ? (invoice.room_cost || 0) + (invoice.new_room_cost || 0) : 0
    case 'roomTransfer':
      return invoice.transfer_room_cost || 0
    case 'electric':
      return (invoice.electric_cost || 0) + (invoice.transfer_electric_cost || 0)
    case 'water':
      return (invoice.water_cost || 0) + (invoice.transfer_water_cost || 0)
    case 'internet':
      return invoice.wifi_cost || 0
    case 'cleaning':
      return invoice.garbage_cost || 0
    case 'transferService':
      return (invoice.new_room_service_cost || 0) + (invoice.transfer_service_cost || 0)
    case 'adjustment':
      // Hóa đơn tất toán: adjustment_amount = tiền đền bù, đã được phản ánh trong damage_amount
      // Nếu cả 2 cùng tồn tại, chỉ tính 1 lần qua damage
      return invoice.is_settlement ? 0 : (invoice.adjustment_amount || 0)
    case 'damage':
      return invoice.damage_amount || 0
    case 'oldDebt':
      return (invoice.old_debt || 0) + (invoice.merged_debt_total || 0)
    case 'deposit':
      // Chỉ tính khi thu cọc (deposit_amount > 0)
      return Math.max(0, invoice.deposit_amount || 0)
    case 'refund':
      // Hoàn tiền: dùng total_amount âm (= khách được hoàn) hoặc deposit hoàn đá thanh toán (paid_amount > 0 khi total < 0)
      // Không cộng deposit_amount âm vì nó đã được tính vào total_amount (netDue)
      return Math.abs(Math.min(0, invoice.total_amount || 0))
    case 'cash':
      return invoice.paid_amount || 0
    case 'receivable':
      return Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0))
    default:
      return 0
  }
}

const isRoomUtilityDisplayInvoice = (invoice: Invoice) => {
  if (invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged') return false
  if (invoice.is_settlement || invoice.billing_reason === 'contract_end') return false
  if (isDepositOnlyInvoice(invoice)) return false

  return (
    Number(invoice.electric_cost || 0) > 0 ||
    Number(invoice.water_cost || 0) > 0 ||
    Number(invoice.electric_usage || 0) > 0 ||
    Number(invoice.water_usage || 0) > 0
  )
}

export function BusinessReport({
  currentUser,
  onNavigateToInvoices,
}: {
  currentUser?: AppUser | null
  onNavigateToInvoices?: () => void
} = {}) {
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: cashTransactions = [] } = useQuery({ queryKey: ['cashTransactions'], queryFn: getCashTransactions })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: getTenants })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })

  const [activeTab, setActiveTab] = useState<'overview' | 'pnl' | 'deposit' | 'cashflow' | 'utility'>('overview')

  const today = new Date()
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>('range')
  const [startDate, setStartDate] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [endDate, setEndDate] = useState(iso(today))
  const [selectedDate, setSelectedDate] = useState(iso(today))
  const [drill, setDrill] = useState<Drill | null>(null)
  const [roomUtilitySearch, setRoomUtilitySearch] = useState('')
  const [buildingDrill, setBuildingDrill] = useState<UtilityBuildingDrill | null>(null)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Temp states for Shopee-style date selector
  const [tempPeriodMode, setTempPeriodMode] = useState<ReportPeriodMode>('range')
  const [tempStartDate, setTempStartDate] = useState(startDate)
  const [tempEndDate, setTempEndDate] = useState(endDate)
  const [tempSelectedDate, setTempSelectedDate] = useState(selectedDate)

  // Sync temp state with real state when opened
  const handleOpenToggle = () => {
    if (!dropdownOpen) {
      setTempPeriodMode(periodMode)
      setTempStartDate(startDate)
      setTempEndDate(endDate)
      setTempSelectedDate(selectedDate)
    }
    setDropdownOpen(!dropdownOpen)
  }

  const handleApply = () => {
    setPeriodMode(tempPeriodMode)
    setStartDate(tempStartDate)
    setEndDate(tempEndDate)
    setSelectedDate(tempSelectedDate)
    setDropdownOpen(false)
  }

  const handleCancel = () => {
    setDropdownOpen(false)
  }

  const selectPreset = (mode: 'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom_daily' | 'custom_range') => {
    const now = new Date()
    if (mode === 'all') {
      setTempPeriodMode('all')
    } else if (mode === 'today') {
      setTempPeriodMode('daily')
      setTempSelectedDate(iso(now))
    } else if (mode === 'week') {
      setTempPeriodMode('range')
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      setTempStartDate(iso(start))
      setTempEndDate(iso(now))
    } else if (mode === 'month') {
      setTempPeriodMode('range')
      setTempStartDate(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTempEndDate(iso(now))
    } else if (mode === 'last_month') {
      setTempPeriodMode('range')
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      setTempStartDate(iso(start))
      setTempEndDate(iso(end))
    } else if (mode === 'custom_daily') {
      setTempPeriodMode('daily')
    } else if (mode === 'custom_range') {
      setTempPeriodMode('range')
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const activePresetLabel = useMemo(() => {
    if (periodMode === 'all') return 'Toàn thời gian'
    if (periodMode === 'daily') {
      const todayStr = iso(new Date())
      if (selectedDate === todayStr) return 'Hôm nay'
      return 'Theo ngày'
    }
    if (periodMode === 'range') {
      const todayStr = iso(new Date())
      const sevenDaysAgo = iso(new Date(new Date().setDate(new Date().getDate() - 6)))
      const firstOfMonth = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
      const firstOfLastMonth = iso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1))
      const lastOfLastMonth = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 0))

      if (startDate === sevenDaysAgo && endDate === todayStr) return '7 ngày qua'
      if (startDate === firstOfMonth && endDate === todayStr) return 'Tháng này'
      if (startDate === firstOfLastMonth && endDate === lastOfLastMonth) return 'Tháng trước'
      return 'Theo khoảng'
    }
    return 'Lọc thời gian'
  }, [periodMode, selectedDate, startDate, endDate])
  const [collapsedSections, setCollapsedSections] = useState<Set<PnlSection>>(
    () => new Set()
  )

  const period = useMemo<ReportPeriod>(() => {
    if (periodMode === 'all') {
      return {
        mode: 'all',
        start: null,
        end: null,
        days: null,
        label: 'Toàn thời gian',
        emptyLabel: 'toàn thời gian',
      }
    }

    const start = periodMode === 'daily' ? selectedDate : startDate
    const end = periodMode === 'daily' ? selectedDate : endDate
    const startObj = toDate(start)
    const endObj = toDate(end)
    const safeStart = startObj <= endObj ? startObj : endObj
    const safeEnd = startObj <= endObj ? endObj : startObj
    const days = Math.max(1, Math.round((safeEnd.getTime() - safeStart.getTime()) / 86400000) + 1)
    const label = periodMode === 'daily'
      ? formatPeriodDate(safeStart)
      : `${formatPeriodDate(safeStart)} - ${formatPeriodDate(safeEnd)}`
    return {
      mode: periodMode,
      start: safeStart,
      end: safeEnd,
      days,
      label,
      emptyLabel: periodMode === 'daily' ? 'ngày này' : 'khoảng thời gian này',
    }
  }, [endDate, periodMode, selectedDate, startDate])

  const filteredInvoices = useMemo(() => invoices.filter(invoice => {
    if (invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged') return false
    const date = toDate(getInvoiceDate(invoice))
    return isDateInPeriod(date, period)
  }), [invoices, period])

  const filteredCash = useMemo(() => cashTransactions.filter(item => {
    const date = toDate(item.transaction_date || item.created_at)
    return isDateInPeriod(date, period)
  }), [cashTransactions, period])

  const utilityCashInPaymentPeriod = useMemo(() => filteredCash.filter(item => {
    if (item.type !== 'expense') return false
    if (item.category !== 'electric' && item.category !== 'water') return false
    return true
  }), [filteredCash])

  const invoiceCashRows = useMemo<InvoiceCashRow[]>(() => invoices.flatMap(invoice => {
    if (invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged') return []
    return getInvoicePaymentRecords(invoice)
      .filter(record => {
        const date = toDate(record.payment_date || record.created_at)
        return isDateInPeriod(date, period)
      })
      .map(record => ({ invoice, record }))
  }), [invoices, period])

  const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
  const tenantById = useMemo(() => new Map(tenants.map(tenant => [tenant.id, tenant])), [tenants])
  const expenseCategories = useMemo(
    () => toExpenseOptions(DEFAULT_EXPENSE_CATEGORIES),
    []
  )

  const expenseByCategory = useMemo(() => {
    const map = new Map<CashTransactionCategory, number>()
    for (const category of expenseCategories) map.set(category.value, 0)
    for (const item of filteredCash) {
      if (item.type !== 'expense') continue
      map.set(item.category, (map.get(item.category) || 0) + item.amount)
    }
    return map
  }, [expenseCategories, filteredCash])

  const pnl = useMemo(() => {
    const sumExpense = expenseCategories.reduce((sum, item) => sum + (expenseByCategory.get(item.value) || 0), 0)
    const cashIncome = filteredCash.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)

    const cashCollected = invoiceCashRows.reduce((sum, item) => sum + item.record.amount, 0)
    const operatingRevenue = cashCollected + cashIncome

    const netProfit = operatingRevenue - sumExpense
    const margin = operatingRevenue > 0 ? (netProfit / operatingRevenue) * 100 : 0

    return {
      cashIncome,
      cashCollected,
      operatingRevenue,
      operatingCost: sumExpense,
      netProfit,
      margin,
      invoiceCount: filteredInvoices.length,
      cashCount: filteredCash.length + invoiceCashRows.length,
    }
  }, [expenseByCategory, expenseCategories, filteredCash, filteredInvoices, invoiceCashRows])

  const expenseRows: PnlRow[] = expenseCategories.map(item => ({
    key: `expense-${item.value}`,
    label: item.label,
    amount: -(expenseByCategory.get(item.value) || 0),
    section: 'opex',
    cashType: 'expense',
    cashCategory: item.value,
    indent: true,
  }))

  const rows: PnlRow[] = [
    { key: 'rev', label: 'A. Doanh thu thực thu', amount: pnl.operatingRevenue, section: 'revenue', group: true, color: 'text-emerald-700' },
    { key: 'invoiceCash', label: 'Thu từ hóa đơn (đã nhận)', amount: pnl.cashCollected, section: 'revenue', invoiceType: 'cash', indent: true },
    { key: 'cashIncome', label: 'Thu khác (chứng từ)', amount: pnl.cashIncome, section: 'revenue', cashType: 'income', indent: true },
    { key: 'cost', label: 'B. Chi phí vận hành thực tế', amount: -pnl.operatingCost, section: 'opex', group: true, color: 'text-red-700' },
    ...expenseRows,
    { key: 'net', label: 'C. Lợi nhuận thực (A − B)', amount: pnl.netProfit, section: 'result', total: true, color: pnl.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700' },
  ]

  const visibleRows = rows.filter(row => row.group || row.total || !collapsedSections.has(row.section))

  const drillInvoices = useMemo(() => {
    if (!drill || drill.mode !== 'invoice') return []
    if (drill.type === 'cash') return []
    return filteredInvoices.filter(invoice => getInvoiceDrillAmount(invoice, drill.type) !== 0)
  }, [drill, filteredInvoices])

  const drillInvoiceCashRows = useMemo(() => {
    if (!drill || drill.mode !== 'invoice' || drill.type !== 'cash') return []
    return invoiceCashRows
  }, [drill, invoiceCashRows])

  const drillCash = useMemo(() => {
    if (!drill || drill.mode !== 'cash') return []
    return filteredCash.filter(item =>
      item.type === drill.type &&
      (!drill.category || item.category === drill.category)
    )
  }, [drill, filteredCash])

  const drillTotal = drill?.mode === 'invoice'
    ? (drill.type === 'cash'
      ? drillInvoiceCashRows.reduce((sum, item) => sum + item.record.amount, 0)
      : drillInvoices.reduce((sum, invoice) => sum + getInvoiceDrillAmount(invoice, drill.type), 0))
    : drillCash.reduce((sum, item) => sum + item.amount, 0)

  const depositRows = useMemo(() => {
    return contracts
      .filter((c: Contract) => c.status === 'active' && (c.deposit_amount || 0) > 0)
      .map((c: Contract) => {
        const collected = getCollectedDepositAmount(c, invoices)
        return {
          contract: c,
          room: roomById.get(c.room_id),
          collected,
          missing: Math.max(0, Number(c.deposit_amount || 0) - collected),
        }
      })
      .sort((a, b) => (a.room?.name || '').localeCompare(b.room?.name || '', 'vi'))
  }, [contracts, invoices, roomById])

  const pendingRefundRows = useMemo(() => {
    return invoices
      .filter((invoice: Invoice) =>
        invoice.is_settlement &&
        invoice.payment_status !== 'cancelled' &&
        invoice.payment_status !== 'merged' &&
        Number(invoice.total_amount || 0) < 0 &&
        Number(invoice.paid_amount || 0) > Number(invoice.total_amount || 0)
      )
      .map((invoice: Invoice) => {
        const refundRemaining = Math.abs(Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0))
        const contract = contracts.find((c: Contract) => c.room_id === invoice.room_id && c.status !== 'active')
        return {
          invoice,
          contract,
          room: roomById.get(invoice.room_id),
          tenantName: tenantById.get(invoice.tenant_id)?.full_name || contract?.tenant_name || 'Không rõ',
          endDate: contract?.end_date || invoice.invoice_date || getInvoiceDate(invoice),
          refundRemaining,
        }
      })
      .sort((a, b) => (a.room?.name || '').localeCompare(b.room?.name || '', 'vi'))
  }, [contracts, invoices, roomById, tenantById])

  const depositSummary = useMemo(() => ({
    totalHeld: depositRows.reduce((s, r) => s + r.collected, 0),
    activeCount: depositRows.length,
    pendingRefund: pendingRefundRows.reduce((s, r) => s + r.refundRemaining, 0),
    pendingCount: pendingRefundRows.length,
  }), [depositRows, pendingRefundRows])

  // Computed values for utility reconciliation (Điện / Nước đối soát)
  const utilityData = useMemo(() => {
    let electricRevenue = 0
    let waterRevenue = 0
    let electricRevenueRoomsCount = 0
    let waterRevenueRoomsCount = 0

    // Room-by-room statistics
    const roomStatsMap = new Map<string, {
      roomId: string
      roomName: string
      tenantName: string
      electricRev: number
      waterRev: number
      electricUsage: number
      waterUsage: number
    }>()

    // Initialize map with all rooms so that we can show them
    for (const room of rooms) {
      roomStatsMap.set(room.id, {
        roomId: room.id,
        roomName: room.name,
        tenantName: room.tenant_name || 'Không có khách',
        electricRev: 0,
        waterRev: 0,
        electricUsage: 0,
        waterUsage: 0,
      })
    }

    const electricRevenueRoomIds = new Set<string>()
    const waterRevenueRoomIds = new Set<string>()
    const buildingStatsMap = new Map<string, UtilityBuildingRow>()
    const ensureBuilding = (building: string) => {
      if (!buildingStatsMap.has(building)) {
        buildingStatsMap.set(building, {
          building,
          electricRevenue: 0,
          waterRevenue: 0,
          electricExpense: 0,
          waterExpense: 0,
          electricRevenueRoomIds: new Set<string>(),
          waterRevenueRoomIds: new Set<string>(),
          electricUtilityRoomIds: new Set<string>(),
          waterUtilityRoomIds: new Set<string>(),
        })
      }
      return buildingStatsMap.get(building)!
    }

    // Process utility invoices for actual collected / settled revenue in the selected period.
    for (const invoice of invoices) {
      if (invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged') continue
      const collectionRatio = getUtilityCollectionRatio(invoice)
      const invoicePeriodDate = getInvoicePeriodDate(invoice)
      const electricInScope = isDateInPeriod(invoicePeriodDate, period)
      const waterInScope = isDateInPeriod(invoicePeriodDate, period)
      const invoiceElectricCost = (invoice.electric_cost || 0) + (invoice.transfer_electric_cost || 0)
      const invoiceWaterCost = (invoice.water_cost || 0) + (invoice.transfer_water_cost || 0)
      const elecCost = electricInScope
        ? invoiceElectricCost * collectionRatio
        : 0
      const watCost = waterInScope
        ? invoiceWaterCost * collectionRatio
        : 0
      const hasElectricInScope = electricInScope && invoiceElectricCost > 0
      const hasWaterInScope = waterInScope && invoiceWaterCost > 0
      if (!hasElectricInScope && !hasWaterInScope) continue

      const room = roomById.get(invoice.room_id)
      const buildingStats = ensureBuilding(getBuildingKeyFromRoomName(room?.name))
      if (hasElectricInScope) buildingStats.electricUtilityRoomIds.add(invoice.room_id)
      if (hasWaterInScope) buildingStats.waterUtilityRoomIds.add(invoice.room_id)
      if (elecCost === 0 && watCost === 0) continue

      electricRevenue += elecCost
      waterRevenue += watCost

      if (elecCost > 0) electricRevenueRoomIds.add(invoice.room_id)
      if (watCost > 0) waterRevenueRoomIds.add(invoice.room_id)
      buildingStats.electricRevenue += elecCost
      buildingStats.waterRevenue += watCost
      if (elecCost > 0) buildingStats.electricRevenueRoomIds.add(invoice.room_id)
      if (watCost > 0) buildingStats.waterRevenueRoomIds.add(invoice.room_id)

      const stats = roomStatsMap.get(invoice.room_id)
      if (stats) {
        if (isRoomUtilityDisplayInvoice(invoice)) {
          stats.electricRev += electricInScope ? (invoice.electric_cost || 0) * collectionRatio : 0
          stats.waterRev += waterInScope ? (invoice.water_cost || 0) * collectionRatio : 0
          stats.electricUsage += electricInScope ? invoice.electric_usage || 0 : 0
          stats.waterUsage += waterInScope ? invoice.water_usage || 0 : 0
        }
        if (invoice.tenant_id) {
          const tenant = tenantById.get(invoice.tenant_id)
          if (tenant) {
            stats.tenantName = tenant.full_name
          }
        }
      }
    }

    electricRevenueRoomsCount = electricRevenueRoomIds.size
    waterRevenueRoomsCount = waterRevenueRoomIds.size

    // Process utility expenses by payment date in the selected report period
    let electricExpense = 0
    let waterExpense = 0

    for (const cash of utilityCashInPaymentPeriod) {
      if (cash.type === 'expense') {
        const cashRoom = cash.room_id ? roomById.get(cash.room_id) : null
        const buildingStats = ensureBuilding(cashRoom ? getBuildingKeyFromRoomName(cashRoom.name) : getBuildingKeyFromCash(cash))
        if (cash.category === 'electric') {
          electricExpense += cash.amount
          buildingStats.electricExpense += cash.amount
        } else if (cash.category === 'water') {
          waterExpense += cash.amount
          buildingStats.waterExpense += cash.amount
        }
      }
    }

    // Delta calculations
    const electricDelta = electricRevenue - electricExpense
    const waterDelta = waterRevenue - waterExpense

    const electricPct = electricExpense > 0 ? (electricDelta / electricExpense) * 100 : 0
    const waterPct = waterExpense > 0 ? (waterDelta / waterExpense) * 100 : 0

    // Convert room stats map to sorted list
    const roomList = Array.from(roomStatsMap.values())
      .filter(item => item.electricRev > 0 || item.waterRev > 0 || item.electricUsage > 0 || item.waterUsage > 0)
      .sort((a, b) => b.electricRev - a.electricRev)
    const buildingList = Array.from(buildingStatsMap.values())
      .filter(item => item.electricRevenue > 0 || item.waterRevenue > 0 || item.electricExpense > 0 || item.waterExpense > 0)
      .sort((a, b) => a.building.localeCompare(b.building, 'vi-VN', { numeric: true }))

    return {
      electricRevenue,
      waterRevenue,
      electricExpense,
      waterExpense,
      electricDelta,
      waterDelta,
      electricPct,
      waterPct,
      electricRevenueRoomsCount,
      waterRevenueRoomsCount,
      roomList,
      buildingList,
    }
  }, [invoices, period, roomById, rooms, tenantById, utilityCashInPaymentPeriod])

  const toggleSection = (section: PnlSection) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const filteredUtilityRooms = useMemo(() => {
    const keyword = normalizeSearch(roomUtilitySearch.trim())
    if (!keyword) return utilityData.roomList

    return utilityData.roomList.filter(item => {
      const haystack = normalizeSearch(`${item.roomName} ${item.tenantName}`)
      return haystack.includes(keyword)
    })
  }, [roomUtilitySearch, utilityData.roomList])

  const buildingUtilityRows = useMemo(() => {
    if (!buildingDrill) return []
    const buildingKey = normalizeSearch(buildingDrill.building)
    return utilityData.roomList
      .filter((item) => {
        const room = rooms.find((r) => r.id === item.roomId)
        return normalizeSearch(getBuildingKeyFromRoomName(room?.name || item.roomName)) === buildingKey
      })
      .sort((a, b) =>
        buildingDrill.utility === 'electric'
          ? b.electricRev - a.electricRev
          : b.waterRev - a.waterRev
      )
  }, [buildingDrill, rooms, utilityData.roomList])


  const periodSummary = period.mode === 'all'
    ? `${period.label} | ${pnl.invoiceCount} hóa đơn | ${pnl.cashCount} chứng từ`
    : `${period.days} ngày | ${pnl.invoiceCount} hóa đơn | ${pnl.cashCount} chứng từ`

  const openRowDrill = (row: PnlRow) => {
    setBuildingDrill(null)
    if (row.invoiceType) setDrill({ mode: 'invoice', type: row.invoiceType, title: row.label })
    if (row.cashType) setDrill({ mode: 'cash', type: row.cashType, category: row.cashCategory, title: row.label })
  }

  const openBuildingDrill = (building: string, utility: 'electric' | 'water') => {
    setDrill(null)
    setBuildingDrill({
      building,
      utility,
      title:
        utility === 'electric'
          ? `Chi tiết thu tiền điện - ${building}`
          : `Chi tiết thu tiền nước - ${building}`
    })
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f6f8] p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'overview' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <i className="fa-solid fa-chart-pie mr-2"></i>Tổng quát
          </button>
          <button
            onClick={() => setActiveTab('pnl')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'pnl' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <i className="fa-solid fa-table-list mr-2"></i>Kết quả kinh doanh
          </button>
          <button
            onClick={() => setActiveTab('deposit')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'deposit' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <i className="fa-solid fa-vault mr-2"></i>Quản lý cọc
            {depositSummary.pendingCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">{depositSummary.pendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('cashflow')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'cashflow' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <i className="fa-solid fa-wallet mr-2"></i>Thu / Chi
          </button>
          <button
            onClick={() => setActiveTab('utility')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'utility' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <i className="fa-solid fa-right-left mr-2"></i>Điện / Nước
          </button>
        </div>

        <div ref={dropdownRef} className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={handleOpenToggle}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm rounded-xl px-3 py-2 text-xs font-bold text-slate-700 transition cursor-pointer select-none"
            >
              <i className="fa-regular fa-calendar text-primary text-sm"></i>
              <span>{activePresetLabel}</span>
              <i className="fa-solid fa-chevron-down text-[10px] text-slate-400 ml-1"></i>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-[460px] rounded-2xl border border-slate-100 bg-white shadow-2xl z-[99] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <i className="fa-solid fa-clock-rotate-left text-slate-400"></i>
                    Bộ lọc thời gian báo cáo
                  </span>
                </div>

                <div className="flex flex-1 min-h-[190px]">
                  <div className="w-[160px] border-r border-slate-100 p-2 bg-slate-50/30 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => selectPreset('all')}
                      className={`w-full text-left px-2.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${tempPeriodMode === 'all' ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100/50'}`}
                    >
                      Toàn thời gian
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('month')}
                      className={`w-full text-left px-2.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${tempPeriodMode === 'range' && tempStartDate === iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) && tempEndDate === iso(new Date()) ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100/50'}`}
                    >
                      Tháng này
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('last_month')}
                      className={`w-full text-left px-2.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${tempPeriodMode === 'range' && tempStartDate === iso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)) && tempEndDate === iso(new Date(new Date().getFullYear(), new Date().getMonth(), 0)) ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100/50'}`}
                    >
                      Tháng trước
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('today')}
                      className={`w-full text-left px-2.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${tempPeriodMode === 'daily' && tempSelectedDate === iso(new Date()) ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100/50'}`}
                    >
                      Hôm nay
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('week')}
                      className={`w-full text-left px-2.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${tempPeriodMode === 'range' && tempStartDate === iso(new Date(new Date().setDate(new Date().getDate() - 6))) && tempEndDate === iso(new Date()) ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100/50'}`}
                    >
                      7 ngày gần đây
                    </button>

                    <div className="h-px bg-slate-100 my-1"></div>

                    <button
                      type="button"
                      onClick={() => selectPreset('custom_daily')}
                      className={`w-full text-left px-2.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${tempPeriodMode === 'daily' && tempSelectedDate !== iso(new Date()) ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100/50'}`}
                    >
                      Tùy chỉnh ngày
                    </button>

                    <button
                      type="button"
                      onClick={() => selectPreset('custom_range')}
                      className={`w-full text-left px-2.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${tempPeriodMode === 'range' && !(tempStartDate === iso(new Date(new Date().setDate(new Date().getDate() - 6))) && tempEndDate === iso(new Date())) && !(tempStartDate === iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) && tempEndDate === iso(new Date())) ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100/50'}`}
                    >
                      Tùy chỉnh khoảng
                    </button>
                  </div>

                  <div className="flex-1 p-4 flex flex-col justify-center">
                    {tempPeriodMode === 'all' && (
                      <div className="text-center text-slate-400 py-6">
                        <i className="fa-solid fa-globe text-3xl mb-2 opacity-40"></i>
                        <p className="text-xs font-semibold">Lọc toàn bộ lịch sử dữ liệu</p>
                        <p className="text-[10px] text-slate-300 mt-0.5">Không giới hạn thời gian báo cáo</p>
                      </div>
                    )}

                    {tempPeriodMode === 'daily' && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Chọn ngày báo cáo</label>
                        <input
                          type="date"
                          value={tempSelectedDate}
                          onChange={e => setTempSelectedDate(e.target.value)}
                          onClick={e => e.currentTarget.showPicker()}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary focus:border-primary transition bg-slate-50/50 focus:bg-white cursor-pointer"
                        />
                      </div>
                    )}

                    {tempPeriodMode === 'range' && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Từ ngày</label>
                          <input
                            type="date"
                            value={tempStartDate}
                            onChange={e => setTempStartDate(e.target.value)}
                            onClick={e => e.currentTarget.showPicker()}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary focus:border-primary transition bg-slate-50/50 focus:bg-white cursor-pointer"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Đến ngày</label>
                          <input
                            type="date"
                            value={tempEndDate}
                            onChange={e => setTempEndDate(e.target.value)}
                            onClick={e => e.currentTarget.showPicker()}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary focus:border-primary transition bg-slate-50/50 focus:bg-white cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 flex justify-end items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-dark shadow-sm hover:shadow transition cursor-pointer"
                  >
                    Áp dụng
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block"></div>

          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 text-slate-500 font-semibold text-xs shrink-0 select-none">
            <i className="fa-regular fa-calendar-check text-slate-400 text-sm"></i>
            <span>{periodSummary}</span>
          </div>
        </div>
      </div>

      {activeTab === 'overview' && (
        <OverviewTab period={period} />
      )}

      {activeTab === 'cashflow' && (
        <CashFlowTab embedded currentUser={currentUser} onNavigateToInvoices={onNavigateToInvoices} period={period} />
      )}

      {activeTab === 'deposit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Đang giữ cọc</p>
              <p className="text-2xl font-black text-emerald-700">{fmt(depositSummary.totalHeld)} đ</p>
              <p className="text-xs text-slate-400 mt-1">{depositSummary.activeCount} phòng đang thuê</p>
            </div>
            <div className={`bg-white rounded-xl border shadow-sm p-5 ${depositSummary.pendingCount > 0 ? 'border-red-200' : 'border-slate-200'}`}>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Chờ hoàn cọc</p>
              <p className={`text-2xl font-black ${depositSummary.pendingCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmt(depositSummary.pendingRefund)} đ</p>
              <p className="text-xs text-slate-400 mt-1">{depositSummary.pendingCount} hợp đồng đã kết thúc</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900 flex items-center gap-2">
                <i className="fa-solid fa-vault text-primary"></i>
                Cọc đang giữ — phòng hiện tại
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3">Phòng</th>
                  <th className="text-left px-5 py-3">Khách thuê</th>
                  <th className="text-left px-5 py-3">Ngày vào</th>
                  <th className="text-right px-5 py-3">Đã thu / thỏa thuận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {depositRows.map(({ contract, room, collected, missing }) => (
                  <tr key={contract.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-bold text-slate-800">{room?.name || 'Không rõ'}</td>
                    <td className="px-5 py-3 text-slate-700">{contract.tenant_name}</td>
                    <td className="px-5 py-3 text-slate-500">{new Date(contract.move_in_date).toLocaleDateString('vi-VN')}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="font-black tabular-nums text-slate-800">{fmt(collected)} / {fmt(contract.deposit_amount)} đ</div>
                      <div className={`text-[11px] font-bold ${missing > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {missing > 0 ? `Còn thiếu ${fmt(missing)} đ` : 'Đã thu đủ'}
                      </div>
                    </td>
                  </tr>
                ))}
                {depositRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-slate-400">Không có phòng nào đang giữ cọc.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pendingRefundRows.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-red-100 bg-red-50/50">
                <h2 className="font-black text-red-700 flex items-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  Chờ hoàn cọc — hợp đồng đã kết thúc ({pendingRefundRows.length})
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-5 py-3">Phòng</th>
                    <th className="text-left px-5 py-3">Khách thuê</th>
                    <th className="text-left px-5 py-3">Ngày kết thúc</th>
                    <th className="text-right px-5 py-3">Cọc cần hoàn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingRefundRows.map(({ invoice, room, tenantName, endDate, refundRemaining }) => (
                    <tr key={invoice.id} className="hover:bg-red-50/30">
                      <td className="px-5 py-3 font-bold text-slate-800">{room?.name || 'Không rõ'}</td>
                      <td className="px-5 py-3 text-slate-700">{tenantName}</td>
                      <td className="px-5 py-3 text-slate-500">{endDate ? new Date(endDate).toLocaleDateString('vi-VN') : '—'}</td>
                      <td className="px-5 py-3 text-right font-black tabular-nums text-red-600">{fmt(refundRemaining)} đ</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pnl' && <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-900 flex items-center gap-2">
            <i className="fa-solid fa-table-list text-primary"></i>
            Bảng Kết quả Kinh doanh (P&L)
          </h2>
          <span className="text-xs text-slate-400">Click số tiền để xem chi tiết</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-5 py-3">Hạng mục</th>
              <th className="text-right px-5 py-3">Số tiền</th>
              <th className="text-center px-5 py-3">% DT</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const pct = pnl.operatingRevenue ? Math.abs(row.amount) / pnl.operatingRevenue * 100 : 0
              const isCollapsed = collapsedSections.has(row.section)
              const canDrill = !!row.invoiceType || !!row.cashType
              return (
                <tr key={row.key} className={`${row.group || row.total ? 'bg-slate-50 font-bold' : 'border-t border-slate-100'} ${row.total ? 'text-base' : ''}`}>
                  <td className={`px-5 py-3 ${row.group || row.total ? row.color : 'text-slate-700'} ${row.indent ? 'pl-10' : ''}`}>
                    {row.group ? (
                      <button onClick={() => toggleSection(row.section)} className={`flex items-center gap-2 font-black ${row.color}`}>
                        <i className={`fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'} text-[10px]`}></i>
                        {row.label}
                      </button>
                    ) : row.label}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {canDrill ? (
                      <button onClick={() => openRowDrill(row)} className={`${row.color || (row.amount < 0 ? 'text-red-600' : 'text-slate-900')} font-bold border-b border-dashed border-slate-300 hover:border-primary`}>
                        {row.amount < 0 ? '-' : ''}{fmt(Math.abs(row.amount))} đ <i className="fa-regular fa-eye text-[10px] opacity-50 ml-1"></i>
                      </button>
                    ) : (
                      <span className={`${row.color || (row.amount < 0 ? 'text-red-600' : 'text-slate-900')} font-black`}>
                        {row.amount < 0 ? '-' : ''}{fmt(Math.abs(row.amount))} đ
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {row.key === 'rev' ? (
                      <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-black">100%</span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 font-bold">{pct.toFixed(1)}%</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {drill && (
        <div className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDrill(null)}>
          <div className="w-full max-w-6xl max-h-[86vh] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-slate-900">{drill.title}</h3>
                <p className="text-xs text-slate-500">Tổng hạng mục: {fmt(drillTotal)} đ</p>
              </div>
              <button onClick={() => setDrill(null)} className="w-9 h-9 rounded-full hover:bg-slate-200 text-slate-500 transition">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="overflow-auto">
              {drill.mode === 'invoice' && drill.type !== 'cash' ? (
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="text-left px-5 py-3">Ngày</th>
                      <th className="text-left px-5 py-3">Phòng</th>
                      <th className="text-left px-5 py-3">Khách thuê</th>
                      <th className="text-left px-5 py-3">Loại phiếu</th>
                      <th className="text-right px-5 py-3">Giá trị hạng mục</th>
                      <th className="text-right px-5 py-3">Tổng phiếu</th>
                      <th className="text-right px-5 py-3">Đã thu</th>
                      <th className="text-center px-5 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drillInvoices.map(invoice => {
                      const amount = getInvoiceDrillAmount(invoice, drill.type)
                      return (
                        <tr key={invoice.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3 font-semibold text-slate-600">{new Date(getInvoiceDate(invoice)).toLocaleDateString('vi-VN')}</td>
                          <td className="px-5 py-3 font-bold text-slate-800">{roomById.get(invoice.room_id)?.name || 'Không rõ'}</td>
                          <td className="px-5 py-3 text-slate-600">{tenantById.get(invoice.tenant_id)?.full_name || 'Không rõ'}</td>
                          <td className="px-5 py-3 text-slate-600">{invoice.is_settlement ? 'Tất toán' : invoice.is_first_month ? 'Tháng đầu' : invoice.billing_reason || 'Hàng tháng'}</td>
                          <td className={`px-5 py-3 text-right font-black tabular-nums ${amount < 0 ? 'text-red-600' : 'text-primary'}`}>{amount < 0 ? '-' : ''}{fmt(Math.abs(amount))} đ</td>
                          <td className="px-5 py-3 text-right font-black tabular-nums">{fmt(invoice.total_amount)} đ</td>
                          <td className="px-5 py-3 text-right font-bold text-emerald-700 tabular-nums">{fmt(invoice.paid_amount)} đ</td>
                          <td className="px-5 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-[11px] font-black ${invoice.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : invoice.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                              {invoice.payment_status === 'paid' ? 'Đã thu' : invoice.payment_status === 'partial' ? 'Thu một phần' : 'Chưa thu'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {drillInvoices.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-12 text-center text-slate-400">Không có dữ liệu chi tiết trong kỳ này.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : drill.mode === 'invoice' ? (
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="text-left px-5 py-3">Ngày thu</th>
                      <th className="text-left px-5 py-3">Phòng</th>
                      <th className="text-left px-5 py-3">Khách thuê</th>
                      <th className="text-left px-5 py-3">Kỳ hóa đơn</th>
                      <th className="text-left px-5 py-3">Phương thức</th>
                      <th className="text-right px-5 py-3">Số tiền thu</th>
                      <th className="text-left px-5 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drillInvoiceCashRows.map(({ invoice, record }) => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-semibold text-slate-600">{new Date(record.payment_date).toLocaleDateString('vi-VN')}</td>
                        <td className="px-5 py-3 font-bold text-slate-800">{roomById.get(invoice.room_id)?.name || 'Không rõ'}</td>
                        <td className="px-5 py-3 text-slate-600">{tenantById.get(invoice.tenant_id)?.full_name || 'Không rõ'}</td>
                        <td className="px-5 py-3 text-slate-600">T{String(invoice.month).padStart(2, '0')}/{invoice.year}</td>
                        <td className="px-5 py-3 text-slate-600">{record.payment_method === 'cash' ? 'Tiền mặt' : record.payment_method === 'transfer' ? 'Chuyển khoản' : '—'}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700 tabular-nums">{fmt(record.amount)} đ</td>
                        <td className="px-5 py-3 text-slate-500">{record.note || invoice.note || '—'}</td>
                      </tr>
                    ))}
                    {drillInvoiceCashRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center text-slate-400">Không có dữ liệu thu tiền trong kỳ này.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="text-left px-5 py-3">Ngày</th>
                      <th className="text-left px-5 py-3">Loại</th>
                      <th className="text-left px-5 py-3">Nhóm</th>
                      <th className="text-left px-5 py-3">Phòng</th>
                      <th className="text-right px-5 py-3">Số tiền</th>
                      <th className="text-left px-5 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drillCash.map((item: CashTransaction) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-semibold text-slate-600">{new Date(item.transaction_date).toLocaleDateString('vi-VN')}</td>
                        <td className="px-5 py-3 font-bold">{item.type === 'income' ? 'Thu' : 'Chi'}</td>
                        <td className="px-5 py-3 text-slate-700">{categoryLabel(item.category, expenseCategories)}</td>
                        <td className="px-5 py-3 text-slate-600">{item.room_id ? roomById.get(item.room_id)?.name || 'Không rõ' : 'Không gắn phòng'}</td>
                        <td className={`px-5 py-3 text-right font-black tabular-nums ${item.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {item.type === 'expense' ? '-' : ''}{fmt(item.amount)} đ
                        </td>
                        <td className="px-5 py-3 text-slate-500">{item.note || '—'}</td>
                      </tr>
                    ))}
                    {drillCash.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-400">Không có chứng từ trong kỳ này.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      </>}

      {activeTab === 'utility' && (
        <div className="space-y-6">
          {/* SECTION TITLE */}
          <div>
            <h2 className="text-xl font-black font-outfit text-slate-900 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-[10px] shadow-sm shadow-emerald-500/20">
                <i className="fa-solid fa-right-left"></i>
              </div>
              Đối soát chênh lệch Điện & Nước
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">Đối chiếu A Thu thực tế từ khách trọ với B Chi điện/nước theo kỳ sử dụng.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* CARD 1: ELECTRICITY */}
            <div className="bg-gradient-to-br from-white via-white to-amber-500/[0.04] rounded-3xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[190px] group transition-all duration-300 hover:border-amber-400/60 hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-1">
              <div className="flex items-start justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-white flex items-center justify-center text-xl shadow-lg shadow-amber-500/30 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <i className="fa-solid fa-bolt"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-black font-outfit text-amber-800 flex items-center gap-1.5 transition-colors duration-300 group-hover:text-amber-950">⚡ Tiền Điện dịch vụ</h3>
                    <p className="text-[9px] text-slate-400 font-extrabold mt-0.5 tracking-wider uppercase">A Thu thực tế - B Chi theo kỳ</p>
                  </div>
                </div>
                
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-wide border shadow-md transition-all duration-300 ${utilityData.electricDelta >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-emerald-500/[0.08]' : 'bg-rose-50 border-rose-200 text-rose-600 shadow-rose-500/[0.08]'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${utilityData.electricDelta >= 0 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`}></span>
                  {utilityData.electricDelta >= 0 ? `Thặng dư: +${utilityData.electricPct.toFixed(1)}%` : `Cần bù lỗ: ${utilityData.electricPct.toFixed(1)}%`}
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-slate-50/90 to-slate-100/40 rounded-2xl p-4 grid grid-cols-2 gap-4 mt-5 border border-slate-200/50 shadow-inner z-10 group-hover:border-amber-200/50 transition-colors duration-300">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-amber-700/80 uppercase tracking-widest block">A Thu thực tế</span>
                  <span className="text-lg font-black text-amber-950 tabular-nums">{fmt(utilityData.electricRevenue)} đ</span>
                  <span className="text-[9px] text-slate-500 block font-semibold mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span> {utilityData.electricRevenueRoomsCount} phòng đóng nộp
                  </span>
                </div>
                <div className="space-y-0.5 border-l border-slate-300/80 pl-5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">B Chi</span>
                  <span className="text-lg font-black text-slate-700 tabular-nums">{fmt(utilityData.electricExpense)} đ</span>
                  <span className="text-[9px] text-slate-500 block font-semibold mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block"></span> Hóa đơn nhà nước
                  </span>
                </div>
              </div>

              <div className="h-px bg-slate-200/60 my-4"></div>

              <div className={`flex items-center justify-between text-xs p-3.5 rounded-2xl border transition-all duration-300 z-10 ${utilityData.electricDelta >= 0 ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/30 border-emerald-200 shadow-sm' : 'bg-gradient-to-r from-rose-50 to-rose-100/30 border-rose-200 shadow-sm'}`}>
                <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">Mức chênh lệch {utilityData.electricDelta >= 0 ? 'dư' : 'thiếu'}:</span>
                <span className={`font-black text-sm font-outfit tabular-nums ${utilityData.electricDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {utilityData.electricDelta >= 0 ? '+' : ''}{fmt(utilityData.electricDelta)} đ
                </span>
              </div>
            </div>

            {/* CARD 2: WATER */}
            <div className="bg-gradient-to-br from-white via-white to-sky-500/[0.04] rounded-3xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[190px] group transition-all duration-300 hover:border-sky-400/60 hover:shadow-lg hover:shadow-sky-500/10 hover:-translate-y-1">
              <div className="flex items-start justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-400 via-sky-500 to-blue-500 text-white flex items-center justify-center text-xl shadow-lg shadow-sky-500/30 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6">
                    <i className="fa-solid fa-droplet"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-black font-outfit text-sky-800 flex items-center gap-1.5 transition-colors duration-300 group-hover:text-sky-950">💧 Tiền Nước sinh hoạt</h3>
                    <p className="text-[9px] text-slate-400 font-extrabold mt-0.5 tracking-wider uppercase">A Thu thực tế - B Chi theo kỳ</p>
                  </div>
                </div>
                
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-wide border shadow-md transition-all duration-300 ${utilityData.waterDelta >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-emerald-500/[0.08]' : 'bg-rose-50 border-rose-200 text-rose-600 shadow-rose-500/[0.08]'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${utilityData.waterDelta >= 0 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`}></span>
                  {utilityData.waterDelta >= 0 ? `Thặng dư: +${utilityData.waterPct.toFixed(1)}%` : `Cần bù lỗ: ${utilityData.waterPct.toFixed(1)}%`}
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-slate-50/90 to-slate-100/40 rounded-2xl p-4 grid grid-cols-2 gap-4 mt-5 border border-slate-200/50 shadow-inner z-10 group-hover:border-sky-200/50 transition-colors duration-300">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-sky-700 uppercase tracking-widest block">A Thu thực tế</span>
                  <span className="text-lg font-black text-sky-950 tabular-nums">{fmt(utilityData.waterRevenue)} đ</span>
                  <span className="text-[9px] text-slate-500 block font-semibold mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span> {utilityData.waterRevenueRoomsCount} phòng đóng nộp
                  </span>
                </div>
                <div className="space-y-0.5 border-l border-slate-300 pl-5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">B Chi</span>
                  <span className="text-lg font-black text-slate-700 tabular-nums">{fmt(utilityData.waterExpense)} đ</span>
                  <span className="text-[9px] text-slate-500 block font-semibold mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-sky-500 rounded-full inline-block"></span> Hóa đơn nhà nước
                  </span>
                </div>
              </div>

              <div className="h-px bg-slate-200/60 my-4"></div>

              <div className={`flex items-center justify-between text-xs p-3.5 rounded-2xl border transition-all duration-300 z-10 ${utilityData.waterDelta >= 0 ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/30 border-emerald-200 shadow-sm' : 'bg-gradient-to-r from-rose-50 to-rose-100/30 border-rose-200 shadow-sm'}`}>
                <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">Mức chênh lệch {utilityData.waterDelta >= 0 ? 'dư' : 'thiếu'}:</span>
                <span className={`font-black text-sm font-outfit tabular-nums ${utilityData.waterDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {utilityData.waterDelta >= 0 ? '+' : ''}{fmt(utilityData.waterDelta)} đ
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
            <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-slate-100">
              
              <div className="flex flex-col">
                <div className="px-6 py-3 bg-gradient-to-r from-amber-500/[0.04] to-amber-500/[0.01] border-b border-amber-100/40 flex items-center justify-between">
                  <span className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>⚡ Phân tích Tiền Điện theo tòa
                  </span>
                  <span className="text-[9px] font-extrabold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow-sm">Điện dịch vụ</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-500/[0.03] text-[10px] uppercase tracking-wider text-amber-700/80 font-black border-b border-amber-100/50">
                      <tr>
                        <th className="text-left px-6 py-3.5">Tòa</th>
                        <th className="text-right px-4 py-3.5">A Thu Điện</th>
                        <th className="text-right px-4 py-3.5">B Chi Điện</th>
                        <th className="text-right px-4 py-3.5">Lãi / Lỗ</th>
                        <th className="text-center px-6 py-3.5">Đánh giá</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100/30 font-medium text-slate-600">
                      {utilityData.buildingList.map(row => {
                        const electricDelta = row.electricRevenue - row.electricExpense
                        const electricPct = row.electricExpense > 0 ? (electricDelta / row.electricExpense) * 100 : 0
                        return (
                          <tr
                            key={row.building}
                            className="hover:bg-amber-500/[0.02] transition duration-150 cursor-pointer"
                            onClick={() => openBuildingDrill(row.building, 'electric')}
                          >
                            <td className="px-6 py-4 font-black text-amber-900">{row.building}</td>
                            <td className="px-4 py-4 text-right font-bold text-slate-800 tabular-nums">{fmt(row.electricRevenue)} đ</td>
                            <td className="px-4 py-4 text-right font-bold text-slate-500 tabular-nums">{fmt(row.electricExpense)} đ</td>
                            <td className={`px-4 py-4 text-right font-black tabular-nums ${electricDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {electricDelta >= 0 ? '+' : ''}{fmt(electricDelta)} đ
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border inline-block ${electricDelta >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-sm shadow-emerald-500/[0.02]' : 'bg-rose-50 border-rose-100 text-rose-600 shadow-sm shadow-rose-500/[0.02]'}`}>
                                {electricDelta >= 0 ? `Lời ${electricPct.toFixed(1)}%` : `Lỗ ${Math.abs(electricPct).toFixed(1)}%`}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {utilityData.buildingList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-xs font-semibold text-amber-700/60">
                            Chưa có dữ liệu điện theo tòa.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col">
                <div className="px-6 py-3 bg-gradient-to-r from-sky-500/[0.04] to-sky-500/[0.01] border-b border-sky-100/40 flex items-center justify-between">
                  <span className="text-xs font-black text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>💧 Phân tích Tiền Nước theo tòa
                  </span>
                  <span className="text-[9px] font-extrabold text-sky-600 bg-sky-50 border border-sky-100 px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow-sm">Nước sinh hoạt</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-sky-500/[0.03] text-[10px] uppercase tracking-wider text-sky-700/80 font-black border-b border-sky-100/50">
                      <tr>
                        <th className="text-left px-6 py-3.5">Tòa</th>
                        <th className="text-right px-4 py-3.5">A Thu Nước</th>
                        <th className="text-right px-4 py-3.5">B Chi Nước</th>
                        <th className="text-right px-4 py-3.5">Lãi / Lỗ</th>
                        <th className="text-center px-6 py-3.5">Đánh giá</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100/30 font-medium text-slate-600">
                      {utilityData.buildingList.map(row => {
                        const waterDelta = row.waterRevenue - row.waterExpense
                        const waterPct = row.waterExpense > 0 ? (waterDelta / row.waterExpense) * 100 : 0
                        return (
                          <tr
                            key={row.building}
                            className="hover:bg-sky-500/[0.02] transition duration-150 cursor-pointer"
                            onClick={() => openBuildingDrill(row.building, 'water')}
                          >
                            <td className="px-6 py-4 font-black text-sky-900">{row.building}</td>
                            <td className="px-4 py-4 text-right font-bold text-slate-800 tabular-nums">{fmt(row.waterRevenue)} đ</td>
                            <td className="px-4 py-4 text-right font-bold text-slate-500 tabular-nums">{fmt(row.waterExpense)} đ</td>
                            <td className={`px-4 py-4 text-right font-black tabular-nums ${waterDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {waterDelta >= 0 ? '+' : ''}{fmt(waterDelta)} đ
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border inline-block ${waterDelta >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-sm shadow-emerald-500/[0.02]' : 'bg-rose-50 border-rose-100 text-rose-600 shadow-sm shadow-rose-500/[0.02]'}`}>
                                {waterDelta >= 0 ? `Lời ${waterPct.toFixed(1)}%` : `Lỗ ${Math.abs(waterPct).toFixed(1)}%`}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {utilityData.buildingList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-xs font-semibold text-sky-600/60">
                            Chưa có dữ liệu nước theo tòa.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="bg-white rounded-3xl border border-slate-200/85 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-slate-100/40">
                  <h3 className="font-bold font-outfit text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <i className="fa-solid fa-list-check text-emerald-500"></i>
                    Bảng phân tích đối soát chi tiết
                  </h3>
                  <span className="text-[9px] text-slate-500 font-extrabold bg-white border border-slate-200 px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-sm">Cân đối thu - chi</span>
                </div>
                
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/50 text-[10px] uppercase tracking-wider text-slate-400 font-black border-b border-slate-100/80">
                    <tr>
                      <th className="text-left px-6 py-3.5">Hạng Mục Lọc</th>
                      <th className="text-right px-6 py-3.5">A Thu</th>
                      <th className="text-right px-6 py-3.5">B Chi</th>
                      <th className="text-right px-6 py-3.5">Chênh lệch (A - B)</th>
                      <th className="text-center px-6 py-3.5">Đánh giá</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                    <tr className="hover:bg-amber-100/60 bg-amber-500/[0.003] hover:scale-[1.003] active:scale-[0.997] transition-all duration-200 cursor-pointer group/comp">
                      <td className="px-6 py-4 font-bold text-amber-800 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 block shadow-md shadow-amber-500/60 animate-pulse"></span>⚡ Tiền điện phòng trọ
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 group-hover/comp:text-amber-800 transition-colors tabular-nums">{fmt(utilityData.electricRevenue)} đ</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 tabular-nums">{fmt(utilityData.electricExpense)} đ</td>
                      <td className={`px-6 py-4 text-right font-black tabular-nums ${utilityData.electricDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {utilityData.electricDelta >= 0 ? '+' : ''}{fmt(utilityData.electricDelta)} đ
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border inline-block ${utilityData.electricDelta >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-sm shadow-emerald-500/[0.02]' : 'bg-rose-50 border-rose-100 text-rose-600 shadow-sm shadow-rose-500/[0.02]'}`}>
                          {utilityData.electricDelta >= 0 ? `Lời ${utilityData.electricPct.toFixed(1)}%` : `Lỗ ${utilityData.electricPct.toFixed(1)}%`}
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-sky-100/60 bg-sky-500/[0.003] hover:scale-[1.003] active:scale-[0.997] transition-all duration-200 cursor-pointer group/comp">
                      <td className="px-6 py-4 font-bold text-sky-800 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-500 block shadow-md shadow-sky-500/60 animate-pulse"></span>💧 Tiền nước sinh hoạt
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 group-hover/comp:text-sky-800 transition-colors tabular-nums">{fmt(utilityData.waterRevenue)} đ</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 tabular-nums">{fmt(utilityData.waterExpense)} đ</td>
                      <td className={`px-6 py-4 text-right font-black tabular-nums ${utilityData.waterDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {utilityData.waterDelta >= 0 ? '+' : ''}{fmt(utilityData.waterDelta)} đ
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border inline-block ${utilityData.waterDelta >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-sm shadow-emerald-500/[0.02]' : 'bg-rose-50 border-rose-100 text-rose-600 shadow-sm shadow-rose-500/[0.02]'}`}>
                          {utilityData.waterDelta >= 0 ? `Lời ${utilityData.waterPct.toFixed(1)}%` : `Lỗ ${utilityData.waterPct.toFixed(1)}%`}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="px-6 py-5 bg-gradient-to-r from-slate-50 to-slate-100/50 border-t border-slate-150 flex flex-wrap gap-4 items-center justify-between font-black font-outfit text-xs md:text-sm tracking-wide">
                <span className="text-slate-800 text-[10px] uppercase tracking-widest font-extrabold">TỔNG HỢP LIÊN DỊCH VỤ</span>
                <div className="flex items-center gap-5.5 tabular-nums">
                  <span className="text-slate-500 text-xs font-semibold">A Thu: <span className="text-slate-950 font-black text-sm">{fmt(utilityData.electricRevenue + utilityData.waterRevenue)} đ</span></span>
                  <span className="text-slate-500 text-xs font-semibold">B Chi: <span className="text-slate-950 font-black text-sm">{fmt(utilityData.electricExpense + utilityData.waterExpense)} đ</span></span>
                  <span className="text-slate-700 bg-white border border-slate-200/80 shadow-sm px-3.5 py-1.5 rounded-2xl flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lời ròng:</span>
                    <span className={`font-black text-sm md:text-base ${(utilityData.electricDelta + utilityData.waterDelta) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {(utilityData.electricDelta + utilityData.waterDelta) >= 0 ? '+' : ''}{fmt(utilityData.electricDelta + utilityData.waterDelta)} đ
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200/85 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-slate-100/40 space-y-3">
                <div>
                  <h3 className="font-bold font-outfit text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <i className="fa-solid fa-server text-emerald-500"></i>
                    Mức tiêu thụ các Phòng
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1 font-semibold">Tiêu thụ điện nước chi tiết theo phòng</p>
                </div>
                <div className="relative">
                  <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"></i>
                  <input
                    type="search"
                    value={roomUtilitySearch}
                    onChange={event => setRoomUtilitySearch(event.target.value)}
                    placeholder="Tìm phòng hoặc khách thuê..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9.5 pr-3 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 shadow-inner"
                  />
                </div>
              </div>
              
              <div className="divide-y divide-slate-100 overflow-y-auto max-h-[300px] flex-1">
                {filteredUtilityRooms.map(item => {
                  const isAnomaly = item.electricUsage > 300
                  const absoluteRank = utilityData.roomList.findIndex(r => r.roomId === item.roomId) + 1

                  let rankBadge: React.ReactNode = null
                  if (absoluteRank === 1) {
                    rankBadge = (
                      <div className="flex items-center justify-center h-6 px-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-white font-black text-[9px] tracking-wider shadow-md shadow-amber-500/25 border border-amber-300/35 gap-0.5 uppercase shrink-0 group-hover/room:scale-110 transition-transform duration-200">
                        <i className="fa-solid fa-crown text-[8px] animate-bounce duration-1000"></i> Top 1
                      </div>
                    )
                  } else if (absoluteRank === 2) {
                    rankBadge = (
                      <div className="flex items-center justify-center h-6 px-2.5 rounded-xl bg-gradient-to-r from-slate-400 via-slate-200 to-slate-500 text-white font-black text-[9px] tracking-wider shadow-md shadow-slate-400/20 border border-slate-300/35 gap-0.5 uppercase shrink-0 group-hover/room:scale-110 transition-transform duration-200">
                        <i className="fa-solid fa-medal text-[8px]"></i> Top 2
                      </div>
                    )
                  } else if (absoluteRank === 3) {
                    rankBadge = (
                      <div className="flex items-center justify-center h-6 px-2.5 rounded-xl bg-gradient-to-r from-amber-700 via-amber-600 to-amber-900 text-white font-black text-[9px] tracking-wider shadow-md shadow-amber-700/20 border border-amber-600/30 gap-0.5 uppercase shrink-0 group-hover/room:scale-110 transition-transform duration-200">
                        <i className="fa-solid fa-award text-[8px]"></i> Top 3
                      </div>
                    )
                  } else {
                    rankBadge = (
                      <div className="flex items-center justify-center h-5 w-5 rounded-lg bg-slate-50 border border-slate-250 text-slate-400 font-black text-[9px] shrink-0 group-hover/room:scale-110 transition-transform duration-200">
                        #{absoluteRank}
                      </div>
                    )
                  }

                  return (
                    <div key={item.roomId} className={`px-6 py-4 flex items-center justify-between transition-all duration-200 cursor-pointer group/room ${isAnomaly ? 'bg-gradient-to-r from-amber-500/[0.03] to-orange-500/[0.01] border-l-4 border-amber-500 hover:from-amber-500/[0.06] hover:to-orange-500/[0.02] hover:shadow-md hover:scale-[1.008]' : 'hover:bg-slate-50 hover:shadow-inner hover:scale-[1.005] hover:-translate-y-0.5'}`}>
                      <div className="flex items-center gap-2.5">
                        {rankBadge}
                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-black font-outfit text-xs border transition-transform duration-200 group-hover/room:scale-105 group-hover/room:rotate-3 ${isAnomaly ? 'bg-amber-500/10 border-amber-300/20 text-amber-600 animate-pulse' : 'bg-slate-50 border-slate-150 text-slate-600 shrink-0'}`}>
                          {item.roomName.replace('Phòng ', '')}
                        </div>
                        <div>
                          <span className={`font-bold block text-xs transition-colors duration-200 ${isAnomaly ? 'text-amber-600 flex items-center gap-1.5' : 'text-slate-800 group-hover/room:text-emerald-700'}`}>
                            {item.tenantName}
                            {isAnomaly && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>}
                          </span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider block mt-0.5 ${isAnomaly ? 'text-amber-500/75' : 'text-slate-400'}`}>
                            {isAnomaly ? '⚠️ ĐIỆN CAO BẤT THƯỜNG' : 'Khách thuê'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className={`text-xs font-bold block ${isAnomaly ? 'text-amber-600' : 'text-amber-700 group-hover/room:text-amber-600'}`}>
                          ⚡ {fmt(item.electricRev)} đ <span className="text-[9px] font-medium text-slate-400">({item.electricUsage} kWh)</span>
                        </span>
                        <span className="text-[10px] text-sky-600 font-bold block mt-0.5 group-hover/room:text-sky-500">
                          💧 {fmt(item.waterRev)} đ <span className="text-[9px] font-medium text-slate-400">({item.waterUsage} m³)</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
                
                {filteredUtilityRooms.length === 0 && (
                  <div className="px-6 py-12 text-center text-slate-400 text-xs">
                    {roomUtilitySearch.trim() ? 'Không tìm thấy phòng phù hợp.' : 'Không có dữ liệu tiêu thụ phòng nào trong kỳ báo cáo này.'}
                  </div>
                )}
              </div>
            </div>

          </div>
      {buildingDrill && (
        <div className="fixed inset-0 z-[91] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setBuildingDrill(null)}>
          <div className="w-full max-w-5xl max-h-[86vh] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-slate-900">{buildingDrill.title}</h3>
                <p className="text-xs text-slate-500">
                  {buildingUtilityRows.length} phòng ·
                  {' '}
                  Tổng điện {fmt(buildingUtilityRows.reduce((sum, item) => sum + item.electricRev, 0))} đ ·
                  {' '}
                  Tổng nước {fmt(buildingUtilityRows.reduce((sum, item) => sum + item.waterRev, 0))} đ
                </p>
              </div>
              <button onClick={() => setBuildingDrill(null)} className="w-9 h-9 rounded-full hover:bg-slate-200 text-slate-500 transition">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="text-left px-5 py-3">Phòng</th>
                    <th className="text-left px-5 py-3">Khách thuê</th>
                    <th className="text-right px-5 py-3">Thu điện</th>
                    <th className="text-right px-5 py-3">Thu nước</th>
                    <th className="text-right px-5 py-3">Tổng thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buildingUtilityRows.map((item) => {
                    const total = item.electricRev + item.waterRev
                    const isTop =
                      buildingDrill.utility === 'electric'
                        ? item.electricRev > 0
                        : item.waterRev > 0
                    return (
                      <tr key={item.roomId} className={`hover:bg-slate-50 ${isTop ? '' : 'opacity-70'}`}>
                        <td className="px-5 py-3 font-bold text-slate-800">{item.roomName}</td>
                        <td className="px-5 py-3 text-slate-600">{item.tenantName}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-amber-700">{fmt(item.electricRev)} đ</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-sky-700">{fmt(item.waterRev)} đ</td>
                        <td className="px-5 py-3 text-right font-black tabular-nums text-slate-900">{fmt(total)} đ</td>
                      </tr>
                    )
                  })}
                  {buildingUtilityRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                        Không có dữ liệu phòng trong tòa này ở kỳ báo cáo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

          </div>
      )}
    </div>
  )
}

