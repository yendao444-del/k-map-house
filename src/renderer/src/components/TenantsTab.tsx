import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenants, createTenant, updateTenant, deleteTenant, markTenantLeft, getRooms, getContracts, getInvoices, getCollectedDepositAmount, getMoveInReceiptsByTenant, type Contract, type Invoice, type Tenant, type MoveInReceipt } from '../lib/db';
import { ConfirmModal } from './ConfirmModal';
import { LogoLoading } from './LogoLoading';
import { TenantFormModal } from './TenantFormModal';
import { TenantIdentityPreview } from './TenantIdentityPreview';
import { useTenantEmailCheck } from '../lib/use-tenant-email-check';

const getContractSortTime = (contract: Contract) =>
  new Date(contract.end_date || contract.created_at || contract.move_in_date).getTime();

const formatDate = (date?: string) => {
  if (!date) return '—';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('vi-VN');
};

type DepositStatusTone = 'emerald' | 'amber' | 'sky' | 'slate' | 'red';

const getDepositStatus = (
  contract: Contract | null | undefined,
  invoices: Invoice[],
  collectedAmount?: number
) => {
  const deposit = Number(contract?.deposit_amount || 0);
  if (!contract || deposit <= 0) {
    return { label: 'Chưa có cọc', detail: '', tone: 'slate' as DepositStatusTone };
  }
  const collected = collectedAmount ?? getCollectedDepositAmount(contract, invoices);
  const missing = Math.max(0, deposit - collected);

  const relatedInvoices = invoices.filter(invoice =>
    invoice.tenant_id === contract.tenant_id &&
    invoice.room_id === contract.room_id &&
    invoice.payment_status !== 'cancelled'
  );
  const latestDepositInvoice = relatedInvoices
    .filter(invoice => invoice.is_settlement || invoice.billing_reason === 'contract_end' || invoice.billing_reason === 'deposit_refund')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  if (contract.status === 'active' && !latestDepositInvoice) {
    if (missing > 0) {
      return { label: collected > 0 ? 'Chưa thu đủ' : 'Chưa thu cọc', detail: `${collected.toLocaleString('vi-VN')} / ${deposit.toLocaleString('vi-VN')}₫`, tone: collected > 0 ? 'amber' as DepositStatusTone : 'red' as DepositStatusTone };
    }
    return { label: 'Đã thu đủ', detail: `${collected.toLocaleString('vi-VN')} / ${deposit.toLocaleString('vi-VN')}₫`, tone: 'emerald' as DepositStatusTone };
  }

  if (!latestDepositInvoice) {
    return { label: 'Chưa tất toán cọc', detail: `${deposit.toLocaleString('vi-VN')}₫`, tone: 'amber' as DepositStatusTone };
  }

  const netDue = Number(latestDepositInvoice.total_amount || 0);
  const depositApplied = Number(latestDepositInvoice.deposit_applied || 0);
  const refundAmount = Math.max(0, -netDue);

  if (refundAmount > 0) {
    return latestDepositInvoice.payment_status === 'paid'
      ? { label: 'Đã hoàn cọc', detail: `${refundAmount.toLocaleString('vi-VN')}₫`, tone: 'emerald' as DepositStatusTone }
      : { label: 'Chờ hoàn cọc', detail: `${refundAmount.toLocaleString('vi-VN')}₫`, tone: 'red' as DepositStatusTone };
  }

  if (depositApplied > 0 || latestDepositInvoice.is_settlement || latestDepositInvoice.billing_reason === 'contract_end') {
    if (netDue > 0) {
      return { label: 'Đã đối trừ cọc', detail: `Còn thiếu ${netDue.toLocaleString('vi-VN')}₫`, tone: 'sky' as DepositStatusTone };
    }
    return { label: 'Đã đối trừ hết', detail: `${Math.min(deposit, depositApplied || deposit).toLocaleString('vi-VN')}₫`, tone: 'sky' as DepositStatusTone };
  }

  return { label: 'Đã xử lý cọc', detail: `${deposit.toLocaleString('vi-VN')}₫`, tone: 'slate' as DepositStatusTone };
};

const depositToneClass: Record<DepositStatusTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
  red: 'bg-red-50 text-red-700 border-red-200',
};

export const TenantsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['tenants'], queryFn: getTenants });
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts });
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive' | 'left'>('all');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // addModalKey: mỗi lần mở modal mới thì tăng key để force remount hoàn toàn, tránh bug không gõ được phím
  const [addModalKey, setAddModalKey] = useState(0);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<Tenant | null>(null);
  const [confirmMarkLeft, setConfirmMarkLeft] = useState<Tenant | null>(null);
  const [cccdHover, setCccdHover] = useState<{ id: string, url: string, name: string, top: number, left: number, openUp: boolean } | null>(null);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
    };
  }, []);

  const updateStatusMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string, is_active: boolean }) =>
      updateTenant(id, {
        is_active,
        left_at: is_active ? undefined : new Date().toISOString().split('T')[0]
      }),
    onSuccess: (updatedTenant) => {
      queryClient.setQueryData<Tenant[]>(['tenants'], (prev = []) =>
        prev.map((tenant) => tenant.id === updatedTenant.id ? updatedTenant : tenant)
      );
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTenant(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Tenant[]>(['tenants'], (prev = []) => prev.filter((tenant) => tenant.id !== id));
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: any) => {
      alert('Không thể xóa khách thuê: ' + (err?.message || 'Lỗi không xác định.\nKhách này có thể còn hợp đồng hoặc hóa đơn liên kết.'));
    }
  });

  // Đánh dấu khách đã chuyển đi thủ công (không xóa, chỉ đổi trạng thái)
  const markLeftMut = useMutation({
    mutationFn: (id: string) => markTenantLeft(id),
    onSuccess: (updatedTenant) => {
      queryClient.setQueryData<Tenant[]>(['tenants'], (prev = []) =>
        prev.map((t) => t.id === updatedTenant.id ? updatedTenant : t)
      );
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    }
  });

  const [createError, setCreateError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) => createTenant(data),
    onSuccess: (createdTenant) => {
      queryClient.setQueryData<Tenant[]>(['tenants'], (prev = []) => [createdTenant, ...prev]);
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setIsAddModalOpen(false);
      setCreateError(null);
    },
    onError: (err: Error) => {
      setCreateError(err.message || 'Không thể thêm khách thuê. Vui lòng thử lại.');
    }
  });

  // Hàm mở modal thêm khách: luôn tăng key để force remount component, tránh bug input
  const openAddModal = useCallback(() => {
    setMenuOpenId(null); // đóng dropdown trước
    setSelectedTenant(null);
    setEditingTenant(null);
    setCccdHover(null);
    setCreateError(null);
    setIsAddModalOpen(false);
    setAddModalKey(k => k + 1);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAddModalOpen(true));
    });
  }, []);

  const tenantViewById = useMemo(() => {
    const roomById = new Map(rooms.map(room => [room.id, room]));
    const contractsByTenantId = new Map<string, Contract[]>();
    const invoicesByTenantRoom = new Map<string, Invoice[]>();
    const invoicesByRoom = new Map<string, Invoice[]>();

    for (const contract of contracts) {
      if (!contract.tenant_id) continue;
      const list = contractsByTenantId.get(contract.tenant_id) || [];
      list.push(contract);
      contractsByTenantId.set(contract.tenant_id, list);
    }
    for (const list of contractsByTenantId.values()) {
      list.sort((a, b) => getContractSortTime(b) - getContractSortTime(a));
    }
    for (const invoice of invoices) {
      const key = `${invoice.tenant_id}|${invoice.room_id}`;
      const list = invoicesByTenantRoom.get(key) || [];
      list.push(invoice);
      invoicesByTenantRoom.set(key, list);
      const roomInvoices = invoicesByRoom.get(invoice.room_id) || [];
      roomInvoices.push(invoice);
      invoicesByRoom.set(invoice.room_id, roomInvoices);
    }

    const result = new Map<string, {
      contracts: Contract[];
      activeContract: Contract | null;
      latestContract: Contract | null;
      room: (typeof rooms)[number] | null;
      isCurrentlyActive: boolean;
      hasLeft: boolean;
      searchText: string;
      depositStatus: ReturnType<typeof getDepositStatus>;
      collectedDeposit: number;
    }>();

    for (const tenant of tenants) {
      const tenantContracts = contractsByTenantId.get(tenant.id) || [];
      const activeContract = tenantContracts.find(contract => contract.status === 'active') || null;
      const latestContract = activeContract || tenantContracts[0] || null;
      const room = latestContract ? roomById.get(latestContract.room_id) || null : null;
      const hasPastContract = tenantContracts.some(contract => contract.status !== 'active');
      const isCurrentlyActive = Boolean(activeContract);
      const hasLeft = !isCurrentlyActive && (
        hasPastContract || tenant.is_active === false || Boolean(tenant.left_at) || Boolean(tenant.last_room_name)
      );
      const relatedInvoices = latestContract
        ? latestContract.tenant_id
          ? invoicesByTenantRoom.get(`${latestContract.tenant_id}|${latestContract.room_id}`) || []
          : invoicesByRoom.get(latestContract.room_id) || []
        : [];
      const collectedDeposit = getCollectedDepositAmount(latestContract, relatedInvoices);
      const depositStatus = getDepositStatus(latestContract, relatedInvoices, collectedDeposit);
      const roomNames = tenantContracts.map(contract => roomById.get(contract.room_id)?.name || '').join(' ');
      const contractText = tenantContracts
        .map(contract => `${contract.tenant_phone || ''} ${contract.tenant_id_card || ''}`)
        .join(' ');

      result.set(tenant.id, {
        contracts: tenantContracts,
        activeContract,
        latestContract,
        room,
        isCurrentlyActive,
        hasLeft,
        searchText: `${roomNames} ${contractText}`.toLowerCase(),
        depositStatus,
        collectedDeposit,
      });
    }

    return result;
  }, [contracts, invoices, rooms, tenants]);

  const filteredTenants = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return tenants.filter(t => {
      const view = tenantViewById.get(t.id);
      const isCurrentlyActive = view?.isCurrentlyActive || false;
      const hasLeft = view?.hasLeft || false;
      const isNeverStayed = !isCurrentlyActive && !hasLeft;

      if (filterActive === 'active' && !isCurrentlyActive) return false;
      if (filterActive === 'inactive' && !isNeverStayed) return false;
      if (filterActive === 'left' && !hasLeft) return false;

      if (normalizedSearch) {
        return (
          t.full_name?.toLowerCase().includes(normalizedSearch) ||
          t.phone?.includes(normalizedSearch) ||
          t.identity_card?.includes(normalizedSearch) ||
          view?.searchText.includes(normalizedSearch)
        );
      }
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filterActive, searchQuery, tenantViewById, tenants]);

  const filterCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let left = 0;

    tenants.forEach(t => {
      const view = tenantViewById.get(t.id);

      if (view?.isCurrentlyActive) {
        active++;
      } else if (view?.hasLeft) {
        left++;
      } else {
        inactive++;
      }
    });

    return { all: tenants.length, active, inactive, left };
  }, [tenantViewById, tenants]);

  const actionSummary = useMemo(() => {
    let missingContact = 0;
    let missingDeposit = 0;

    tenants.forEach((tenant) => {
      const view = tenantViewById.get(tenant.id);
      const contract = view?.activeContract || view?.latestContract;
      const contactPhone = tenant.phone || contract?.tenant_phone;
      const agreedDeposit = Number(contract?.deposit_amount || 0);

      if (!contactPhone) missingContact++;
      if (agreedDeposit > 0 && Number(view?.collectedDeposit || 0) < agreedDeposit) missingDeposit++;
    });

    return { missingContact, missingDeposit, total: missingContact + missingDeposit };
  }, [tenantViewById, tenants]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 bg-[#f5f7f6] p-4 lg:p-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-400">
            <span>Quản lý cư dân</span><i className="fa-solid fa-chevron-right text-[9px]"></i><span>Khách thuê</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#173b35]">Khách thuê</h1>
          <p className="mt-1 text-sm text-slate-500">Tổng {tenants.length} khách thuê <span className="mx-1 text-slate-300">•</span> Cập nhật hôm nay</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 xl:w-64">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input
              type="text"
              placeholder="Tìm tên, SĐT, CCCD..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-primary hover:text-primary" title="Bộ lọc">
            <i className="fa-solid fa-filter"></i>
          </button>
          <button data-tour="add-tenant-btn" onClick={openAddModal} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(16,185,129,0.22)] transition hover:bg-primary-dark">
            <i className="fa-solid fa-plus"></i> Thêm khách thuê
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', 'active', 'inactive', 'left'] as const).map(f => {
            const label = f === 'all' ? 'Tất cả' : f === 'active' ? 'Đang ở' : f === 'inactive' ? 'Chưa ở' : 'Đã rời đi';
            return (
              <button
                key={f}
                onClick={() => setFilterActive(f)}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition-all ${filterActive === f ? 'bg-[#064e3b] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {label} <span className={`ml-1 text-xs ${filterActive === f ? 'text-emerald-100' : 'text-slate-400'}`}>{filterCounts[f]}</span>
              </button>
            );
          })}
          <div className="mx-1 hidden h-6 w-px bg-slate-200 xl:block"></div>
          <span className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600"><i className="fa-solid fa-burst mr-1.5 text-[11px]"></i>Cần xử lý {actionSummary.total}</span>
          <div className="ml-auto hidden items-center gap-2 text-xs text-slate-400 lg:flex">
            <span className="rounded-lg bg-slate-50 px-3 py-2">Tất cả phòng <i className="fa-solid fa-chevron-down ml-2 text-[9px]"></i></span>
            <span className="rounded-lg bg-slate-50 px-3 py-2">Trạng thái đặt cọc <i className="fa-solid fa-chevron-down ml-2 text-[9px]"></i></span>
          </div>
        </div>
      </section>

      {actionSummary.total > 0 && (
        <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-[#fff8ec] px-4 py-3 text-sm">
          <div className="font-bold text-[#8a5418]"><i className="fa-solid fa-bell mr-2 text-red-500"></i>{actionSummary.total} việc cần xử lý hôm nay</div>
          {actionSummary.missingDeposit > 0 && <span className="rounded-md border border-red-100 bg-white px-2.5 py-1 text-xs font-semibold text-red-500">{actionSummary.missingDeposit} chưa đóng đặt cọc</span>}
          {actionSummary.missingContact > 0 && <span className="rounded-md border border-red-100 bg-white px-2.5 py-1 text-xs font-semibold text-red-500">{actionSummary.missingContact} thiếu thông tin liên hệ</span>}
          <span className="ml-auto cursor-pointer font-bold text-primary hover:underline">Xem danh sách <i className="fa-solid fa-arrow-right ml-1"></i></span>
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
          <table className="w-full min-w-[1080px] text-left border-collapse">
            <thead className="sticky top-0 z-10 border-b border-slate-100 bg-[#f7faf8] text-[10px] font-extrabold uppercase tracking-[0.11em] text-slate-400">
              <tr>
                <th className="w-[25%] px-5 py-3.5">Khách thuê & phòng</th>
                <th className="w-[17%] px-4 py-3.5">Liên hệ</th>
                <th className="w-[15%] px-4 py-3.5">Hợp đồng</th>
                <th className="w-[18%] px-4 py-3.5">Đặt cọc</th>
                <th className="w-[14%] px-4 py-3.5">Hoạt động gần nhất</th>
                <th className="px-4 py-3.5">Tham gia</th>
                <th className="px-4 py-3.5 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <LogoLoading className="min-h-[45vh]" />
                  </td>
                </tr>
              )}
              {!isLoading && filteredTenants.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                    <i className="fa-solid fa-user-slash text-3xl opacity-50 mb-3"></i>
                    <p className="text-base font-medium">Không tìm thấy khách hàng nào</p>
                  </td>
                </tr>
              )}
              {filteredTenants.map((tenant) => {
                const nameParts = tenant.full_name?.trim().split(' ') || ['?'];
                const initials = nameParts.length > 1
                  ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                  : nameParts[0][0].toUpperCase();

                const avatarColors = [
                  'bg-indigo-100 text-indigo-600', 'bg-pink-100 text-pink-600',
                  'bg-emerald-100 text-emerald-600', 'bg-blue-100 text-blue-600',
                  'bg-amber-100 text-amber-600', 'bg-fuchsia-100 text-fuchsia-600'
                ];
                const colorIdx = tenant.full_name?.length ? tenant.full_name.length % avatarColors.length : 0;

                const tenantView = tenantViewById.get(tenant.id)!;
                const latestContract = tenantView.latestContract;
                const room = tenantView.room;
                const isActuallyActive = tenantView.isCurrentlyActive;
                const hasLeft = tenantView.hasLeft;
                const roomLabel = room?.name || tenant.last_room_name || '—';
                const contactPhone = tenant.phone || latestContract?.tenant_phone || '';
                const depositStatus = tenantView.depositStatus;
                const collectedDeposit = tenantView.collectedDeposit;
                const joinDateLabel = formatDate(latestContract?.move_in_date || tenant.created_at);
                const agreedDeposit = Number(latestContract?.deposit_amount || 0);
                const depositProgress = agreedDeposit > 0 ? Math.min(100, Math.round((collectedDeposit / agreedDeposit) * 100)) : 0;
                const needsDeposit = agreedDeposit > 0 && collectedDeposit < agreedDeposit;
                const needsAttention = needsDeposit || !contactPhone;

                return (
                  <tr key={tenant.id} className={`group relative border-l-[4px] transition hover:bg-slate-50/80 ${needsDeposit ? 'border-l-red-500 bg-red-50/[0.26]' : !contactPhone ? 'border-l-amber-400' : 'border-l-transparent'}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {needsDeposit && <i className="fa-solid fa-circle-exclamation -ml-3.5 text-base text-red-500" title="Cần xử lý"></i>}
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${avatarColors[colorIdx]} `}>
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 transition group-hover:text-primary">{tenant.full_name}</div>
                          <div className="mt-1 flex items-center gap-2">
                            {roomLabel !== '—' && <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${isActuallyActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{roomLabel}</span>}
                            <span className={`text-[11px] font-semibold ${isActuallyActive ? 'text-emerald-600' : hasLeft ? 'text-amber-600' : 'text-slate-400'}`}><i className="fa-solid fa-circle mr-1 text-[7px]"></i>{isActuallyActive ? 'Đang ở' : hasLeft ? 'Đã rời đi' : 'Chưa ở'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4 xl:px-6">
                      <div className="flex flex-col gap-1.5 items-start">
                        {contactPhone ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-medium text-slate-700 font-mono">
                              {contactPhone}
                            </span>
                            <a
                              href={`tel:${contactPhone.replace(/[^0-9+]/g, '')}`}
                              title="Gọi điện"
                              onClick={(e) => e.stopPropagation()}
                              className="text-emerald-600 transition hover:text-emerald-700"
                            >
                              <i className="fa-solid fa-phone text-[12px]"></i>
                            </a>
                            <a
                              href={`https://zalo.me/${contactPhone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Nhắn Zalo"
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-[22px] w-[22px] items-center justify-center rounded text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <i className="fa-brands fa-whatsapp text-[15px]"></i>
                            </a>
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1.5">
                            <span className="font-mono text-[15px] text-slate-400">—</span>
                            <span className="inline-flex items-center rounded-md border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold text-red-500">Thiếu SĐT</span>
                          </div>
                        )}
                        {tenant.email && (
                          <div className="text-[14px] text-slate-500 flex items-center gap-1.5">
                            <i className="fa-regular fa-envelope text-[10px] text-slate-400"></i>
                            <span className="truncate max-w-[120px]">{tenant.email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-700">{latestContract ? (isActuallyActive ? 'Hợp đồng đang hiệu lực' : hasLeft ? 'Hợp đồng đã kết thúc' : 'Hợp đồng chờ kích hoạt') : 'Chưa có hợp đồng'}</div>
                        <div className="text-xs text-slate-400">{latestContract ? `${formatDate(latestContract.move_in_date)} – ${formatDate(latestContract.end_date)}` : 'Cần tạo hợp đồng'}</div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      {latestContract && latestContract.deposit_amount > 0 ? (() => {
                        const agreedDeposit = Number(latestContract.deposit_amount || 0);
                        const missingDeposit = Math.max(0, agreedDeposit - collectedDeposit);
                        const isDepositComplete = agreedDeposit > 0 && missingDeposit <= 0;
                        const displayAmount = isDepositComplete ? agreedDeposit : collectedDeposit;
                        const depositIcon = 'fa-shield-halved';

                        return (
                          <div className="relative inline-block min-w-[130px] cursor-help select-none group/deposit">
                            <div className="text-left">
                              <div className="flex items-center justify-between gap-3 whitespace-nowrap font-bold text-slate-800 tabular-nums"><span>{displayAmount.toLocaleString('vi-VN')} đ</span><span className="text-[10px] text-slate-400">/{agreedDeposit.toLocaleString('vi-VN')} đ</span></div>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${needsDeposit ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${depositProgress}%` }}></div></div>
                              <span className={`mt-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide leading-tight ${depositToneClass[depositStatus.tone]}`}>
                                <i className={`fa-solid ${depositIcon} text-[10px]`}></i>
                                {depositStatus.label}
                              </span>
                            </div>

                            <div className="invisible absolute left-0 top-full z-50 mt-2 w-48 rounded-lg bg-slate-900/95 p-3 text-xs text-white opacity-0 shadow-xl transition-all duration-200 group-hover/deposit:visible group-hover/deposit:opacity-100 xl:left-1/2 xl:-translate-x-1/2">
                              <div className="mb-1.5 border-b border-white/10 pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                Chi tiết tiền cọc
                              </div>
                              <div className="space-y-1.5 font-medium">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Đã thu:</span>
                                  <span className="font-bold tabular-nums text-emerald-400">{collectedDeposit.toLocaleString('vi-VN')} đ</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Cần cọc:</span>
                                  <span className="font-bold tabular-nums">{agreedDeposit.toLocaleString('vi-VN')} đ</span>
                                </div>
                                {!isDepositComplete && (
                                  <div className="flex justify-between gap-4 border-t border-white/5 pt-1.5 font-bold text-amber-400">
                                    <span>Còn thiếu:</span>
                                    <span className="tabular-nums">{missingDeposit.toLocaleString('vi-VN')} đ</span>
                                  </div>
                                )}
                              </div>
                              <div className="absolute bottom-full left-6 border-4 border-transparent border-b-slate-900/95 xl:left-1/2 xl:-translate-x-1/2"></div>
                            </div>
                          </div>
                        );
                      })() : (
                        <span className="text-[13px] text-slate-400 italic">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      {needsAttention ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><i className="fa-solid fa-clock text-amber-400"></i>{needsDeposit ? 'Chờ hoàn tất cọc' : 'Cần bổ sung liên hệ'}</div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><i className="fa-solid fa-circle-check text-emerald-500"></i>Hồ sơ đã cập nhật</div>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 text-slate-600 text-sm">
                        <i className="fa-solid fa-calendar-day text-slate-300"></i>
                        <span className="font-medium">{joinDateLabel}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-center" style={{ overflow: 'visible' }}>
                      <div className="relative inline-block text-left">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            const menuWidth = 208;
                            const menuHeight = 164;
                            const margin = 8;
                            const openUp = window.innerHeight - rect.bottom < menuHeight + 16;
                            const preferredTop = openUp ? rect.top - menuHeight - 6 : rect.bottom + 6;
                            const preferredLeft = rect.right - menuWidth;
                            setMenuPos({
                              top: Math.min(Math.max(preferredTop, margin), window.innerHeight - menuHeight - margin),
                              left: Math.min(Math.max(preferredLeft, margin), window.innerWidth - menuWidth - margin),
                            });
                            setMenuOpenId(menuOpenId === tenant.id ? null : tenant.id);
                          }}
                          className={`w-8 h-8 rounded-lg transition flex items-center justify-center border shadow-sm ${menuOpenId === tenant.id ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 hover:bg-slate-100 border-slate-200'}`}
                        >
                          <i className="fa-solid fa-ellipsis-vertical"></i>
                        </button>

                        {false && (
                          <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 z-[200] animate-[fadeIn_0.1s_ease-out] text-left">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedTenant(tenant); setMenuOpenId(null); }}
                              className="w-full text-left px-3 py-2 text-[15px] font-medium text-slate-700 hover:bg-slate-50 hover:text-primary rounded-lg transition flex items-center gap-2"
                            >
                              <i className="fa-solid fa-eye font-sm w-4 text-slate-400"></i> Xem hồ sơ
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingTenant(tenant); setSelectedTenant(null); setMenuOpenId(null); }} className="w-full text-left px-3 py-2 text-[15px] font-medium text-slate-700 hover:bg-slate-50 hover:text-primary rounded-lg transition flex items-center gap-2"><i className="fa-solid fa-pen-to-square w-4 text-slate-400" />Sửa hồ sơ</button>

                            {tenant.is_active ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStatusMut.mutate({ id: tenant.id, is_active: false });
                                  setMenuOpenId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-[15px] font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition flex items-center gap-2"
                              >
                                <i className="fa-solid fa-power-off font-sm w-4 text-amber-500"></i> Đánh dấu rời đi
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStatusMut.mutate({ id: tenant.id, is_active: true });
                                  setMenuOpenId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-[15px] font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition flex items-center gap-2"
                              >
                                <i className="fa-solid fa-check font-sm w-4 text-emerald-500"></i> Đánh dấu đang ở
                              </button>
                            )}

                            <div className="w-full h-px bg-slate-100 my-1"></div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(tenant);
                                setMenuOpenId(null);
                              }}
                              className="w-full text-left px-3 py-2 text-[15px] font-medium text-red-500 hover:bg-red-50 rounded-lg transition flex items-center gap-2"
                            >
                              <i className="fa-solid fa-trash-can font-sm w-4 text-red-400"></i> Xóa khách thuê
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[13px] text-slate-500 font-medium">
          <div>Hiển thị {filteredTenants.length} / {tenants.length} khách thuê</div>
          <div className="flex items-center gap-1">
            <button disabled className="px-2 py-1 rounded border border-slate-200 bg-white opacity-50">Trang trước</button>
            <button className="px-3 py-1 rounded bg-primary text-white font-bold">1</button>
            <button disabled className="px-2 py-1 rounded border border-slate-200 bg-white opacity-50">Trang sau</button>
          </div>
        </div>
      </div>

      {menuOpenId && (() => {
        const tenant = filteredTenants.find(t => t.id === menuOpenId);
        if (!tenant) return null;
        const hasActiveContract = contracts.some(c => c.tenant_id === tenant.id && c.status === 'active');
        const hasLeft =
          !hasActiveContract &&
          (!!tenant.left_at ||
            !!tenant.last_room_name ||
            contracts.some(c => c.tenant_id === tenant.id && c.status !== 'active'));
        return (
          <div
            ref={menuRef}
            style={{
              top: menuPos.top,
              left: menuPos.left,
            }}
            className="fixed z-[220] w-52 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 animate-[fadeIn_0.1s_ease-out] text-left"
          >
            <button
              onClick={() => { setSelectedTenant(tenant); setMenuOpenId(null); }}
              className="w-full text-left px-3 py-2 text-[15px] font-medium text-slate-700 hover:bg-slate-50 hover:text-primary rounded-lg transition flex items-center gap-2"
            >
              <i className="fa-solid fa-eye font-sm w-4 text-slate-400"></i> Xem hồ sơ
            </button>
            <button type="button" onClick={() => { setEditingTenant(tenant); setSelectedTenant(null); setMenuOpenId(null); }} className="w-full text-left px-3 py-2 text-[15px] font-medium text-slate-700 hover:bg-slate-50 hover:text-primary rounded-lg transition flex items-center gap-2"><i className="fa-solid fa-pen-to-square w-4 text-slate-400" aria-hidden="true" />Sửa hồ sơ</button>

            {/* Nút đánh dấu đã chuyển đi thủ công - chỉ hiện khi đang có hợp đồng active */}
            {!hasLeft && (
              <button
                onClick={() => {
                  setConfirmMarkLeft(tenant);
                  setMenuOpenId(null);
                }}
                className="w-full text-left px-3 py-2 text-[15px] font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition flex items-center gap-2"
              >
                <i className="fa-solid fa-person-walking-arrow-right font-sm w-4 text-amber-500"></i>
                Đánh dấu đã chuyển đi
              </button>
            )}

            {hasLeft && (
              <div className="w-full px-3 py-2 text-[15px] font-medium rounded-lg flex items-center gap-2 text-slate-400 bg-slate-50">
                <i className="fa-solid fa-user-clock text-slate-300 font-sm w-4"></i>
                Khách này đã rời đi
              </div>
            )}

            <div className="w-full h-px bg-slate-100 my-1"></div>
            <button
              onClick={() => {
                setConfirmDelete(tenant);
                setMenuOpenId(null);
              }}
              className="w-full text-left px-3 py-2 text-[15px] font-medium text-red-500 hover:bg-red-50 rounded-lg transition flex items-center gap-2"
            >
              <i className="fa-solid fa-trash-can font-sm w-4 text-red-400"></i> Xóa khách thuê
            </button>
          </div>
        );
      })()}

      {cccdHover && (
        <div
          className="fixed z-[250] bg-white shadow-2xl border border-slate-200 rounded-xl p-2 w-48 pointer-events-none animate-[fadeIn_0.1s_ease-out]"
          style={{ top: cccdHover.top, left: cccdHover.left, transform: 'translate(-50%, 0)', transformOrigin: cccdHover.openUp ? 'bottom center' : 'top center' }}
        >
          <div className="text-[9px] text-slate-400 mb-1 uppercase font-bold tracking-tight text-center">Ảnh CCCD {cccdHover.name}</div>
          {cccdHover.url ? (
            <img src={cccdHover.url} alt="CCCD" className="w-full h-32 object-contain bg-slate-50 rounded border border-slate-100" />
          ) : (
            <div className="w-full h-32 bg-slate-50 rounded flex flex-col items-center justify-center text-slate-400 italic text-[10px] border border-dashed border-slate-300">
              <i className="fa-regular fa-image text-xl mb-1 opacity-50"></i>
              Chưa đăng tải ảnh
            </div>
          )}
        </div>
      )}

      {isAddModalOpen && (
        <TenantFormModal
          key={addModalKey}
          onClose={() => { setIsAddModalOpen(false); setCreateError(null); }}
          onSubmit={(data) => {
            setCreateError(null);
            createMutation.mutate(data);
          }}
          isPending={createMutation.isPending}
          error={createError}
        />
      )}

      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
        />
      )}
      {editingTenant && <TenantEditModal key={editingTenant.id} tenant={editingTenant} onClose={() => setEditingTenant(null)} />}

      {confirmDelete && (
        <ConfirmModal
          title="Xóa khách thuê?"
          variant="danger"
          confirmLabel="Xóa khách thuê"
          isLoading={deleteMut.isPending}
          message={
            <div>
              <p>Khách thuê <strong className="text-slate-700">{confirmDelete.full_name}</strong> sẽ bị xóa vĩnh viễn.</p>
              <p className="mt-2 text-amber-600 font-medium">⚠ Thao tác này sẽ ảnh hưởng tới báo cáo hóa đơn và không thể hoàn tác.</p>
            </div>
          }
          onConfirm={() => { deleteMut.mutate(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmMarkLeft && (
        <ConfirmModal
          title="Đánh dấu đã chuyển đi?"
          variant="warning"
          confirmLabel="Xác nhận chuyển đi"
          isLoading={markLeftMut.isPending}
          message={
            <ul className="mt-1 space-y-1">
              <li>• Đóng hợp đồng đang hiệu lực</li>
              <li>• Cập nhật phòng về trạng thái trống</li>
              <li>• Ghi nhận ngày rời đi hôm nay</li>
              <li className="mt-2 text-amber-600 font-medium">Lưu ý: Vui lòng tất toán hóa đơn trước khi thực hiện.</li>
            </ul>
          }
          onConfirm={() => { markLeftMut.mutate(confirmMarkLeft.id); setConfirmMarkLeft(null); }}
          onCancel={() => setConfirmMarkLeft(null)}
        />
      )}
    </div>
  );
};

function trapTenantDialogFocus(event: React.KeyboardEvent, root: HTMLElement | null) {
  if (event.key !== 'Tab') return;
  const controls = Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), [href], input:not([type="hidden"]), textarea, [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

const TenantEditModal = ({ tenant: initialTenant, onClose }: { tenant: Tenant; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [tenant, setTenant] = useState<Tenant>(initialTenant);
  const emailCheck = useTenantEmailCheck(tenant.email);
  const editRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    editRef.current?.querySelector<HTMLInputElement>('input[name="full_name"]')?.focus();
    return () => previousFocus?.focus();
  }, []);
  const handleEditKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    trapTenantDialogFocus(event, editRef.current);
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Vui lòng chọn ảnh dưới 5MB để đảm bảo hiệu suất lưu trữ offline.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setTenant(prev => ({ ...prev, identity_image_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const updateMut = useMutation({
    mutationFn: (updates: Partial<Tenant>) => updateTenant(tenant.id, updates),
    onSuccess: (updatedTenant) => {
      queryClient.setQueryData<Tenant[]>(['tenants'], (prev = []) =>
        prev.map((item) => item.id === updatedTenant.id ? updatedTenant : item)
      );
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setTenant(updatedTenant);
      onClose();
    }
  });

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (emailCheck.blocked || updateMut.isPending) return;
    const fd = new FormData(e.currentTarget);
    updateMut.mutate({
      full_name: (fd.get('full_name') as string).trim(),
      phone: (fd.get('phone') as string).trim(),
      email: (fd.get('email') as string).trim(),
      identity_card: (fd.get('identity_card') as string).trim(),
      identity_image_url: (fd.get('identity_image_url') as string).trim(),
      notes: (fd.get('notes') as string).trim(),
    });
  };

    return (
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-[90]" onClick={onClose}>
        <form ref={editRef} role="dialog" aria-modal="true" aria-labelledby="tenant-edit-title" onKeyDown={handleEditKeyDown} onSubmit={handleEditSubmit} className="bg-white flex flex-col rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] shadow-2xl border border-slate-200 animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 z-10">
            <h3 id="tenant-edit-title" className="font-bold text-xl text-slate-800 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                <i className="fa-solid fa-pen-to-square text-xs"></i>
              </div>
              Sửa hồ sơ
            </h3>
            <button type="button" aria-label="Đóng sửa hồ sơ" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition text-slate-500">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div className="p-6 space-y-5 overflow-y-auto">
            <div>
              <label className="block text-[15px] font-bold text-slate-700 mb-1.5">Họ và tên <span className="text-red-500">*</span></label>
              <input name="full_name" defaultValue={tenant.full_name} required type="text" placeholder="Nhập tên khách thuê" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-slate-50 focus:bg-white" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[15px] font-bold text-slate-700 mb-1.5">Số điện thoại</label>
                <input name="phone" defaultValue={tenant.phone} type="tel" placeholder="09xx..." className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-slate-50 focus:bg-white" />
              </div>
              <div>
                <label className="block text-[15px] font-bold text-slate-700 mb-1.5">Địa chỉ Email</label>
                <input name="email" value={tenant.email || ""} onChange={event => setTenant(prev => ({ ...prev, email: event.target.value }))} type="email" aria-invalid={Boolean(emailCheck.error)} aria-describedby="tenant-edit-email-help" placeholder="example@email.com" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-slate-50 focus:bg-white" />
                <p id="tenant-edit-email-help" role="status" className={`mt-2 text-xs leading-5 ${emailCheck.error ? "text-red-600" : "text-slate-500"}`}>{emailCheck.error || (emailCheck.checking ? "Đang kiểm tra email…" : "Email người thuê phải khác tài khoản hệ thống.")}</p>
              </div>
            </div>



            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <h4 className="text-[15px] font-bold text-slate-800 mb-3 flex items-center gap-2"><i className="fa-regular fa-id-card text-slate-400"></i> Định danh cá nhân (CCCD/CMND)</h4>
              <div className="space-y-4">
                <div>
                  <input name="identity_card" defaultValue={tenant.identity_card} type="text" placeholder="Nhập dãy 12 số CCCD..." className="w-full border border-slate-300 rounded-lg px-4 py-2 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white" />

                </div>

                <div
                  className="w-full flex flex-col items-center justify-center p-4 border border-dashed border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition cursor-pointer group relative overflow-hidden min-h-[140px]"
                >
                  <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />

                  {tenant.identity_image_url ? (
                    <>
                      <img src={tenant.identity_image_url} alt="CCCD Preview" className="absolute inset-0 w-full h-full object-cover rounded-lg z-0 opacity-40 group-hover:opacity-20 transition" />
                      <div className="relative z-10 flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2 border border-emerald-200">
                          <i className="fa-solid fa-check"></i>
                        </div>
                        <div className="text-[12px] font-bold text-emerald-700">Đã cập nhật ảnh</div>
                        <div className="text-[10px] text-slate-500 mt-1">Nhấp/kéo thả để thay đổi ảnh khác</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2 group-hover:bg-primary/10 group-hover:text-primary transition">
                        <i className="fa-solid fa-cloud-arrow-up"></i>
                      </div>
                      <div className="text-[12px] font-bold text-slate-600">Nhấp để tải ảnh lên</div>
                      <div className="text-[10px] text-slate-400 mt-1">Hỗ trợ JPG, PNG, tối đa 5MB</div>
                    </>
                  )}
                </div>
                <input type="hidden" name="identity_image_url" value={tenant.identity_image_url || ''} />
              </div>
            </div>

            <div>
              <label className="block text-[15px] font-bold text-slate-700 mb-1.5">Ghi chú & Lưu ý</label>
              <textarea name="notes" defaultValue={tenant.notes} rows={2} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-slate-50 focus:bg-white resize-none"></textarea>
            </div>
          </div>

          {updateMut.isError && <p role="alert" className="px-6 pb-3 text-sm text-red-600">{updateMut.error instanceof Error ? updateMut.error.message : 'Không thể lưu hồ sơ. Vui lòng thử lại.'}</p>}
          <div className="shrink-0 px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-[15px] font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition shadow-sm">Hủy</button>
            <button type="submit" disabled={updateMut.isPending || emailCheck.blocked} className="disabled:opacity-40 px-5 py-2 bg-primary text-white rounded-xl text-[15px] font-bold shadow-sm hover:bg-primary-dark flex items-center gap-2">
              {updateMut.isPending ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>} Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    );
};

const TenantDetailModal = ({ tenant: initialTenant, onClose }: { tenant: Tenant; onClose: () => void }) => {
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts });
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices });
  const { data: depositReceipts = [] } = useQuery<MoveInReceipt[]>({
    queryKey: ['move_in_receipts', initialTenant.id],
    queryFn: () => getMoveInReceiptsByTenant(initialTenant.id),
  });

  const tenant = initialTenant;
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'deposits' | 'contracts'>('profile');
  const contentRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    detailRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [activeTab]);

  const tenantContracts = useMemo(() => {
    return contracts
      .filter(c => c.tenant_id === tenant.id)
      .sort((a, b) => getContractSortTime(b) - getContractSortTime(a));
  }, [contracts, tenant.id]);

  const displayedContracts = showAllHistory ? tenantContracts : tenantContracts.slice(0, 3);
  const hasActiveContract = tenantContracts.some(contract => contract.status === 'active');
  const latestContract = tenantContracts[0] || null;
  const latestRoom = latestContract ? rooms.find(room => room.id === latestContract.room_id) : null;
  const hasLeft = !hasActiveContract && (!!tenant.left_at || !!tenant.last_room_name || tenantContracts.some(contract => contract.status !== 'active'));
  const statusLabel = hasActiveContract ? 'Đang ở' : hasLeft ? 'Đã rời đi' : 'Chưa ở';
  const statusIcon = hasActiveContract ? 'fa-house-user' : hasLeft ? 'fa-person-walking' : 'fa-user-clock';
  const statusClass = hasLeft ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-[#175653] bg-[#edf6f4] border-[#dcebe8]';

  const handleDetailKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    trapTenantDialogFocus(event, detailRef.current);
  };


  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-[90]" onClick={onClose}>
      <div ref={detailRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tenant-detail-title" onKeyDown={handleDetailKeyDown} className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] shadow-2xl border border-slate-200 outline-none animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="relative px-6 py-6 flex items-center gap-4 bg-[#005440] shrink-0">
          <div className="flex min-w-0 flex-1 gap-4 items-center pr-7">
            <div className="w-[60px] h-[60px] shrink-0 rounded-xl bg-[#00ad79] text-white flex items-center justify-center text-3xl font-bold">
              {tenant.full_name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <h2 id="tenant-detail-title" className="text-2xl font-bold text-white tracking-tight break-words">{tenant.full_name}</h2>
              <span className={`mt-2 inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm font-bold ${statusClass}`}><i className={`fa-solid ${statusIcon}`} aria-hidden="true" />{statusLabel}</span>
            </div>
          </div>
          <button type="button" aria-label="Đóng hồ sơ khách thuê" onClick={onClose} className="absolute right-5 top-5 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition text-white text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div role="tablist" aria-label="Thông tin khách thuê" className="grid shrink-0 grid-cols-3 border-b border-slate-100 bg-white px-3">
          {([
            { id: 'profile', label: 'Hồ sơ', icon: 'fa-regular fa-user', count: null },
            { id: 'deposits', label: 'Tiền cọc', icon: 'fa-solid fa-coins', count: depositReceipts.length },
            { id: 'contracts', label: 'Hợp đồng', icon: 'fa-regular fa-file-lines', count: tenantContracts.length },
          ] as const).map((tab, index, tabs) => <button key={tab.id} id={`tenant-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`tenant-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); setActiveTab(tabs[next].id); document.getElementById(`tenant-tab-${tabs[next].id}`)?.focus();
          }} className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-1 py-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-600 ${activeTab === tab.id ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-[#526972] hover:bg-slate-50 hover:text-emerald-700'}`}><i className={tab.icon} aria-hidden="true" /><span>{tab.label}</span>{tab.count !== null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-[#526972]">{tab.count}</span>}</button>)}
        </div>
        <div ref={contentRef} className="h-[550px] min-h-0 p-6 bg-white overflow-y-auto">
          {/* Notes / Detail Box */}
          <div id="tenant-panel-profile" role="tabpanel" aria-labelledby="tenant-tab-profile" hidden={activeTab !== 'profile'} tabIndex={0} className="text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <h3 className="mb-3 flex items-center gap-3 border-b border-slate-100 pb-3 text-lg font-bold text-slate-900"><i className="fa-solid fa-user text-[#526972]" aria-hidden="true" />Thông tin cá nhân</h3>
            <dl className="divide-y divide-slate-100 border-b border-slate-100">
              {[
                ['Số điện thoại', tenant.phone || 'Chưa cập nhật'],
                ['CCCD / CMND', tenant.identity_card || 'Chưa cập nhật'],
                ['Email', tenant.email || 'Chưa cập nhật'],
                ['Ngày tạo', formatDate(tenant.created_at)],
              ].map(([label, value]) => <div key={label} className="grid grid-cols-[28%_1fr] items-start gap-3 py-3"><dt className="font-medium text-slate-500">{label}</dt><dd className="min-w-0 break-words font-semibold text-slate-900">{value}</dd></div>)}
            </dl>
            <h3 className="mb-3 mt-6 flex items-center gap-3 text-lg font-bold text-slate-900"><i className="fa-regular fa-image text-[#526972]" aria-hidden="true" />Ảnh giấy tờ</h3>
            <TenantIdentityPreview source={tenant.identity_image_url} />
            {tenant.notes && <div className="mt-4 border-t border-slate-100 pt-3"><h4 className="mb-1 font-semibold text-slate-700">Ghi chú</h4><p className="whitespace-pre-wrap break-words text-slate-600">{tenant.notes}</p></div>}
          </div>

          {/* Lịch sử tiền cọc */}
          <div id="tenant-panel-deposits" role="tabpanel" aria-labelledby="tenant-tab-deposits" hidden={activeTab !== 'deposits'} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <h3 className="mb-4 flex items-center gap-3 text-lg font-bold text-slate-900"><i className="fa-solid fa-coins text-[#526972]" aria-hidden="true" />Lịch sử tiền cọc</h3>
            {depositReceipts.length > 0 ? (
              <div className="flex flex-col gap-2">
                {depositReceipts.map(r => {
                  const room = rooms.find(rm => rm.id === r.room_id);
                  const isPaid = r.payment_status === 'paid';
                  return (
                    <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-3 hover:border-amber-200 transition">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[15px] text-slate-800">
                            <i className="fa-solid fa-door-open text-slate-400 mr-1.5"></i>
                            {room?.name || 'Phòng không rõ'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${isPaid
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : r.payment_status === 'partial'
                              ? 'bg-amber-50 text-amber-600 border-amber-200'
                              : 'bg-red-50 text-red-500 border-red-200'
                            }`}>
                            {isPaid ? 'Đã thu' : r.payment_status === 'partial' ? 'Còn nợ' : 'Chưa thu'}
                          </span>
                        </div>
                        <span className="text-slate-500 text-[13px] font-medium">
                          <i className="fa-regular fa-calendar mr-1"></i>
                          Ngày vào: {new Date(r.move_in_date).toLocaleDateString('vi-VN')}
                          {r.payment_date && (
                            <span className="ml-2 text-slate-400">· Đã thu: {new Date(r.payment_date).toLocaleDateString('vi-VN')}</span>
                          )}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-[15px] text-amber-600">
                          {r.deposit_amount.toLocaleString('vi-VN')}₫
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">Tiền cọc</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-[#dce9e8] rounded-lg py-4 px-3 text-center text-slate-500 flex flex-col items-center">
                <i className="fa-solid fa-coins text-2xl mb-2 text-slate-300" aria-hidden="true"></i>
                <p className="text-sm font-medium">Chưa có phiếu thu tiền cọc nào.</p>
              </div>
            )}
          </div>

          <div id="tenant-panel-contracts" role="tabpanel" aria-labelledby="tenant-tab-contracts" hidden={activeTab !== 'contracts'} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <h3 className="mb-4 flex items-center gap-3 text-lg font-bold text-slate-900"><i className="fa-regular fa-file-lines text-[#526972]" aria-hidden="true" />Lịch sử hợp đồng</h3>
            {latestContract && <p className="mb-4 text-sm text-slate-500">Phòng gần nhất: <span className="font-semibold text-slate-700">{latestRoom?.name || tenant.last_room_name || 'Phòng không rõ'}</span> · {formatDate(latestContract.move_in_date)} – {latestContract.status === 'active' ? 'Đang ở' : formatDate(tenant.left_at || latestContract.end_date)}</p>}

            {tenantContracts.length > 0 ? (
              <div className="flex flex-col gap-3">
                {displayedContracts.map(c => {
                  const room = rooms.find(r => r.id === c.room_id);
                  const endedAt = c.status === 'active' ? null : c.end_date;
                  const depositStatus = getDepositStatus(c, invoices);
                  return (
                    <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex justify-between items-start gap-4 group hover:border-emerald-300 transition">
                      <div className="flex flex-col gap-1.5">
                        <span className="font-bold text-[15px] text-slate-800"><i className="fa-solid fa-door-open text-slate-400 mr-1.5"></i> {room?.name || 'Phòng không rõ'}</span>
                        <span className="text-slate-500 text-[13px] font-medium tracking-wide">
                          <i className="fa-regular fa-calendar mr-1.5"></i>
                          {formatDate(c.move_in_date)} - {endedAt ? formatDate(endedAt) : c.expiration_date ? formatDate(c.expiration_date) : 'Không thời hạn'}
                        </span>
                        <span className="text-slate-500 text-[13px] font-medium">
                          <i className="fa-solid fa-money-bill-wave text-slate-300 mr-1.5"></i>
                          Giá thuê {c.base_rent.toLocaleString('vi-VN')}₫ · Cọc {c.deposit_amount.toLocaleString('vi-VN')}₫
                        </span>
                        {c.deposit_amount > 0 && (
                          <span className={`w-fit rounded-md border px-2 py-0.5 text-[11px] font-bold ${depositToneClass[depositStatus.tone]}`}>
                            {depositStatus.label}{depositStatus.detail ? ` · ${depositStatus.detail}` : ''}
                          </span>
                        )}
                        {c.end_note && (
                          <span className="text-slate-400 text-[12px] font-medium italic">{c.end_note}</span>
                        )}
                      </div>
                      <div>
                        {c.status === 'active' ? (
                          <span className="px-2.5 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-600 font-bold text-[10px] whitespace-nowrap uppercase tracking-wider shadow-sm">Đang có hiệu lực</span>
                        ) : (
                          <span className="px-2.5 py-1 rounded border border-slate-200 bg-slate-50 text-slate-500 font-bold text-[10px] whitespace-nowrap uppercase tracking-wider shadow-sm">Đã kết thúc</span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {tenantContracts.length > 3 && (
                  <button
                    onClick={() => setShowAllHistory(!showAllHistory)}
                    className="w-full mt-1.5 py-2.5 text-[12px] font-bold text-slate-500 bg-slate-100/80 hover:bg-slate-200 transition rounded-xl flex items-center justify-center gap-2 border border-slate-200"
                  >
                    {showAllHistory ? 'Thu gọn Lịch sử' : `Xem thêm ${tenantContracts.length - 3} lịch sử khác`}
                    <i className={`fa-solid fa-chevron-${showAllHistory ? 'up' : 'down'} text-[10px] mt-0.5`}></i>
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-400 shadow-sm flex flex-col items-center">
                <i className="fa-solid fa-folder-open text-3xl mb-2 opacity-30"></i>
                <p className="text-[15px] font-medium leading-relaxed">Chưa có dữ liệu hợp đồng của khách thuê này.</p>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-6 py-4 bg-white border-t border-slate-100 flex flex-wrap gap-2 justify-between items-center rounded-b-2xl">
          <div className={`px-3 py-2 rounded-lg text-sm font-semibold border flex items-center gap-2 ${statusClass}`}>
            <i className={`fa-solid ${statusIcon}`} aria-hidden="true"></i>
            {statusLabel}
          </div>

          <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-lg border border-[#dce9e8] text-sm font-bold text-[#526972] bg-white hover:bg-slate-50 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
