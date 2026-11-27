import { useMemo, useState, type ReactElement } from 'react'
import { ArrowDown, ArrowUp, Download, ListOrdered, Minus, Plus, WalletCards } from 'lucide-react'
import type { InvestmentTransaction } from '../../lib/investment-store'
import './investment-wallet-panel.css'

type Period = '7' | '30' | 'all'

type Props = {
  title: string
  balance: number
  // Only investment-wallet transactions, any order.
  transactions: InvestmentTransaction[]
  depositLabel: string
  withdrawLabel: string
  footnote: string
  describe: (tx: InvestmentTransaction) => string
  note: (tx: InvestmentTransaction) => string
  onDeposit: () => void
  onWithdraw: () => void
}

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`
const signedMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${money(Math.abs(value))}`
const stamp = (tx: InvestmentTransaction) => tx.occurredAt || tx.date
const toDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
const formatDateTime = (value: string) => {
  const date = toDate(value)
  if (!date) return value
  const day = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return /[T ]\d{2}:\d{2}/.test(value) ? `${day} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : day
}
const methodLabel = (tx: InvestmentTransaction) =>
  tx.walletPosting?.paymentMethod === 'cash' ? 'Tiền mặt' : tx.walletPosting?.paymentMethod === 'transfer' ? 'Chuyển khoản' : '—'
const delta = (tx: InvestmentTransaction) => tx.walletPosting?.amount || 0

// Bank-statement view of the investment wallet: account header, monthly
// figures and a statement with the running balance after each entry.
export function InvestmentWalletPanel({ title, balance, transactions, depositLabel, withdrawLabel, footnote, describe, note, onDeposit, onWithdraw }: Props): ReactElement {
  const [period, setPeriod] = useState<Period>('all')

  const ledger = useMemo(() => {
    const ordered = [...transactions].sort((a, b) => stamp(a).localeCompare(stamp(b)) || a.id.localeCompare(b.id))
    let running = 0
    return ordered.map((tx) => {
      running += delta(tx)
      return { tx, after: running }
    })
  }, [transactions])

  const now = new Date()
  const monthRows = ledger.filter(({ tx }) => {
    const date = toDate(stamp(tx))
    return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  })
  const monthIn = monthRows.reduce((sum, { tx }) => sum + Math.max(0, delta(tx)), 0)
  const monthOut = monthRows.reduce((sum, { tx }) => sum + Math.max(0, -delta(tx)), 0)
  const lastUpdate = ledger.length ? formatDateTime(stamp(ledger[ledger.length - 1].tx)) : null

  const visible = useMemo(() => {
    const cutoff = period === 'all' ? null : Date.now() - Number(period) * 86_400_000
    return ledger.filter(({ tx }) => {
      if (cutoff === null) return true
      const date = toDate(stamp(tx))
      return Boolean(date && date.getTime() >= cutoff)
    }).reverse()
  }, [ledger, period])

  const exportStatement = () => {
    const rows = [['Ngày', 'Diễn giải', 'Ghi chú', 'Hình thức', 'Phát sinh (VND)', 'Số dư sau giao dịch (VND)'],
      ...visible.map(({ tx, after }) => [formatDateTime(stamp(tx)), describe(tx), note(tx), methodLabel(tx), String(delta(tx)), String(after)])]
    const csv = '﻿' + rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `sao-ke-vi-dau-tu-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="wallet-panel">
      <section className="wallet-account" aria-label="Tài khoản Ví đầu tư">
        <div className="wallet-account__identity">
          <span className="wallet-icon wallet-icon--lg"><WalletCards size={26} /></span>
          <div>
            <p className="wallet-muted">Tài khoản Ví đầu tư</p>
            <p className="wallet-account__name">{title}</p>
          </div>
        </div>
        <div className="wallet-account__balance">
          <p className="wallet-balance">{money(balance)}</p>
          <p className="wallet-muted">{lastUpdate ? `Cập nhật ${lastUpdate}` : 'Chưa có giao dịch'}</p>
        </div>
        <div className="wallet-account__actions">
          <button type="button" className="wallet-btn wallet-btn--primary" onClick={onDeposit} title={depositLabel}><Plus size={16} />Nạp tiền</button>
          <button type="button" className="wallet-btn wallet-btn--outline" onClick={onWithdraw} title={withdrawLabel}><Minus size={16} />Rút tiền</button>
        </div>
      </section>

      <section className="wallet-kpis" aria-label="Số liệu tháng này">
        <div className="wallet-kpi"><span className="wallet-icon"><ArrowDown size={18} /></span><div><p className="wallet-muted">Tiền vào tháng này</p><p className={`wallet-kpi__value ${monthIn > 0 ? 'is-positive' : ''}`}>{signedMoney(monthIn)}</p></div></div>
        <div className="wallet-kpi"><span className="wallet-icon"><ArrowUp size={18} /></span><div><p className="wallet-muted">Tiền ra tháng này</p><p className={`wallet-kpi__value ${monthOut > 0 ? 'is-negative' : ''}`}>{signedMoney(-monthOut)}</p></div></div>
        <div className="wallet-kpi"><span className="wallet-icon"><ListOrdered size={18} /></span><div><p className="wallet-muted">Số giao dịch</p><p className="wallet-kpi__value">{ledger.length}</p></div></div>
      </section>

      <section className="wallet-statement" aria-label="Sao kê">
        <header className="wallet-statement__head">
          <h2>Sao kê</h2>
          <div className="wallet-statement__tools">
            {([['7', '7 ngày'], ['30', '30 ngày'], ['all', 'Tất cả']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={period === value} className={`wallet-chip ${period === value ? 'is-active' : ''}`} onClick={() => setPeriod(value)}>{label}</button>
            ))}
            <span className="wallet-divider" />
            <button type="button" className="wallet-link" onClick={exportStatement} disabled={!visible.length}><Download size={15} />Xuất sao kê</button>
          </div>
        </header>
        <div className="wallet-table-wrap">
          <table className="wallet-table">
            <thead><tr><th>Ngày</th><th>Diễn giải</th><th>Hình thức</th><th className="is-num">Phát sinh</th><th className="is-num">Số dư sau giao dịch</th></tr></thead>
            <tbody>
              {visible.map(({ tx, after }) => {
                const amount = delta(tx)
                return (
                  <tr key={tx.id}>
                    <td className="is-nowrap">{formatDateTime(stamp(tx))}</td>
                    <td><p className="wallet-strong">{describe(tx)}</p>{note(tx) && <p className="wallet-muted wallet-small">{note(tx)}</p>}</td>
                    <td>{methodLabel(tx)}</td>
                    <td className={`is-num ${amount > 0 ? 'is-positive' : amount < 0 ? 'is-negative' : ''}`}>{signedMoney(amount)}</td>
                    <td className="is-num wallet-strong">{money(after)}</td>
                  </tr>
                )
              })}
              {!visible.length && <tr><td colSpan={5} className="wallet-empty">{ledger.length ? 'Không có giao dịch trong khoảng thời gian này.' : 'Chưa có giao dịch. Bấm “Nạp tiền” để bắt đầu.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="wallet-footnote">{footnote}</p>
      </section>
    </div>
  )
}
