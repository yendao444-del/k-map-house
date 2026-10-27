import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Info, Landmark, Wallet, WalletCards, X } from 'lucide-react'
import type { InvestmentTopUpConfirmation } from '../lib/investment-auto-funding'
import './investment-funding-confirmation.css'

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`

function FundingDialog({ plan, onDecision }: {
  plan: InvestmentTopUpConfirmation
  onDecision: (accepted: boolean) => void
}): ReactElement {
  const titleId = useId()
  const descriptionId = useId()
  const overlay = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const isGold = ['MH9999', 'VNHAN', 'PQHN24NTT', 'BT9999NTT'].includes(plan.assetSymbol || '')

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay.current)
      .map(element => ({ element, wasInert: element.inert }))
    siblings.forEach(({ element }) => { element.inert = true })
    document.body.style.overflow = 'hidden'
    cancel.current?.focus()
    const focusInside = (event: FocusEvent) => {
      if (!overlay.current?.contains(event.target as Node)) cancel.current?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onDecision(false)
      } else if (event.key === 'Tab') {
        const controls = overlay.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        const first = controls?.[0]
        const last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', focusInside, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', focusInside, true)
      siblings.forEach(({ element, wasInert }) => { element.inert = wasInert })
      document.body.style.overflow = previousOverflow
      requestAnimationFrame(() => {
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
      })
    }
  }, [onDecision])

  return createPortal(
    <div ref={overlay} className="investment-funding-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onDecision(false)
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="investment-funding-dialog">
        <header className="investment-funding-heading">
          <span className="investment-funding-icon"><Wallet size={29} aria-hidden="true" /></span>
          <div>
            <h2 id={titleId}>Xác nhận chuyển vốn</h2>
            <p id={descriptionId}>Bổ sung phần thiếu từ Ví phòng trọ để mua {isGold ? 'vàng' : 'tài sản'}.</p>
          </div>
          <button type="button" className="investment-funding-close" aria-label="Đóng xác nhận chuyển vốn" onClick={() => onDecision(false)}><X size={21} aria-hidden="true" /></button>
        </header>

        <div className="investment-funding-content">
          <dl className="investment-funding-summary">
            <div><dt>Tổng tiền mua</dt><dd>{money(plan.purchaseAmount)}</dd></div>
            <div><dt>Ví đầu tư hiện có</dt><dd>{money(plan.investmentAvailable)}</dd></div>
          </dl>

          <div className="investment-funding-transfer">
            <div className="investment-funding-amount"><span>Cần chuyển từ Ví phòng trọ</span><strong>{money(plan.shortfall)}</strong></div>
            {plan.postings.map(posting => {
              const Icon = posting.paymentMethod === 'transfer' ? Landmark : WalletCards
              return <p className="investment-funding-source" key={posting.paymentMethod}>
                <Icon size={20} aria-hidden="true" />
                <span>Nguồn tiền: {posting.paymentMethod === 'transfer' ? 'Ngân hàng' : 'Tiền mặt'}{plan.postings.length > 1 && <> · <b>{money(-posting.amount)}</b></>}</span>
              </p>
            })}
          </div>

          <dl className="investment-funding-remaining"><div><dt>Ví phòng trọ sau giao dịch</dt><dd>{money(plan.operatingAvailable - plan.shortfall)}</dd></div></dl>
          <p className="investment-funding-note"><Info size={18} aria-hidden="true" /><span>Chỉ chuyển phần thiếu. Giao dịch được ghi vào lịch sử.</span></p>
        </div>

        <footer className="investment-funding-actions">
          <button ref={cancel} type="button" className="investment-funding-cancel" onClick={() => onDecision(false)}>Hủy</button>
          <button type="button" className="investment-funding-confirm room-primary-faceted" onClick={() => onDecision(true)}><span>Xác nhận chuyển &amp; mua</span><ArrowRight size={23} aria-hidden="true" /></button>
        </footer>
      </section>
    </div>, document.body
  )
}

// Resolve exactly one decision; unmounting the investment screen cancels it.
export function useInvestmentFundingConfirmation(): {
  confirmTopUp: (plan: InvestmentTopUpConfirmation) => Promise<boolean>
  confirmationDialog: ReactElement | null
} {
  const [plan, setPlan] = useState<InvestmentTopUpConfirmation | null>(null)
  const pending = useRef<((accepted: boolean) => void) | null>(null)
  const confirmTopUp = useCallback((nextPlan: InvestmentTopUpConfirmation): Promise<boolean> => {
    if (pending.current) return Promise.resolve(false)
    return new Promise(resolve => { pending.current = resolve; setPlan(nextPlan) })
  }, [])
  const onDecision = useCallback((accepted: boolean) => {
    const resolve = pending.current
    if (!resolve) return
    pending.current = null
    setPlan(null)
    resolve(accepted)
  }, [])
  useEffect(() => () => { pending.current?.(false); pending.current = null }, [])
  return { confirmTopUp, confirmationDialog: plan ? <FundingDialog plan={plan} onDecision={onDecision} /> : null }
}
