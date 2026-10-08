import React, { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContracts, getRooms, getAppSettings, getInvoices, getCollectedDepositAmount, type Contract, type ContractStatus, type Invoice, type Room } from '../lib/db'
import { createPortal } from 'react-dom'
import { MoreHorizontal, FileText, Pencil, Ban, Clock3, Search, X, RefreshCw } from 'lucide-react'
import { ContractLifecycleDialog } from './ContractLifecycleDialog'
import { ContractConfirmationHistory } from './ContractConfirmationHistory'
import { getContractHistory, getPendingCancellationNotices, sendContractCancellationNotice, getContractAccountReadiness } from '../lib/contract-confirmation'
import { matchesContractSearch } from '../lib/contract-search'
import { ContractViewModal } from './ContractViewModal'
import type { ContractDraft } from '../lib/contract-draft'
import { cancelContractDraft, getContractDrafts } from '../lib/contract-drafts'

const formatVND = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—')

const STATUS_OPTIONS: { id: 'all' | ContractStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'active', label: 'Đang hiệu lực' },
  { id: 'expired', label: 'Đã hết hạn' },
  { id: 'terminated', label: 'Đã thanh lý' },
  { id: 'cancelled', label: 'Đã hủy' }
]

const getStatusLabel = (status: ContractStatus) => {
  switch (status) {
    case 'active': return 'Đang hiệu lực'
    case 'expired': return 'Đã hết hạn'
    case 'terminated': return 'Đã thanh lý'
    case 'cancelled': return 'Đã hủy'
    default: return status
  }
}

const getStatusClassName = (status: ContractStatus) => {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-700'
    case 'terminated': return 'bg-slate-100 text-slate-600'
    case 'cancelled': return 'bg-red-100 text-red-600'
    case 'expired': return 'bg-orange-100 text-orange-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// =====================================================================
// ContractsTab
// =====================================================================
interface ContractsTabProps {
  onCreateContract?: (room: Room, draft?: ContractDraft) => void
}

export const ContractsTab: React.FC<ContractsTabProps> = ({ onCreateContract }) => {
  const queryClient = useQueryClient()
  const contractsQuery = useQuery({ queryKey: ['contracts'], queryFn: getContracts, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: 15000 })
  const contracts = contractsQuery.data || []
  const readinessQuery = useQuery({ queryKey: ['contract-account-readiness'], queryFn: getContractAccountReadiness, refetchOnMount: 'always', refetchInterval: 15000 })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: settings } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings })
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('all')
  const [search, setSearch] = useState('')
  const [isPickingRoom, setIsPickingRoom] = useState(false)
  const draftsQuery = useQuery({ queryKey: ['contractDrafts'], queryFn: getContractDrafts })
  const [draftError, setDraftError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let disposed = false
    void (async () => {
      const pending = await getPendingCancellationNotices()
      for (const id of pending) {
        if (disposed) break
        const feedback = await sendContractCancellationNotice(id)
        if (!disposed) setNotice(feedback)
      }
    })().catch(() => { /* Non-admin sessions cannot process notification outbox. */ })
    return () => { disposed = true }
  }, [])
  const cancelDraft = useMutation({ mutationFn: cancelContractDraft, onSuccess: () => { setDraftError(''); void queryClient.invalidateQueries({ queryKey: ['contractDrafts'] }) }, onError: error => setDraftError(error instanceof Error ? error.message : 'Không hủy được bản nháp.') })

  const [viewingContractId, setViewingContractId] = useState<string | null>(null)
  const [lifecycle, setLifecycle] = useState<{ contract: Contract; mode: 'edit' | 'cancel' } | null>(null)
  const [menu, setMenu] = useState<{ contract: Contract; x: number; y: number } | null>(null)
  const [historyContract, setHistoryContract] = useState<Contract | null>(null)
  const historyQuery = useQuery({ queryKey: ['contract-history', historyContract?.id], queryFn: () => getContractHistory(historyContract!.id), enabled: Boolean(historyContract), refetchInterval: historyContract ? 5000 : false, retry: false })
  useEffect(() => { if (!menu) return; const close = () => setMenu(null); const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }; window.addEventListener('resize', close); document.addEventListener('keydown', key); return () => { window.removeEventListener('resize', close); document.removeEventListener('keydown', key) } }, [menu])

  const filteredContracts = contracts.filter(contract => (statusFilter === 'all' || contract.status === statusFilter)
    && matchesContractSearch(search, [rooms.find(room => room.id === contract.room_id)?.name || contract.room_id, contract.tenant_name, contract.id], contract.tenant_phone))
  const filteredDrafts = draftsQuery.data?.filter(draft => matchesContractSearch(search, [rooms.find(room => room.id === draft.room_id)?.name || draft.snapshot.room.name, draft.snapshot.tenant.full_name, draft.id, draft.recipient_email], draft.snapshot.tenant.phone)) || []

  const viewingContract = contracts.find(c => c.id === viewingContractId)
  const viewingRoom = viewingContract ? rooms.find(r => r.id === viewingContract.room_id) : undefined

  if (isPickingRoom) {
    const vacantRooms = rooms.filter(room => room.status === 'vacant')
    return <div className="flex-1 overflow-y-auto bg-[var(--brand-canvas)] p-5">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-6 py-5">
          <div><h2 className="text-xl font-bold text-[var(--brand-shell)]">Chọn phòng để lập hợp đồng</h2><p className="mt-1 text-sm text-[var(--brand-muted)]">Chọn phòng trống để mở trang lập hợp đồng</p></div>
          <button type="button" onClick={() => setIsPickingRoom(false)} className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-mint)]">Quay lại</button>
        </div>
        <div className="p-6">{vacantRooms.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{vacantRooms.map(room => <button key={room.id} type="button" onClick={() => { setIsPickingRoom(false); onCreateContract?.(room) }} className="rounded-xl border border-[var(--brand-border)] p-5 text-left transition hover:-translate-y-0.5 hover:border-primary hover:bg-[var(--brand-mint)]"><p className="text-lg font-bold text-[var(--brand-shell)]">{room.name}</p><p className="mt-2 text-sm font-semibold text-primary">{formatVND(room.base_rent)} đ / tháng</p><p className="mt-1 text-xs text-[var(--brand-muted)]">{room.area ? `${room.area} m²` : 'Chưa có diện tích'} · Trống</p><span className="mt-4 inline-flex rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">Lập hợp đồng</span></button>)}</div> : <div className="py-16 text-center text-sm text-[var(--brand-muted)]">Hiện không có phòng trống để lập hợp đồng.</div>}</div>
      </div>
    </div>
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 relative">
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3"><div className="relative min-w-[240px] flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-3 text-[var(--brand-muted)]" /><input aria-label="Tìm hợp đồng theo phòng, số điện thoại hoặc tên khách" placeholder="Tìm số phòng, số điện thoại hoặc tên khách…" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border border-[var(--brand-border)] bg-white py-2.5 pl-10 pr-10 text-sm outline-none focus:border-primary" />{search && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')} className="absolute right-2 top-2 rounded-lg p-1 text-[var(--brand-muted)]"><X size={18} /></button>}</div><button type="button" disabled={contractsQuery.isFetching || readinessQuery.isFetching} onClick={() => { void contractsQuery.refetch(); void readinessQuery.refetch(); void draftsQuery.refetch(); void queryClient.invalidateQueries({ queryKey: ['activeContracts'] }); void queryClient.invalidateQueries({ queryKey: ['rooms'] }) }} className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-2.5 text-sm text-[var(--brand-shell)] disabled:opacity-50"><RefreshCw size={16} className={contractsQuery.isFetching ? 'animate-spin' : ''} />Làm mới</button></div>
      {contractsQuery.isError && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Không tải được hợp đồng. Bấm Làm mới để thử lại.</p>}
      {readinessQuery.isError && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Chưa tải được trạng thái tài khoản website. Danh sách hợp đồng vẫn được giữ; bấm Làm mới để kiểm tra lại.</p>}
      {(draftsQuery.isError || draftError) && <p role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{draftError || 'Không tải được danh sách bản nháp hợp đồng. Hãy thử lại.'}</p>}
      {Boolean(filteredDrafts.length) && <section className="mb-4 rounded-xl border border-[var(--brand-border)] bg-white p-5"><h2 className="text-base font-bold text-[var(--brand-shell)]">Bản nháp hợp đồng</h2><p className="mt-1 text-xs text-[var(--brand-muted)]">Bản nháp hoặc bản sửa đang chờ xác nhận</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredDrafts.map(draft => {
        const room = rooms.find(item => item.id === draft.room_id)
        return <div key={draft.id} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-canvas)] p-4"><p className="text-sm font-bold text-[var(--brand-shell)]">{room?.name || draft.snapshot.room.name} · {draft.snapshot.tenant.full_name}</p><p className="mt-1 text-xs text-[var(--brand-muted)]">{draft.recipient_email || 'Chưa có email nhận xác nhận'}</p>{draft.parent_contract_id && <p className="mt-1 text-xs font-semibold text-amber-700">Bản sửa · Hợp đồng hiện tại vẫn có hiệu lực</p>}<div className="mt-3 flex items-center gap-3"><button type="button" disabled={!room || cancelDraft.isPending} onClick={() => { if (room) onCreateContract?.(room, draft) }} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{draft.parent_contract_id ? 'Tiếp tục bản sửa' : 'Tiếp tục lập hợp đồng'}</button><button type="button" disabled={cancelDraft.isPending} onClick={() => cancelDraft.mutate(draft)} className="text-xs text-[var(--brand-muted)] hover:text-rose-600 disabled:opacity-40">Hủy bản nháp</button></div></div>
      })}</div></section>}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Danh sách hợp đồng</h2>
            <p className="text-sm text-gray-500 mt-1">Quản lý toàn bộ hợp đồng thuê theo trạng thái</p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => { setIsPickingRoom(true) }}
              className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
            >
              <i className="fa-solid fa-plus"></i>
              Lập hợp đồng mới
            </button>

            <div className="h-8 w-px bg-gray-200 mx-2 hidden lg:block"></div>

            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={`px-3 py-2 text-xs font-bold rounded-lg transition ${statusFilter === option.id
                    ? 'bg-primary/10 text-primary'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[860px] text-sm text-left">
            <thead className="bg-gray-50/80 text-gray-500 font-semibold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4">Mã HĐ</th>
                <th className="px-5 py-4">Phòng</th>
                <th className="px-5 py-4">Khách thuê</th>
                <th className="px-5 py-4">Ngày vào</th>
                <th className="px-5 py-4 text-right">Giá thuê</th>
                <th className="px-5 py-4 text-right">Tiền cọc</th>
                <th className="px-5 py-4 text-center">Trạng thái</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredContracts.map((contract) => {
                const room = rooms.find((item) => item.id === contract.room_id)
                const readiness = readinessQuery.data?.find(item => item.contractId === contract.id)
                return (
                  <tr key={contract.id} className="hover:bg-gray-50 transition group">
                    <td className="px-5 py-4 text-xs font-mono text-gray-400">
                      ...{contract.id.slice(-6)}
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-800">
                      {room?.name || contract.room_id}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-700">{contract.tenant_name}{contract.tenant_phone && <p className="mt-1 text-xs font-normal text-gray-500">{contract.tenant_phone}</p>}</td>
                    <td className="px-5 py-4 text-gray-600">{formatDate(contract.move_in_date)}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-primary">
                      {formatVND(contract.base_rent)} đ
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-gray-600">
                      {formatVND(getCollectedDepositAmount(contract, invoices as Invoice[]))} / {formatVND(contract.deposit_amount)} đ
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${getStatusClassName(contract.status)}`}>
                        {getStatusLabel(contract.status)}
                      </span>
                      {readiness && readiness.status !== 'ready' && <p title={readiness.reason} className="mt-2 text-[11px] font-semibold text-amber-700">{readiness.status === 'locked' ? 'Tài khoản website đang khóa' : 'Chưa hoàn tất tài khoản'}{readiness.reason && <span className="mt-1 block max-w-[280px] text-left font-normal leading-4">{readiness.reason}</span>}</p>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" aria-label={`Thao tác hợp đồng ${room?.name || contract.id}`} aria-haspopup="menu" aria-expanded={menu?.contract.id === contract.id} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu(menu?.contract.id === contract.id ? null : { contract, x: Math.max(8, rect.right - 236), y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 220)) }) }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--brand-border)] text-[var(--brand-shell)] hover:bg-[var(--brand-mint)]"><MoreHorizontal size={20} /></button>

                    </td>
                  </tr>
                )
              })}

              {filteredContracts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    <i className="fa-solid fa-file-contract text-4xl mb-4 block text-gray-300"></i>
                    <p className="text-sm font-medium">{contractsQuery.isPending ? 'Đang tải hợp đồng…' : 'Không có hợp đồng nào phù hợp với tìm kiếm và bộ lọc.'}</p>
                    {!contractsQuery.isPending && (search || statusFilter !== 'all') && <button type="button" onClick={() => { setSearch(''); setStatusFilter('all') }} className="mt-3 text-sm font-semibold text-primary">Xóa tìm kiếm và xem tất cả</button>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingContractId && viewingContract && viewingRoom && (
        <ContractViewModal
          contract={viewingContract}
          room={viewingRoom}
          settings={settings || {}}
          onClose={() => setViewingContractId(null)}
        />
      )}

      {menu && createPortal(<div className="fixed inset-0 z-[420]" onClick={() => setMenu(null)}>
        <div role="menu" aria-label="Thao tác hợp đồng" style={{ left: menu.x, top: menu.y }} className="fixed w-[236px] rounded-xl border border-[var(--brand-border)] bg-white p-1.5 shadow-xl">
          <button type="button" role="menuitem" onClick={() => setViewingContractId(menu.contract.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--brand-shell)] hover:bg-[var(--brand-mint)]"><FileText size={16} />Xem / in hợp đồng</button>
          <button type="button" role="menuitem" onClick={() => setHistoryContract(menu.contract)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--brand-shell)] hover:bg-[var(--brand-mint)]"><Clock3 size={16} />Lịch sử hợp đồng</button>
          {menu.contract.status === 'cancelled' && <button type="button" role="menuitem" onClick={() => setLifecycle({ contract: menu.contract, mode: 'cancel' })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--brand-shell)] hover:bg-[var(--brand-mint)]"><FileText size={16} />Thông báo hủy / gửi lại</button>}
          {menu.contract.status === 'active' && <><button type="button" role="menuitem" onClick={() => setLifecycle({ contract: menu.contract, mode: 'edit' })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--brand-shell)] hover:bg-[var(--brand-mint)]"><Pencil size={16} />Sửa hợp đồng</button><button type="button" role="menuitem" onClick={() => setLifecycle({ contract: menu.contract, mode: 'cancel' })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-rose-700 hover:bg-rose-50"><Ban size={16} />Hủy do lập nhầm</button></>}
        </div>
      </div>, document.body)}
      {lifecycle && rooms.find(room => room.id === lifecycle.contract.room_id) && <ContractLifecycleDialog contract={lifecycle.contract} room={rooms.find(room => room.id === lifecycle.contract.room_id)!} mode={lifecycle.mode} onCancelled={() => setNotice('Đã hủy hợp đồng. Phòng về trống, link đã thu hồi và lịch sử được giữ lại.')} onClose={() => setLifecycle(null)} onAmendment={draft => { const room = rooms.find(item => item.id === draft.room_id); if (room) onCreateContract?.(room, draft) }} />}
      {historyContract && <ContractConfirmationHistory events={historyQuery.data || []} loading={historyQuery.isPending} error={historyQuery.error?.message} refreshing={historyQuery.isFetching} onRefresh={() => void historyQuery.refetch()} onClose={() => setHistoryContract(null)} />}


    </div>
  )
}
