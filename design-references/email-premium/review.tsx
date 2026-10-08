import React from 'react'
import { createRoot } from 'react-dom/client'
import { createNotificationTestCase } from '../../src/renderer/src/lib/email-notification-testing'
import { notificationEmailPreviewHtml } from '../../src/shared/notification-email-assets'
import type { NotificationType } from '../../src/renderer/src/lib/notification-email'

const examples: Array<[string, NotificationType, string]> = [
  ['Thanh toán', 'sepay_matched', 'full'],
  ['Cần đối soát', 'sepay_unmatched', 'partial'],
  ['Nhắc công nợ', 'rent_long_unpaid', 'sample']
]
createRoot(document.getElementById('root')!).render(
  <>
    <style>{`*{box-sizing:border-box}body{margin:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#10233f}main{padding:40px 28px;max-width:1536px;margin:auto}.brand{margin:0 12px 30px;font-size:16px;letter-spacing:2px;font-weight:600}.examples{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}h2{margin:0 12px;font-size:22px}article{min-width:0}@media(max-width:1000px){.examples{grid-template-columns:1fr}main{padding:24px 4px}}`}</style>
    <main>
      <p className="brand">MẪU EMAIL · AN KHANG HOME</p>
      <div className="examples">
        {examples.map(([label, type, scenario]) => {
          const mail = createNotificationTestCase(
            type,
            scenario,
            'Tài khoản mẫu',
            new Date(2026, 9, 6, 12)
          )
          // The test marker stays visible in the sandbox. This comparison sheet contains email cards only.
          const html = mail.mail.html.slice(mail.mail.html.indexOf('<style>'))
          return (
            <article key={type} aria-label={label}>
              <h2>{label}</h2>
              <div dangerouslySetInnerHTML={{ __html: notificationEmailPreviewHtml(html) }} />
            </article>
          )
        })}
      </div>
    </main>
  </>
)
