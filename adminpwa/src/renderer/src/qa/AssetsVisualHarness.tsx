import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AssetsTab } from '../components/AssetsTab'
// Fixture-only visual surface. Never submit handovers or change assets here.
const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
const rooms = [{ id: 'fixture141', name: 'Phòng 141', status: 'occupied' }, { id: 'fixture142', name: 'Phòng 142', status: 'occupied' }]
const names = ['Giường', 'Tủ lạnh', 'Điều hòa', 'Đèn', 'Bàn ghế', 'Tủ quần áo', 'Khóa cửa']
const assets = rooms.flatMap(room => names.map((name, i) => ({ id: `${room.id}-${i}`, room_id: room.id, name, quantity: 1 })))
const snaps = assets.map(asset => ({ room_id: asset.room_id, room_asset_id: asset.id, type: 'move_in', condition: 'good' }))
client.setQueryData(['rooms'], rooms)
client.setQueryData(['allRoomAssets'], assets)
client.setQueryData(['asset_snapshots', 'room-list-move-in', rooms.map(room => room.id)], snaps)
for (const room of rooms) {
  client.setQueryData(['room_assets', room.id], assets.filter(asset => asset.room_id === room.id))
  client.setQueryData(['asset_snapshots', room.id, 'move_in'], snaps.filter(snap => snap.room_id === room.id))
  client.setQueryData(['asset_snapshots', room.id, 'move_out'], [])
  client.setQueryData(['asset_snapshots', room.id, 'handover'], [])
}
export default function AssetsVisualHarness() {
  return <QueryClientProvider client={client}><div className="pwa-app flex h-dvh flex-col"><div className="shrink-0 border-b bg-white p-3 text-sm font-bold">AN KHANG HOME · QA giả lập</div><main className="pwa-mobile-main flex min-h-0 flex-1"><AssetsTab /></main><nav className="pwa-bottom-nav"><button>Phòng</button><button>Hóa đơn</button><button>Tài chính</button><button aria-current="page">Thêm</button></nav></div></QueryClientProvider>
}
