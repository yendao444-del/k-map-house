// Exact reference quotes for reproducible visual checks; never bundled in app.
const state = new URLSearchParams(location.search).get('state')
export const fetchMyHanhPrices = async () => ({
  success: state !== 'error', stale: state === 'stale' || state === 'error', source: 'Tuấn Quảng Đông',
  quotedAt: '2026-10-20T12:01:00.000Z', unit: 'VND/chi',
  sourceUrl: 'https://tuanquangdong.com/gia-vang/my-hanh/',
  error: state === 'error' ? 'Chưa lấy được giá Mỹ Hạnh. Vui lòng thử lại.' : undefined,
  products: state === 'error' ? [] : [{ code: 'MH9999', name: 'Vàng MH 9999', metal: 'gold', buyPerChi: 13250000, sellPerChi: 13550000 }]
})
export const fetchGoldHistory = async () => ({
  success: state !== 'error', source: 'Tuấn Quảng Đông',
  coverageStart: state === 'single' ? '2026-10-20' : '2026-10-19', coverageEnd: '2026-10-20',
  history: state === 'error' ? [] : (state === 'single' ? ['2026-10-20'] : ['2026-10-20', '2026-10-19']).map(date => ({
    date, prices: { MH9999: { name: 'Vàng MH 9999', buy: 132500000, sell: 135500000 } }
  })),
  note: state === 'error' ? 'Chưa tải được lịch sử Mỹ Hạnh. Vui lòng thử lại.' : 'Chỉ hiển thị dữ liệu đã ghi nhận trên máy.'
})
export const fetchCurrentGoldPrices = async () => ({
  success: true, source: 'live', livePriceCodes: ['MH9999'], myHanh: await fetchMyHanhPrices(),
  prices: { MH9999: { name: 'Vàng MH 9999', buy: 132500000, sell: 135500000, currency: 'VND' } }
})
export const suggestedMyHanhPricePerChi = (response, type) => !response?.success || response.stale ? 0 : type === 'buy' ? 13550000 : 13250000
export const suggestedGoldPricePerChi = (_response, symbol, type) => symbol === 'MH9999' ? type === 'buy' ? 13550000 : 13250000 : 0
