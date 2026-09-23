import { useState, useMemo } from 'react'
import { HoldingRecord, TransactionRecord } from '../services/portfolioApi'
import { PiggyBank, Landmark, Plus, ArrowUpRight, Percent, ShieldCheck, Clock3, Coins, Edit2, X } from 'lucide-react'

interface SavingsTrackerProps {
  holdings: HoldingRecord[]
  transactions: TransactionRecord[]
  onOpenModal: (symbol?: string, type?: string) => void
  onRefresh: () => void | Promise<void>
  onDeleteTransaction?: (id: string) => void
}

interface SavingsMeta {
  type: string
  bank: string
  principal: number
  term: string
  rate: number
  startDate: string
  maturityDate: string
  maturityAction?: string
  settleDate?: string
  settleAmount?: number
  status: 'active' | 'settled'
}

function formatMoney(value: number) {
  if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
    return '******'
  }
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === '-') return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch (e) {
    return dateStr
  }
}

function calculateExpectedInterest(principal: number, rate: number, termStr: string): number {
  if (termStr === 'Không kỳ hạn') return 0
  const monthsMatch = termStr.match(/(\d+)\s*tháng/)
  if (!monthsMatch) return 0
  const months = parseInt(monthsMatch[1])
  return Math.round(principal * (rate / 100) * (months / 12))
}

export function SavingsTracker({
  holdings,
  transactions,
  onOpenModal,
  onDeleteTransaction,
}: SavingsTrackerProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'settled'>('active')

  // Parse savings books
  const savingsBooks = useMemo(() => {
    const list: { holding: HoldingRecord; meta: SavingsMeta }[] = []
    const savingsHoldings = holdings.filter(h => h.category === 'savings')

    for (const h of savingsHoldings) {
      let meta: SavingsMeta
      try {
        if (h.quantity.startsWith('{')) {
          meta = JSON.parse(h.quantity)
        } else {
          // Fallback if not JSON
          meta = {
            type: 'savings',
            bank: h.name.replace('Tiết kiệm ', '') || 'Ngân hàng',
            principal: h.valueVnd,
            term: 'Không xác định',
            rate: h.pnlPercent || 0,
            startDate: '-',
            maturityDate: '-',
            status: h.valueVnd > 0 ? 'active' : 'settled'
          }
        }
      } catch (e) {
        meta = {
          type: 'savings',
          bank: h.name.replace('Tiết kiệm ', '') || 'Ngân hàng',
          principal: h.valueVnd,
          term: 'Không xác định',
          rate: h.pnlPercent || 0,
          startDate: '-',
          maturityDate: '-',
          status: h.valueVnd > 0 ? 'active' : 'settled'
        }
      }

      list.push({ holding: h, meta })
    }

    return list
  }, [holdings])

  const activeBooks = useMemo(() => {
    return savingsBooks.filter(b => b.meta.status === 'active' && b.holding.valueVnd > 0)
  }, [savingsBooks])

  const settledBooks = useMemo(() => {
    return savingsBooks.filter(b => b.meta.status === 'settled' || b.holding.valueVnd === 0)
  }, [savingsBooks])

  // Statistics
  const totalPrincipal = useMemo(() => {
    return activeBooks.reduce((sum, b) => sum + b.meta.principal, 0)
  }, [activeBooks])

  const totalExpectedInterest = useMemo(() => {
    return activeBooks.reduce((sum, b) => {
      const interest = calculateExpectedInterest(b.meta.principal, b.meta.rate, b.meta.term)
      return sum + interest
    }, 0)
  }, [activeBooks])

  const avgInterestRate = useMemo(() => {
    if (activeBooks.length === 0 || totalPrincipal === 0) return 0
    const weightedSum = activeBooks.reduce((sum, b) => sum + (b.meta.principal * b.meta.rate), 0)
    return weightedSum / totalPrincipal
  }, [activeBooks, totalPrincipal])

  return (
    <div className="savings-tracker-container">
      {/* 1. Header Banner */}
      <header className="page-header-banner savings-header-banner">
        <div className="banner-left">
          <div className="banner-icon-circle">
            <PiggyBank size={24} />
          </div>
          <div>
            <span className="banner-subtitle">Tài chính cá nhân</span>
            <h1 className="banner-title">Quản lý Sổ tiết kiệm</h1>
            <p className="banner-desc">Theo dõi các khoản tiền gửi tiết kiệm ngân hàng, lãi dự kiến và tiến độ đáo hạn trực quan.</p>
          </div>
        </div>
        <div className="banner-right">
          <button className="primary-button add-savings-btn" onClick={() => onOpenModal(undefined, 'Mua vào')} type="button">
            <Plus size={16} />
            Mở sổ mới
          </button>
        </div>
      </header>

      {/* 2. Overview Stats */}
      <section className="savings-stats-grid">
        <article className="savings-stat-card">
          <div className="stat-card-icon principal">
            <Landmark size={20} />
          </div>
          <div className="stat-card-content">
            <span className="stat-label">Tổng tiền gửi gốc</span>
            <strong className="stat-value">{formatMoney(totalPrincipal)}</strong>
            <span className="stat-sub">{activeBooks.length} sổ đang gửi</span>
          </div>
        </article>

        <article className="savings-stat-card">
          <div className="stat-card-icon interest">
            <ArrowUpRight size={20} />
          </div>
          <div className="stat-card-content">
            <span className="stat-label">Lãi dự kiến nhận</span>
            <strong className="stat-value text-positive">+{formatMoney(totalExpectedInterest)}</strong>
            <span className="stat-sub">Khi tất cả sổ đáo hạn</span>
          </div>
        </article>

        <article className="savings-stat-card">
          <div className="stat-card-icon rate">
            <Percent size={20} />
          </div>
          <div className="stat-card-content">
            <span className="stat-label">Lãi suất TB hiệu dụng</span>
            <strong className="stat-value text-accent">{avgInterestRate.toFixed(2)}%<small className="rate-unit">/năm</small></strong>
            <span className="stat-sub">Tính trọng số theo tiền gửi</span>
          </div>
        </article>
      </section>

      {/* 3. Navigation Tabs */}
      <div className="savings-tabs-bar">
        <div className="savings-segmented">
          <button
            className={`savings-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
            type="button"
          >
            Đang hoạt động ({activeBooks.length})
          </button>
          <button
            className={`savings-tab-btn ${activeTab === 'settled' ? 'active' : ''}`}
            onClick={() => setActiveTab('settled')}
            type="button"
          >
            Đã tất toán ({settledBooks.length})
          </button>
        </div>
      </div>

      {/* 4. Tab Content */}
      <div className="savings-tab-content">
        {activeTab === 'active' ? (
          activeBooks.length > 0 ? (
            <div className="savings-cards-grid">
              {activeBooks.map(({ holding, meta }) => {
                // Calculate progress
                const startDate = new Date(meta.startDate)
                const maturityDate = new Date(meta.maturityDate)
                const now = new Date()
                let progressPercent = 0
                let daysTotal = 0
                let daysElapsed = 0
                let daysRemaining = 0

                const isNoTerm = meta.term === 'Không kỳ hạn'
                const isValidDates = !isNaN(startDate.getTime()) && !isNaN(maturityDate.getTime())

                if (!isNoTerm && isValidDates) {
                  daysTotal = Math.max(1, Math.ceil((maturityDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
                  daysElapsed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                  daysElapsed = Math.max(0, Math.min(daysElapsed, daysTotal))
                  progressPercent = (daysElapsed / daysTotal) * 100
                  daysRemaining = Math.max(0, Math.ceil((maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                }

                const expectedInterest = calculateExpectedInterest(meta.principal, meta.rate, meta.term)

                return (
                  <article className="savings-card" key={holding.symbol}>
                    {/* Top Right Actions */}
                    <div className="savings-card-top-actions">
                      <button
                        className="action-btn edit"
                        onClick={() => onOpenModal(holding.symbol, 'Chỉnh sửa')}
                        title="Chỉnh sửa thông tin sổ"
                        type="button"
                      >
                        <Edit2 size={12} />
                      </button>
                      {onDeleteTransaction && (
                        <button
                          className="action-btn delete"
                          onClick={() => {
                            const originalTx = transactions.find(t => t.assetSymbol === holding.symbol && (t.transactionType === 'buy' || t.transactionType === 'import-existing'))
                            if (originalTx) {
                              onDeleteTransaction(originalTx.id)
                            } else {
                              alert('Không tìm thấy giao dịch gốc của sổ tiết kiệm này.')
                            }
                          }}
                          title="Xóa sổ"
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    <div className="savings-card-top">
                      <div className="bank-info">
                        <span className="bank-avatar">
                          {meta.bank.slice(0, 3).toUpperCase()}
                        </span>
                        <div>
                          <h3 className="bank-name">{meta.bank}</h3>
                          <span className="savings-badge-term">{meta.term}</span>
                        </div>
                      </div>
                      <div className="savings-rate-tag">
                        <strong>{meta.rate}%</strong>
                        <span>/năm</span>
                      </div>
                    </div>

                    <div className="savings-card-metrics">
                      <div className="metric-item">
                        <span className="metric-label">Tiền gửi gốc</span>
                        <strong className="metric-value">{formatMoney(meta.principal)}</strong>
                      </div>
                      <div className="metric-item align-right">
                        <span className="metric-label">Lãi dự kiến</span>
                        <strong className="metric-value text-positive">+{formatMoney(expectedInterest)}</strong>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {!isNoTerm && isValidDates && (
                      <div className="savings-progress-wrapper">
                        <div className="progress-labels">
                          <span>Đã gửi {daysElapsed}/{daysTotal} ngày</span>
                          <strong>Còn {daysRemaining} ngày</strong>
                        </div>
                        <div className="savings-progress-track">
                          <span
                            className="savings-progress-bar"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="savings-card-dates">
                      <div className="date-col">
                        <span>Ngày gửi</span>
                        <strong>{formatDate(meta.startDate)}</strong>
                      </div>
                      <div className="date-col align-right">
                        <span>Ngày đáo hạn</span>
                        <strong>{formatDate(meta.maturityDate)}</strong>
                      </div>
                    </div>

                    {meta.maturityAction && (
                      <div className="maturity-action-hint">
                        <span>Đáo hạn:</span>
                        <strong>
                          {meta.maturityAction === 'goc_lai_tai_tuc' ? 'Tái tục gốc & lãi' :
                           meta.maturityAction === 'goc_tai_tuc' ? 'Tái tục gốc, lãi về ví' :
                           'Tất toán về ví'}
                        </strong>
                      </div>
                    )}

                    <div className="savings-card-actions">
                      <button
                        className="settle-btn"
                        onClick={() => onOpenModal(holding.symbol, 'Bán ra')}
                        type="button"
                      >
                        <ShieldCheck size={14} />
                        Tất toán sổ
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="savings-empty-state">
              <Coins size={36} />
              <h3>Chưa có sổ tiết kiệm đang hoạt động</h3>
              <p>Mở sổ tiết kiệm mới để theo dõi tài sản sinh lời của bạn.</p>
              <button className="primary-button" onClick={() => onOpenModal(undefined, 'Mua vào')} type="button">
                <Plus size={16} /> Mở sổ ngay
              </button>
            </div>
          )
        ) : (
          settledBooks.length > 0 ? (
            <div className="table-shell savings-history-table">
              <table>
                <thead>
                  <tr>
                    <th>Ngân hàng</th>
                    <th>Ngày gửi</th>
                    <th>Ngày tất toán</th>
                    <th>Tiền gốc</th>
                    <th>Lãi suất</th>
                    <th>Tiền nhận thực tế</th>
                    <th>Lãi nhận được</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {settledBooks.map(({ holding, meta }) => {
                    const gainVal = (meta.settleAmount ?? 0) - meta.principal
                    return (
                      <tr key={holding.symbol}>
                        <td>
                          <div className="bank-cell">
                            <span className="bank-badge-small">{meta.bank.slice(0, 2).toUpperCase()}</span>
                            <div>
                              <strong>{meta.bank}</strong>
                              <small>{meta.term}</small>
                            </div>
                          </div>
                        </td>
                        <td>{formatDate(meta.startDate)}</td>
                        <td>{formatDate(meta.settleDate || meta.maturityDate)}</td>
                        <td>{formatMoney(meta.principal)}</td>
                        <td>{meta.rate}%/năm</td>
                        <td>{formatMoney(meta.settleAmount ?? meta.principal)}</td>
                        <td className="positive">+{formatMoney(gainVal > 0 ? gainVal : 0)}</td>
                        <td>
                          <span className="status-badge settled">Đã tất toán</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="savings-empty-state">
              <Clock3 size={36} />
              <h3>Chưa có lịch sử tất toán</h3>
              <p>Danh sách sổ tiết kiệm sau khi rút sẽ hiển thị lịch sử ở đây.</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
