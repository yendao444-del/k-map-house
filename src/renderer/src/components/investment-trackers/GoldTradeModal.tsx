import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import { fetchCurrentGoldPrices, suggestedGoldPricePerChi, type GoldPricesResponse } from '../../lib/goldApi'
import type { InvestmentHolding } from '../../lib/investment-store'
import { validateFunding, type FundingBalances, type FundingMethod } from '../../lib/investment-funding'

type GoldProduct = {
  symbol: string
  quoteCode: string
  name: string
}

const GOLD_PRODUCTS: GoldProduct[] = [
  { symbol: 'VNHAN', quoteCode: 'SJ9999', name: 'Nhẫn SJC 99.99' },
  { symbol: 'PQHN24NTT', quoteCode: 'PQHN24NTT', name: 'Nhẫn PNJ 24K' },
  { symbol: 'BT9999NTT', quoteCode: 'BT9999NTT', name: 'Nhẫn Bảo Tín 9999' }
]

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
  initialSymbol,
  holdings,
  walletSummary,
  onClose,
  onSave
}: {
  mode: 'buy' | 'sell'
  initialSymbol?: string
  holdings: InvestmentHolding[]
  walletSummary: FundingBalances
  onClose: () => void
  onSave: (input: GoldTradeInput) => Promise<void>
}): ReactElement {
  const available = useMemo(
    () => new Map(holdings.filter((holding) => holding.category === 'gold').map((holding) => [holding.symbol.toUpperCase(), holdingQuantity(holding)])),
    [holdings]
  )
  const [selectedSymbol, setSelectedSymbol] = useState(() =>
    initialSymbol && GOLD_PRODUCTS.some(product => product.symbol === initialSymbol) ? initialSymbol : mode === 'sell'
      ? GOLD_PRODUCTS.find((product) => (available.get(product.symbol) || 0) > 0)?.symbol || GOLD_PRODUCTS[0].symbol
      : GOLD_PRODUCTS[0].symbol
  )
  const [quantityDraft, setQuantityDraft] = useState('1')
  const [priceDraft, setPriceDraft] = useState<string | null>(null)
  const [prices, setPrices] = useState<GoldPricesResponse | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<FundingMethod>(walletSummary.bankBalance > 0 ? 'transfer' : 'cash')

  useEffect(() => {
    let active = true
    void fetchCurrentGoldPrices().then((result) => {
      if (active) {
        setPrices(result)
        setLoadingPrice(false)
      }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const product = GOLD_PRODUCTS.find((item) => item.symbol === selectedSymbol) || GOLD_PRODUCTS[0]
  const stock = available.get(product.symbol) || 0
  const maxQuantity = mode === 'sell' ? Math.floor(stock) : 100
  const quantity = Math.min(maxQuantity || 1, Math.max(1, Math.floor(Number(quantityDraft) || 1)))
  const rangeMax = mode === 'sell' ? Math.max(1, maxQuantity) : 10
  const suggestedPrice = suggestedGoldPricePerChi(prices, product.quoteCode, mode)
  const hasLiveQuote = suggestedPrice > 0
  const unitPrice = Number(priceDraft ?? suggestedPrice) || 0
  const total = unitPrice * quantity
  let fundingError = ''
  if (mode === 'buy' && total > 0) {
    try { validateFunding(walletSummary, [{ paymentMethod, amount: -total }]) }
    catch (cause) { fundingError = cause instanceof Error ? cause.message : '' }
  }
  const canSubmit = !loadingPrice && !saving && maxQuantity > 0 && Number.isFinite(total) && unitPrice > 0 && !fundingError

  const chooseProduct = (next: GoldProduct) => {
    if (mode === 'sell' && (available.get(next.symbol) || 0) < 1) return
    setSelectedSymbol(next.symbol)
    setQuantityDraft('1')
    setPriceDraft(null)
    setError('')
  }
  const adjustQuantity = (delta: number) => {
    setQuantityDraft(String(Math.min(maxQuantity, Math.max(1, quantity + delta))))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
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
      setError(cause instanceof Error ? cause.message : 'Không thể lưu giao dịch vàng.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <form role="dialog" aria-modal="true" aria-label={mode === 'buy' ? 'Mua vàng' : 'Bán vàng'} onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[calc(100vh-32px)] w-full max-w-[640px] flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between bg-[#064a31] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-100/80">Danh mục đầu tư</p>
            <h2 className="mt-1 text-2xl font-black">{mode === 'buy' ? 'Ghi nhận mua vàng' : 'Ghi nhận bán vàng'}</h2>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose} className="rounded-full p-2 hover:bg-white/10"><X size={21} /></button>
        </header>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <fieldset>
            <legend className="mb-3 text-sm font-black text-[#15231d]">Chọn loại vàng</legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {GOLD_PRODUCTS.map((item) => {
                const selected = item.symbol === selectedSymbol
                const disabled = mode === 'sell' && (available.get(item.symbol) || 0) < 1
                const indicativePrice = suggestedGoldPricePerChi(prices, item.quoteCode, mode)
                return (
                  <button key={item.symbol} type="button" aria-pressed={selected} disabled={disabled} onClick={() => chooseProduct(item)} className={`relative flex min-h-[130px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'border-[#00ab60] bg-[#f1fbf6] shadow-[0_0_0_1px_#00ab60]' : 'border-[#dbe6e1] bg-white hover:border-[#8ccbb2] hover:bg-[#f7fbf9]'}`}>
                    {selected && <Check size={16} className="absolute right-3 top-3 rounded-full bg-[#00ab60] p-0.5 text-white" />}
                    <i aria-hidden="true" className="fa-solid fa-ring text-[31px] text-[#d79627]" />
                    <span className="text-xs font-black leading-tight text-[#15231d]">{item.name}</span>
                    {mode === 'sell' && !disabled ? <span className="text-[11px] text-slate-500">Đang có {available.get(item.symbol)} chỉ</span> : <span className="text-[11px] text-slate-500">{indicativePrice > 0 ? `${money(indicativePrice)}/chỉ` : 'Chưa có giá trực tuyến'}</span>}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="rounded-xl border border-[#e0ebe5] bg-[#f7faf8] px-4 py-3">
            <p className="text-sm font-semibold text-slate-500">Đã chọn: <strong className="ml-1 text-[#064a31]">{product.name}</strong></p>
            <p className="mt-1 text-xs text-slate-500">Ngày {mode === 'buy' ? 'mua' : 'bán'}: {today()}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-black text-[#15231d]"><label htmlFor="gold-trade-quantity">Số lượng</label><span className="font-bold text-slate-500">chỉ</span></div>
            <div className="grid grid-cols-[52px_1fr_52px] gap-3">
              <button type="button" aria-label="Giảm một chỉ" onClick={() => adjustQuantity(-1)} disabled={quantity <= 1} className="flex h-12 items-center justify-center rounded-xl bg-[#064a31] text-white disabled:opacity-40"><Minus size={21} /></button>
              <input id="gold-trade-quantity" type="number" min="1" max={maxQuantity || 1} step="1" value={quantityDraft} onChange={(event) => setQuantityDraft(event.target.value)} onBlur={() => setQuantityDraft(String(quantity))} className="h-12 min-w-0 rounded-xl border border-slate-200 bg-white text-center text-xl font-black text-[#15231d] focus:border-[#00ab60] focus:outline-none" />
              <button type="button" aria-label="Tăng một chỉ" onClick={() => adjustQuantity(1)} disabled={quantity >= maxQuantity} className="flex h-12 items-center justify-center rounded-xl bg-[#064a31] text-white disabled:opacity-40"><Plus size={21} /></button>
            </div>
            <input type="range" aria-label="Chỉnh số chỉ" min="1" max={rangeMax} step="1" value={Math.min(quantity, rangeMax)} onChange={(event) => setQuantityDraft(event.target.value)} disabled={maxQuantity < 1} className="mt-5 w-full cursor-pointer accent-[#00ab60]" />
            <div className="mt-1 flex justify-between text-[11px] font-bold text-slate-400"><span>1 chỉ</span><span>{Math.ceil(rangeMax / 2)} chỉ</span><span>{rangeMax} chỉ</span></div>
            {mode === 'sell' && maxQuantity < 1 && <p className="mt-2 text-xs font-semibold text-rose-600">Chưa có vàng nhẫn trong danh mục để bán.</p>}
          </div>

          <div className="rounded-2xl border border-[#dfe9e4] bg-[#f8fbf9] p-4">
            {loadingPrice ? <p className="mb-2 text-xs text-slate-500">Đang tải giá vàng hiện tại...</p> : hasLiveQuote ? (
              <p className="mb-2 text-xs font-semibold text-[#047857]">
                Đề xuất từ giá {mode === 'buy' ? 'bán ra' : 'mua vào'} niêm yết lúc {prices?.time} ngày {prices?.date.split('-').reverse().join('/')}.
              </p>
            ) : <p className="mb-2 text-xs font-semibold text-amber-800">Chưa lấy được giá hiện tại. Nhập giá thực tế mỗi chỉ trước khi lưu.</p>}
            <label htmlFor="gold-trade-price" className="block text-xs font-bold text-[#15231d]">Giá {mode === 'buy' ? 'mua' : 'bán'} mỗi chỉ (đ)</label>
            <input id="gold-trade-price" type="number" min="1" step="1" value={priceDraft ?? (suggestedPrice || '')} onChange={(event) => setPriceDraft(event.target.value)} placeholder="Giá mỗi chỉ (đ)" disabled={loadingPrice} className="mt-2 h-11 w-full rounded-xl border border-[#dfe9e4] bg-white px-3 text-sm font-semibold text-[#15231d] focus:border-[#00ab60] focus:outline-none disabled:opacity-60" />
            <div className="mt-2 flex items-center justify-between gap-3 text-sm text-slate-600"><span>Giá {mode === 'buy' ? 'mua' : 'bán'} / chỉ</span><strong className="text-base text-[#15231d]">{unitPrice > 0 ? money(unitPrice) : 'Chưa có giá'}</strong></div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#dfe9e4] pt-3"><span className="text-sm font-black text-[#15231d]">Tổng tiền {mode === 'buy' ? 'dự kiến' : 'thu về'}</span><strong className="text-xl font-black tabular-nums text-[#00ab60]">{money(total)}</strong></div>
            <p className="mt-2 text-[11px] text-slate-400">Giá tham khảo tại thời điểm ghi nhận, không phải lệnh giao dịch trực tuyến.</p>
            <label className="mt-3 block text-xs font-bold">{mode === 'buy' ? 'Thanh toán từ ví' : 'Nhận tiền vào ví'}
              <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as FundingMethod)} className="mt-2 w-full rounded-xl border p-2">
                <option value="transfer">Ngân hàng · {money(walletSummary.bankBalance)}</option>
                <option value="cash">Tiền mặt · {money(walletSummary.cashBalance)}</option>
              </select>
            </label>
            <p className="mt-2 text-xs">Tổng tiền khả dụng: <strong>{money(Math.max(0, walletSummary.totalBalance))}</strong></p>
            {fundingError && <p role="alert" className="mt-2 text-xs font-bold text-rose-600">{fundingError}</p>}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
          {error && <p role="alert" className="mb-2 text-xs font-bold text-rose-600">{error}</p>}
          <button type="submit" disabled={!canSubmit} className="h-12 w-full rounded-xl bg-[#00ab60] text-sm font-black text-white shadow-sm transition hover:bg-[#009653] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Đang lưu giao dịch...' : mode === 'buy' ? 'Lưu giao dịch mua vàng' : 'Lưu giao dịch bán vàng'}</button>
        </div>
      </form>
    </div>
  )
}
