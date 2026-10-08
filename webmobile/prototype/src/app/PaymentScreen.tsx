import { useEffect, useState } from 'react'
import { CheckCircle2, Copy } from 'lucide-react'
import { money } from './fixtures'
import { type DemoPayment } from './demo-payments'

export default function PaymentScreen({ payment, onHome, syncError }: { payment: DemoPayment; onHome: () => void; syncError: string }) {
  const { invoice } = payment
  const fields = invoice.details
  const isBankQr = invoice.qrKind === 'bank'
  const fmtDate = (date: string) => date.split('T')[0].split('-').reverse().join('/')
  const [message, setMessage] = useState('')
  useEffect(() => { setMessage('') }, [invoice.status, invoice.notice])
  async function copy() {
    try { await navigator.clipboard.writeText(invoice.transferContent); setMessage('Đã sao chép mã chuyển khoản demo.') } catch { setMessage('Chưa sao chép được. Bạn có thể chọn mã trên màn hình.') }
  }
  const date = invoice.receipt ? new Date(invoice.receipt.date).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }) : ''
  return <section className="payment-screen compact-payment">
    <span className="badge pending">{isBankQr ? 'Hóa đơn demo · QR tài khoản thật' : 'DEMO · Không chuyển tiền thật'}</span>
    {invoice.status === 'paid' ? <><CheckCircle2 className="payment-success-icon" aria-hidden="true" /><h2>Thanh toán demo thành công</h2><p className="payment-room">Phòng {invoice.room} · Tháng {String(invoice.month).padStart(2, '0')}/{invoice.year}</p><strong className="payment-total">{money(invoice.paid)}</strong><p className="payment-status">Đã khớp giao dịch SePay mô phỏng.</p><dl className="payment-receipt"><div><dt>Người thuê</dt><dd>{invoice.tenantName}</dd></div><div><dt>Thời điểm</dt><dd>{date}</dd></div><div><dt>Hình thức</dt><dd>Chuyển khoản · SePay demo</dd></div><div><dt>Mã giao dịch demo</dt><dd>{invoice.receipt?.transactionRef}</dd></div></dl></> : <>
      <h2>Hóa đơn tháng {String(invoice.month).padStart(2, '0')}/{invoice.year}</h2><p className="payment-room">Phòng {invoice.room} · {invoice.tenantName}</p><strong className="payment-total">{money(invoice.remaining)}</strong>
      <div className="payment-transfer"><div className="payment-qr"><img src={invoice.qr} width="200" height="200" alt={isBankQr ? `QR chuyển khoản ${invoice.bank.name} của ${invoice.bank.owner}` : 'QR thử nghiệm không dùng chuyển khoản ngân hàng'} /><p>{isBankQr ? 'VietQR · BIDV' : 'QR thử nghiệm · không thanh toán thật'}</p></div>
      <div className="payment-reference">{isBankQr && <div className="payment-recipient"><strong>{invoice.bank.owner}</strong><span>{invoice.bank.name} · {invoice.bank.account}</span></div>}<span>Nội dung chuyển khoản</span><strong>{invoice.transferContent}</strong><button className="text-button" onClick={copy}><Copy aria-hidden="true" />Sao chép mã</button></div></div>
      {isBankQr && <p className="recipient-warning">Chỉ chuyển vào <strong>{invoice.bank.owner} · {invoice.bank.name}</strong>, đúng STK trên và giữ nguyên nội dung chuyển khoản. <span>Hóa đơn demo: chưa chuyển tiền; SePay đang mô phỏng.</span></p>}
      <p className={`payment-status ${invoice.status === 'review' ? 'payment-review' : ''}`} role="status">{invoice.status === 'review' ? invoice.notice : 'Chờ thanh toán demo · Tự động cập nhật'}</p>
    </>}
    <dl className="invoice-compact-meta" aria-label="Thông tin hóa đơn">
      <div><dt>Mã hóa đơn</dt><dd>{fields.invoice_number}</dd></div>
      <div><dt>Kỳ tính tiền</dt><dd>{fmtDate(fields.billing_period_start)} – {fmtDate(fields.billing_period_end)}</dd></div>
      <div><dt>Ngày lập</dt><dd>{fmtDate(fields.invoice_date)}</dd></div>
    </dl>
    <section className="invoice-summary" aria-label="Các khoản thu">
      <dl>{invoice.lines.filter(line => line.amount !== 0 || ['Tiền điện', 'Tiền nước'].includes(line.label)).map(line => {
        const meter = line.label === 'Tiền điện' ? 'electric' : line.label === 'Tiền nước' ? 'water' : null
        const reading = meter ? invoice.readings[meter] : null
        return <div key={line.label} className={meter ? `invoice-meter-line invoice-meter-${meter}` : undefined}><dt>{line.label}{meter && reading ? <small>{reading.old === null ? `Bàn giao: ${reading.new} · ${line.detail}` : `${reading.old} → ${reading.new} · ${line.detail}`}</small> : line.label === 'Tiền phòng' ? <small>{line.detail}</small> : line.label === 'Điều chỉnh' && fields.adjustment_note ? <small>{fields.adjustment_note}</small> : null}</dt><dd>{money(line.amount)}</dd></div>
      })}
        {fields.deposit_amount !== 0 && <div><dt>{fields.deposit_amount > 0 ? 'Thu tiền cọc' : 'Trả tiền cọc'}</dt><dd>{money(fields.deposit_amount)}</dd></div>}
        {fields.deposit_applied !== 0 && <div><dt>Cọc bù trừ</dt><dd>{money(fields.deposit_applied)}</dd></div>}
        {fields.damage_amount !== 0 && <div><dt>Chi phí hư hỏng</dt><dd>{money(fields.damage_amount)}</dd></div>}
        <div className="invoice-summary-total"><dt>Tổng cộng</dt><dd>{money(invoice.total)}</dd></div>
        {invoice.paid > 0 && <><div><dt>Đã thanh toán</dt><dd>{money(invoice.paid)}</dd></div>{invoice.remaining > 0 && <div><dt>Còn phải trả</dt><dd>{money(invoice.remaining)}</dd></div>}</>}
      </dl>
      {invoice.status !== 'paid' && <p className="invoice-due">Hạn thanh toán: {fmtDate(fields.due_date)}</p>}
      <p className="invoice-words">{fields.amount_in_words}</p>
      {fields.note && <p className="invoice-note">{fields.note}</p>}
    </section>
    {syncError && <p className="error-message" role="alert">{syncError}</p>}
    <footer className="invoice-property"><strong>{fields.property_name}</strong>{fields.property_address && !fields.property_address.includes('chưa kết nối') && <span>{fields.property_address}</span>}{fields.owner_phone && !fields.owner_phone.includes('demo') && <span>Liên hệ: {fields.owner_phone}</span>}</footer>
    <button className="secondary-button" onClick={onHome}>Về trang chủ</button>

    {message && <p className="demo-note" role="status">{message}</p>}
  </section>
}
