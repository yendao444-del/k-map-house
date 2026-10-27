import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { fetchMyHanhPrices, suggestedMyHanhPricePerChi } from '../../lib/goldApi'
import type { MyHanhGoldPrices } from '../../../../shared/my-hanh-gold'
import type { InvestmentHolding } from '../../lib/investment-store'
import { validateFunding, type FundingBalances, type FundingMethod } from '../../lib/investment-funding'
import { formatVndPriceInput, normalizeVndPriceInput } from '../../lib/vnd-price-input'
import { planInvestmentTopUp, InvestmentFundingCancelled } from '../../lib/investment-auto-funding'
import './gold-trade-modal.css'

const GOLD_PRODUCT = { symbol: 'MH9999', name: 'Vàng MH 9999 · Mỹ Hạnh' } as const

const money = (value: number): string => `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} đ`
const today = (): string => new Date().toLocaleDateString('vi-VN')
const holdingQuantity = (holding: InvestmentHolding): number => {
  const match = holding.quantity.match(/^\s*([\d.,]+)/)
  return match ? Number(match[1].replace(',', '.')) || 0 : 0
}

export type GoldTradeInput = {
  category: 'gold'
  symbol: string
  name: string
  type: 'buy' | 'sell'
  amount: number
  quantity: number
  unit: 'chỉ'
  date: string
  note: string
  paymentMethod: FundingMethod
}

export function GoldTradeModal({
  mode,
  holdings,
  walletSummary,
  operatingWalletSummary,
  onClose,
  onSave
}: {
  mode: 'buy' | 'sell'
  holdings: InvestmentHolding[]
  walletSummary: FundingBalances
  operatingWalletSummary: FundingBalances
  onClose: () => void
  onSave: (input: GoldTradeInput) => Promise<void>
}): ReactElement {
  const available = useMemo(
    () => new Map(holdings.filter((holding) => holding.category === 'gold').map((holding) => [holding.symbol.toUpperCase(), holdingQuantity(holding)])),
    [holdings]
  )
  const [quantityDraft, setQuantityDraft] = useState('1')
  const [priceDraft, setPriceDraft] = useState<string | null>(null)
  const [prices, setPrices] = useState<MyHanhGoldPrices | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const quantityInputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef(typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const [error, setError] = useState('')
  const paymentMethod: FundingMethod = walletSummary.bankBalance > 0 ? 'transfer' : 'cash'

  useEffect(() => {
    let active = true
    void fetchMyHanhPrices().then((result) => {
      if (active) {
        setPrices(result)
        setLoadingPrice(false)
      }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const previousFocus = previousFocusRef.current
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus() }
  }, [])

  const product = GOLD_PRODUCT
  const stock = available.get(product.symbol) || 0
  const maxQuantity = mode === 'sell' ? Math.floor(stock) : 100
  const quantity = Math.min(maxQuantity || 1, Math.max(1, Math.floor(Number(quantityDraft) || 1)))
  const rangeMax = mode === 'sell' ? Math.max(1, maxQuantity) : 10
  const suggestedPrice = suggestedMyHanhPricePerChi(prices, mode)
  const hasLiveQuote = suggestedPrice > 0
  const unitPrice = Number(priceDraft ?? suggestedPrice) || 0
  const total = unitPrice * quantity
  // Wallet checks belong to the explicit submit, not the normal form display.
  // The save pipeline still rechecks current funds and confirms any operating-wallet top-up.
  const canSubmit = !loadingPrice && !saving && maxQuantity > 0 && Number.isFinite(total) && unitPrice > 0
  const chooseQuantity = (next: number, focusInput = true) => {
    setQuantityDraft(String(Math.min(maxQuantity || 1, Math.max(1, next))))
    setError('')
    // A quick quantity click leaves Enter ready to buy, not re-click the preset.
    if (focusInput) quantityInputRef.current?.focus({ preventScroll: true })
  }

  const adjustQuantity = (delta: number) => {
    chooseQuantity(quantity + delta)
  }
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (!savingRef.current) onClose()
    }
    if (event.key === 'Tab') {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'))
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    if (event.repeat || savingRef.current) { event.preventDefault(); return }
    // Enter on +/- or presets keeps normal button activation; inputs submit once.
    if (event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    event.currentTarget.requestSubmit()
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      if (mode === 'buy') {
        const shortfall = Math.max(0, total - walletSummary.totalBalance)
        if (shortfall > 0) planInvestmentTopUp(shortfall, operatingWalletSummary, paymentMethod)
        else validateFunding(walletSummary, [{ paymentMethod, amount: -total }])
      }
      await onSave({
        category: 'gold',
        symbol: product.symbol,
        name: product.name,
        type: mode,
        amount: total,
        quantity,
        unit: 'chỉ',
        date: new Date().toISOString().slice(0, 10),
        note: `${product.name} · ${money(unitPrice)}/chỉ`,
        paymentMethod
      })
    } catch (cause) {
      if (!(cause instanceof InvestmentFundingCancelled)) setError(cause instanceof Error ? cause.message : 'Không thể lưu giao dịch vàng.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="gold-trade-overlay" onMouseDown={() => { if (!savingRef.current) onClose() }}>
      <form role="dialog" aria-modal="true" aria-labelledby="gold-trade-title" onSubmit={(event) => void submit(event)} onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()} className={`gold-trade-dialog gold-trade-${mode}`}>
        <header className="gold-trade-heading">
          <div>
            <p>Danh mục đầu tư</p>
            <h2 id="gold-trade-title">{mode === 'buy' ? 'Mua vàng' : 'Bán vàng'}</h2>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose} disabled={saving} className="gold-trade-close"><X size={23} /></button>
        </header>

        <div className="gold-trade-body">
          <div className="gold-trade-product">
            <i aria-hidden="true" className="fa-solid fa-ring" />
            <div>
              <p className="gold-trade-product-name">{product.name}</p>
              <p className="gold-trade-date">Ngày {mode === 'buy' ? 'mua' : 'bán'} tự động · {today()}</p>
              {mode === 'sell' && <p className="gold-trade-stock">Đang có: {stock} chỉ Mỹ Hạnh</p>}
            </div>
          </div>

          <section className="gold-trade-quantity-section" aria-labelledby="gold-trade-quantity-label">
            <div className="gold-trade-label-row"><label id="gold-trade-quantity-label" htmlFor="gold-trade-quantity">Số lượng</label><span>chỉ</span></div>
            <div className="gold-trade-stepper">
              <button type="button" aria-label="Giảm một chỉ" onClick={() => adjustQuantity(-1)} disabled={saving || quantity <= 1}><Minus size={23} /></button>
              <input ref={quantityInputRef} autoFocus id="gold-trade-quantity" type="number" min="1" max={maxQuantity || 1} step="1" value={quantityDraft} disabled={saving || maxQuantity < 1} onChange={(event) => { setQuantityDraft(event.target.value); setError('') }} onBlur={() => setQuantityDraft(String(quantity))} />
              <button type="button" aria-label="Tăng một chỉ" onClick={() => adjustQuantity(1)} disabled={saving || quantity >= maxQuantity}><Plus size={23} /></button>
            </div>
            <input type="range" aria-label="Chỉnh số chỉ" min="1" max={rangeMax} step="1" value={Math.min(quantity, rangeMax)} onChange={(event) => chooseQuantity(Number(event.target.value), false)} disabled={saving || maxQuantity < 1} className="gold-trade-slider" />
            <div className="gold-trade-range-labels" aria-hidden="true"><span>1 chỉ</span><span>{Math.ceil(rangeMax / 2)} chỉ</span><span>{rangeMax} chỉ</span></div>
            <div className="gold-trade-presets" role="group" aria-label="Số lượng nhanh">
              {[1, 2, 5, 10].map(value => <button key={value} type="button" aria-pressed={quantity === value} disabled={saving || value > maxQuantity} onClick={() => chooseQuantity(value)}>{value} chỉ</button>)}
            </div>
            {mode === 'sell' && maxQuantity < 1 && <p className="gold-trade-error">Chưa có vàng Mỹ Hạnh đủ 1 chỉ trong danh mục để bán.</p>}
          </section>

          <div className="gold-trade-price-section">
            <label htmlFor="gold-trade-price">Giá {mode === 'buy' ? 'mua' : 'bán'} / chỉ</label>
            <div className="gold-trade-price-field">
              <input id="gold-trade-price" type="text" inputMode="numeric" aria-describedby="gold-trade-price-hint" value={formatVndPriceInput(priceDraft ?? (suggestedPrice || ''))} onChange={(event) => {
                const digits = normalizeVndPriceInput(event.target.value)
                if (digits !== null) { setPriceDraft(digits); setError('') }
              }} placeholder="Giá mỗi chỉ" disabled={loadingPrice || saving} />
              <span aria-hidden="true">đ</span>
            </div>
            <p id="gold-trade-price-hint" className="gold-trade-hint">{loadingPrice ? 'Đang tải giá vàng hiện tại…' : 'Giá tham khảo, có thể chỉnh sửa'}</p>
            {hasLiveQuote ? <p className="gold-trade-source"><strong>Nguồn:</strong> ước tính theo nhẫn PNJ Hà Nội{prices?.quotedAt ? ` · ${new Date(prices.quotedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}, ${new Date(prices.quotedAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}</p>
              : !loadingPrice && <p className="gold-trade-quote-warning">Chưa lấy được giá hiện tại. Hãy nhập giá thực tế mỗi chỉ.</p>}
          </div>
        </div>

        <footer className="gold-trade-footer">
          <div className="gold-trade-total"><span>{mode === 'buy' ? 'Tổng tiền' : 'Tổng tiền thu về'}</span><strong>{money(total)}</strong></div>
          {error && <p role="alert" className="gold-trade-error">{error}</p>}
          <button type="submit" disabled={!canSubmit} className="gold-trade-submit">{saving ? 'Đang lưu…' : mode === 'buy' ? 'Mua vàng' : 'Bán vàng'}</button>
          <p className="gold-trade-key-hint"><kbd>Enter</kbd> để {mode === 'buy' ? 'mua' : 'bán'} nhanh</p>
        </footer>
      </form>
    </div>
  )
}
