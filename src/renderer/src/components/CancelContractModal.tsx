import { useQuery } from '@tanstack/react-query'
import { getContracts, type Room } from '../lib/db'
import { ContractLifecycleDialog } from './ContractLifecycleDialog'

export function CancelContractModal({ room, onClose }: { room: Room; onClose: () => void }) {
  const query = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const contract = query.data?.find(item => item.room_id === room.id && item.status === 'active')
  if (contract) return <ContractLifecycleDialog contract={contract} room={room} mode="cancel" onClose={onClose} />
  return <div className="fixed inset-0 z-[440] flex items-center justify-center bg-black/30 p-5"><section role="dialog" aria-modal="true" aria-label="Hủy hợp đồng" className="rounded-xl bg-white p-6 text-sm"><p>{query.isPending ? 'Đang tải hợp đồng…' : query.error?.message || 'Không còn hợp đồng hiệu lực ở phòng này.'}</p><button type="button" onClick={onClose} className="mt-4 font-semibold text-primary">Đóng</button></section></div>
}
