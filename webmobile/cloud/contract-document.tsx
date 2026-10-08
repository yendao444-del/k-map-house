import { renderToStaticMarkup } from 'react-dom/server'
import { ContractPrintTemplate } from '../../src/renderer/src/components/ContractPrintTemplate'
import { previewContract, type ContractDraftSnapshot } from '../../src/renderer/src/lib/contract-draft'
import type { Room } from '../../src/renderer/src/lib/db'
import { contractChanges } from '../../src/shared/contract-changes'

export function renderContractDocument(snapshot: ContractDraftSnapshot, date: string): string {
  const { form, services, assets } = snapshot
  const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
  return renderToStaticMarkup(<>
    {snapshot.amendment && <section style={{ padding: 16, background: '#eef8f2', marginBottom: 24, fontSize: 13, lineHeight: 1.7 }}>
      <h2>BẢN SỬA HỢP ĐỒNG · NỘI DUNG THAY ĐỔI</h2><p>Lý do: {snapshot.amendment.reason}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr><th>Nội dung</th><th>Hiện tại</th><th>Đề xuất</th></tr></thead><tbody>{contractChanges(snapshot.amendment.previousForm, form).map(change => <tr key={change.label}><th style={{ padding: 8 }}>{change.label}</th><td style={{ padding: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{change.before}</td><td style={{ padding: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{change.after}</td></tr>)}</tbody></table>
      <p>Bản hiện tại vẫn có hiệu lực đến khi bạn xác nhận. Bản sửa giữ nguyên hóa đơn, chỉ số hiện tại và giao dịch đã ghi nhận.</p>
    </section>}
    <ContractPrintTemplate contract={previewContract(snapshot, date)} room={snapshot.room as Room} settings={snapshot.settings} compact />
    <section style={{ borderTop: '1px solid #ddd', marginTop: 24, paddingTop: 16, fontSize: 13, lineHeight: 1.7 }}>
      <h2>PHỤ LỤC · THÔNG TIN PHÒNG VÀ BÀN GIAO</h2>
      <p>Số người ở: {form.occupantCount} · Chỉ số điện: {form.electricInitial} · Chỉ số nước: {form.waterInitial}</p>
      <p>Điện: {money(services.electricPrice)} đ/kWh · Nước: {money(services.waterPrice)} đ/m³</p>
      <p>Internet: {money(services.internetPrice)} đ/tháng · Vệ sinh: {money(services.cleaningPrice)} đ/tháng</p>
      <ul>{assets.map(asset => <li key={asset.id}>{asset.name} · SL {asset.quantity} · {asset.condition}</li>)}</ul>
      {form.additionalTerms && <><h3>ĐIỀU KHOẢN BỔ SUNG</h3><p style={{ whiteSpace: 'pre-wrap' }}>{form.additionalTerms}</p></>}
    </section>
  </>)
}
