const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { CircleAlert, Clock3, Info, CalendarClock } = require('lucide-react')
const sharp = require('sharp')
const statuses = [
  ['danger', CircleAlert, '#b42318'],
  ['warning', Clock3, '#b45309'],
  ['info', Info, '#1d4ed8'],
  ['reminder', CalendarClock, '#6d28d9']
]
async function run() {
  const lines = [
    "import { PAYMENT_SUCCESS_ICON_BASE64, PAYMENT_SUCCESS_ICON_CID } from './payment-email-assets'",
    '// Standard Lucide status icons rasterized to PNG for reliable Gmail CID rendering.',
    'export const notificationEmailIcons = {',
    "  success: { cid: PAYMENT_SUCCESS_ICON_CID, base64: PAYMENT_SUCCESS_ICON_BASE64 },"
  ]
  for (const [name, Icon, color] of statuses) {
    const svg = renderToStaticMarkup(React.createElement(Icon, { size: 64, color, strokeWidth: 2.5 }))
    const bytes = await sharp(Buffer.from(svg)).png().toBuffer()
    fs.writeFileSync(path.resolve('src/renderer/src/assets', `email-status-${name}.png`), bytes)
    lines.push(`  ${name}: { cid: 'email-${name}@ankhanghome', base64: '${bytes.toString('base64')}' },`)
  }
  lines.push('} as const', '',
    'export function notificationEmailPreviewHtml(html: string): string {',
    '  for (const icon of Object.values(notificationEmailIcons))',
    "    html = html.replaceAll('cid:' + icon.cid, 'data:image/png;base64,' + icon.base64)",
    '  return html', '}', '')
  fs.writeFileSync(path.resolve('src/shared/notification-email-assets.ts'), lines.join('\n'))
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
