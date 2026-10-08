import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PaymentScreen from '../../src/PaymentScreen'
import { getDemoInvoice, type DemoPayment } from '../../src/demo-payments'
import '../../src/styles.css'
function QA() {
  const [payment, setPayment] = useState<DemoPayment | null>(null)
  useEffect(() => { fetch('/qa-payment' + location.search).then(r => r.json()).then(setPayment) }, [])
  useEffect(() => {
    if (!payment || payment.invoice.status === 'paid') return
    const controller = new AbortController()
    const interval = setInterval(() => { getDemoInvoice(payment, controller.signal).then(invoice => setPayment(old => old ? { ...old, invoice } : old)).catch(() => {}) }, 2000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [payment?.invoice.id, payment?.invoice.status])
  return <div className="tenant-app payment-state"><header className="flow-header"><button className="icon-button" aria-label="Quay lại" onClick={() => location.assign('/')}><span aria-hidden="true">←</span></button><h1>{payment?.invoice.status === 'paid' ? 'Biên lai' : 'Thanh toán'}</h1></header><main className="app-content">{payment && <PaymentScreen payment={payment} syncError="" onHome={() => location.assign('/')} />}</main></div>
}
createRoot(document.getElementById('root')!).render(<QA />)
