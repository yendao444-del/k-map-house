import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenants, createTenant, updateTenant, deleteTenant, markTenantLeft, getRooms, getContracts, getMoveInReceiptsByTenant, type Tenant, type MoveInReceipt } from '../lib/db';
import { ConfirmModal } from './ConfirmModal';
import { LogoLoading } from './LogoLoading';

export const TenantsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['tenants'], queryFn: getTenants });
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive' | 'left'>('all');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // addModalKey: mỗi lần mở modal mới thì tăng key để force remount hoàn toàn, tránh bug không gõ được phím
  const [addModalKey, setAddModalKey] = useState(0);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
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
      queryClient.invalidateQueries({ queryKey: ['tenants'], refetchType: 'all' });
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTenant(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Tenant[]>(['tenants'], (prev = []) => prev.filter((tenant) => tenant.id !== id));
      queryClient.invalidateQueries({ queryKey: ['tenants'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['rooms'], refetchType: 'all' });
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
      queryClient.invalidateQueries({ queryKey: ['tenants'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['rooms'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['contracts'], refetchType: 'all' });
    }
  });

  const [createError, setCreateError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) => createTenant(data),
    onSuccess: (createdTenant) => {
      queryClient.setQueryData<Tenant[]>(['tenants'], (prev = []) => [createdTenant, ...prev]);
      queryClient.invalidateQueries({ queryKey: ['tenants'], refetchType: 'all' });
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

  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      const hasActiveContract = contracts.some(c => c.tenant_id === t.id && c.status === 'active');
      const hasPastContract = contracts.some(c => c.tenant_id === t.id && c.status !== 'active');

      const isCurrentlyActive = hasActiveContract;
      const hasLeft = !hasActiveContract && (hasPastContract || t.is_active === false || !!t.left_at || !!t.last_room_name);
      const isNeverStayed = !hasActiveContract && !hasLeft;

      if (filterActive === 'active' && !isCurrentlyActive) return false;
      if (filterActive === 'inactive' && !isNeverStayed) return false;
      if (filterActive === 'left' && !hasLeft) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (t.full_name?.toLowerCase().includes(q) || t.phone?.includes(q) || t.identity_card?.includes(q));
      }
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [contracts, tenants, filterActive, searchQuery]);

  const filterCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let left = 0;

    tenants.forEach(t => {
      const hasActiveContract = contracts.some(c => c.tenant_id === t.id && c.status === 'active');
      const hasPastContract = contracts.some(c => c.tenant_id === t.id && c.status !== 'active');

      if (hasActiveContract) {
        active++;
      } else if (hasPastContract || t.is_active === false || !!t.left_at || !!t.last_room_name) {
        left++;
      } else {
        inactive++;
      }
    });

    return { all: tenants.length, active, inactive, left };
  }, [tenants, contracts]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-6 p-4">
      {/* Header Widget */}
      <div className="flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200 pointer-events-auto">
          {(['all', 'active', 'inactive', 'left'] as const).map(f => {
            const label = f === 'all' ? 'Tất cả' : f === 'active' ? 'Đang ở' : f === 'inactive' ? 'Chưa ở' : 'Đã rời đi';
            return (
              <button
                key={f}
                onClick={() => setFilterActive(f)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${filterActive === f ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 font-medium hover:bg-slate-50'}`}
              >
                {label} ({filterCounts[f]})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="relative w-64">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input
              type="text"
              placeholder="Tìm tên, SĐT, CCCD..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 shadow-sm rounded-lg pl-9 pr-4 py-2.5 focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
            />
          </div>
          <button data-tour="add-tenant-btn" onClick={openAddModal} className="bg-primary text-white px-4 py-2.5 rounded-lg font-bold hover:bg-primary-dark transition shadow-sm flex items-center gap-2 text-sm">
            <i className="fa-solid fa-plus"></i> Thêm khách mới
          </button>
        </div>
      </div>
      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 text-[13px] text-slate-400 uppercase tracking-widest font-bold border-b border-slate-100 z-10">
              <tr>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Liên hệ</th>
                <th className="px-6 py-4 text-center">Phòng ở</th>
                <th className="px-6 py-4 text-center">Trạng thái</th>
                <th className="px-6 py-4">Tiền cọc</th>
                <th className="px-6 py-4">Định danh (CCCD)</th>
                <th className="px-6 py-4">Ngày tham gia</th>
                <th className="px-6 py-4">Ngày rời đi</th>
                <th className="px-6 py-4 text-center">Xem thêm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-base">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    <LogoLoading className="min-h-[45vh]" />
                  </td>
                </tr>
              )}
              {!isLoading && filteredTenants.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-slate-400">
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

                const activeContract = contracts.find(c => c.tenant_id === tenant.id && c.status === 'active');
                const room = activeContract ? rooms.find(r => r.id === activeContract.room_id) : null;
                const isActuallyActive = !!activeContract;
                const hasLeft = !isActuallyActive && (!!tenant.left_at || !!tenant.last_room_name || contracts.some(c => c.tenant_id === tenant.id && c.status !== 'active'));
                const roomLabel = room?.name || tenant.last_room_name || '—';
                const leftDateLabel = tenant.left_at ? new Date(tenant.left_at).toLocaleDateString('vi-VN') : '—';

                return (
                  <tr key={tenant.id} className="hover:bg-slate-50/80 transition group relative">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${avatarColors[colorIdx]} flex items-center justify-center font-bold text-sm shrink-0`}>
                          {initials}
                        </div>
                        <div className="font-bold text-slate-900 text-base group-hover:text-primary transition">
                          {tenant.full_name}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        {tenant.phone ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-medium text-slate-700 font-mono">
                              {tenant.phone}
                            </span>
                            <a
                              href={`https://zalo.me/${tenant.phone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Nhắn Zalo"
                              onClick={(e) => e.stopPropagation()}
                              className="w-[22px] h-[22px] flex items-center justify-center rounded bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white transition shadow-sm"
                            >
                              <i className="fa-brands fa-facebook-messenger text-[11px]"></i>
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[13px]">Chưa có SĐT</span>
                        )}
                        {tenant.email && (
                          <div className="text-[14px] text-slate-500 flex items-center gap-1.5">
                            <i className="fa-regular fa-envelope text-[10px] text-slate-400"></i>
                            <span className="truncate max-w-[120px]">{tenant.email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      {roomLabel !== '—' ? (
                        <span className={`px-3 py-1 rounded-full font-bold text-[13px] border shadow-sm whitespace-nowrap ${isActuallyActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{roomLabel}</span>
                      ) : (
                        <span className="text-[13px] text-slate-400 italic bg-transparent">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-center">
                      {isActuallyActive ? (
                        <div className="flex items-center gap-2 justify-center">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          <span className="text-emerald-700 font-bold text-[15px] whitespace-nowrap tracking-tight">Đang ở</span>
                        </div>
                      ) : hasLeft ? (
                        <div className="flex items-center gap-2 justify-center">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          <span className="text-amber-700 font-bold text-[15px] whitespace-nowrap tracking-tight">Đã rời đi</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 justify-center opacity-70">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400"></span>
                          <span className="text-slate-500 font-bold text-[15px] whitespace-nowrap tracking-tight">Chưa ở</span>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {activeContract && activeContract.deposit_amount > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-base text-amber-600">
                            {activeContract.deposit_amount.toLocaleString('vi-VN')}₫
                          </span>
                          <span className="text-xs text-slate-400 font-medium">Hợp đồng hiện tại</span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-slate-400 italic">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {tenant.identity_card ? (
                        <div
                          className="inline-block cursor-help"
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const popupHeight = 166;
                            const margin = 8;
                            const openUp = window.innerHeight - rect.bottom < popupHeight + margin;

                            const top = openUp
                              ? rect.top - popupHeight - margin
                              : rect.bottom + margin;

                            setCccdHover({
                              id: tenant.id,
                              url: tenant.identity_image_url || '',
                              name: tenant.full_name,
                              top,
                              left: rect.left + rect.width / 2,
                              openUp
                            });
                          }}
                          onMouseLeave={() => setCccdHover(null)}
                        >
                          <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 border border-slate-200 rounded-md text-[13px] font-mono hover:bg-slate-200 transition">
                            <i className="fa-solid fa-address-card text-slate-400"></i>
                            {tenant.identity_card}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[13px] text-slate-400 italic bg-transparent">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600 text-sm">
                        <i className="fa-solid fa-calendar-day text-slate-300"></i>
                        <span className="font-medium">{new Date(tenant.created_at).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {tenant.left_at ? (
                        <div className="flex items-center gap-2 text-slate-600 text-sm">
                          <i className="fa-solid fa-person-walking text-slate-300"></i>
                          <span className="font-medium">{leftDateLabel}</span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-slate-400 italic">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-center" style={{ overflow: 'visible' }}>
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
                              <i className="fa-solid fa-eye font-sm w-4 text-slate-400"></i> Xem / Sửa hồ sơ
                            </button>

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
              <i className="fa-solid fa-eye font-sm w-4 text-slate-400"></i> Xem / Sửa hồ sơ
            </button>

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

const TenantFormModal = ({ onClose, onSubmit, isPending, error }: { onClose: () => void, onSubmit: (d: any) => void, isPending: boolean, error?: string | null }) => {
  const [imageBase64, setImageBase64] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fullNameRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Vui lòng chọn ảnh dưới 5MB để đảm bảo hiệu suất lưu trữ offline.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fullName = (fd.get('full_name') as string).trim();
    if (!fullName) {
      setLocalError('Vui lòng nhập họ và tên khách thuê.');
      return;
    }
    setLocalError(null);
    onSubmit({
      full_name: fullName,
      phone: (fd.get('phone') as string).trim(),
      email: (fd.get('email') as string).trim(),
      identity_card: (fd.get('identity_card') as string).trim(),
      identity_image_url: imageBase64,
      notes: (fd.get('notes') as string).trim(),
      is_active: false
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-[90]" onClick={onClose}>
      <form noValidate onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-200 animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <i className="fa-solid fa-user-plus"></i>
            </div>
            Thêm khách thuê mới
          </h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition text-gray-500">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Tên */}
          <div>
            <label className="block text-[15px] font-bold text-slate-700 mb-1.5">Họ và tên <span className="text-red-500">*</span></label>
            <input ref={fullNameRef} autoFocus name="full_name" type="text" placeholder="Nhập tên khách thuê (vd: Nguyễn Văn A)" className="w-full border border-emerald-500 rounded-lg px-3.5 py-2.5 text-[15px] focus:ring-2 focus:ring-emerald-500/20 outline-none transition bg-white shadow-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[15px] font-bold text-slate-700 mb-1.5">Số điện thoại</label>
              <input name="phone" type="tel" placeholder="vd: 0912 345 678" className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white" />
            </div>
            <div>
              <label className="block text-[15px] font-bold text-slate-700 mb-1.5">Địa chỉ Email</label>
              <input name="email" type="text" placeholder="example@email.com" className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white" />
            </div>
          </div>



          <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-4">
            <h4 className="text-[15px] font-bold text-slate-800 mb-3 flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-slate-200 text-slate-500 flex justify-center items-center">
                <i className="fa-regular fa-id-card text-[10px]"></i>
              </div>
              Định danh cá nhân (CCCD/CMND)
            </h4>
            <div className="space-y-3">
              <div>
                <input name="identity_card" type="text" placeholder="Nhập dãy 12 số CCCD..." className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white shadow-sm" />

              </div>
              <div
                className="w-full flex flex-col items-center justify-center p-4 border border-dashed border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition cursor-pointer group relative overflow-hidden h-28"
              >
                <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />

                {imageBase64 ? (
                  <>
                    <img src={imageBase64} alt="CCCD Preview" className="absolute inset-0 w-full h-full object-cover rounded-lg z-0 opacity-40 group-hover:opacity-20 transition" />
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2 border border-emerald-200">
                        <i className="fa-solid fa-check"></i>
                      </div>
                      <div className="text-[12px] font-bold text-emerald-700">Đã cập nhật ảnh</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-slate-100/80 flex items-center justify-center text-slate-400 mb-2 group-hover:bg-primary/10 group-hover:text-primary transition shadow-sm border border-slate-200">
                      <i className="fa-solid fa-cloud-arrow-up text-[11px]"></i>
                    </div>
                    <div className="text-sm font-bold text-slate-600">Nhấp để tải ảnh lên</div>
                    <div className="text-xs text-slate-400 mt-0.5">Hỗ trợ JPG, PNG, tối đa 5MB</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[15px] font-bold text-slate-700 mb-1.5">Ghi chú & Lưu ý</label>
            <textarea name="notes" placeholder="Biển số xe, thói quen sinh hoạt..." rows={2} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white shadow-sm resize-none"></textarea>
          </div>
        </div>

        {(localError || error) && (
          <div className="px-6 pb-3">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation shrink-0"></i>
              <span>{localError || error}</span>
            </div>
          </div>
        )}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-[15px] font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition shadow-sm">Hủy</button>
          <button type="submit" data-tour="tenant-submit-btn" disabled={isPending} className="px-6 py-2.5 rounded-xl text-[15px] font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.5)] hover:shadow-[0_4px_12px_-3px_rgba(16,185,129,0.6)] hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2">
            {isPending ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>} Tạo khách hàng
          </button>
        </div>
      </form>
    </div>
  );
};

const TenantDetailModal = ({ tenant: initialTenant, onClose }: { tenant: Tenant; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts });
  const { data: depositReceipts = [] } = useQuery<MoveInReceipt[]>({
    queryKey: ['move_in_receipts', initialTenant.id],
    queryFn: () => getMoveInReceiptsByTenant(initialTenant.id),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [tenant, setTenant] = useState<Tenant>(initialTenant);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const tenantContracts = useMemo(() => {
    return contracts
      .filter(c => c.tenant_id === tenant.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [contracts, tenant.id]);

  const displayedContracts = showAllHistory ? tenantContracts : tenantContracts.slice(0, 3);
  const hasActiveContract = tenantContracts.some(contract => contract.status === 'active');

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
      queryClient.invalidateQueries({ queryKey: ['tenants'], refetchType: 'all' });
      setTenant(updatedTenant);
      setIsEditing(false);
      onClose();
    }
  });

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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

  if (isEditing) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-[90]" onClick={() => setIsEditing(false)}>
        <form onSubmit={handleEditSubmit} className="bg-white flex flex-col rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] shadow-2xl border border-slate-200 animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 z-10">
            <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                <i className="fa-solid fa-pen-to-square text-xs"></i>
              </div>
              Cập nhật thông tin
            </h3>
            <button type="button" onClick={() => setIsEditing(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition text-slate-500">
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
                <input name="email" defaultValue={tenant.email} type="text" placeholder="example@email.com" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-slate-50 focus:bg-white" />
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

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 rounded-b-2xl">
            <button type="button" onClick={() => setIsEditing(false)} className="px-5 py-2 rounded-xl text-[15px] font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition shadow-sm">Hủy</button>
            <button type="submit" disabled={updateMut.isPending} className="px-5 py-2 bg-primary text-white rounded-xl text-[15px] font-bold shadow-sm hover:bg-primary-dark flex items-center gap-2">
              {updateMut.isPending ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>} Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-[90]" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] shadow-2xl border border-slate-200 animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-6 border-b border-slate-100 flex justify-between items-start bg-white shrink-0 z-10">
          <div className="flex gap-4 items-center">
            <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-400 text-white flex items-center justify-center text-2xl font-bold shadow-sm shadow-indigo-200 ring-2 ring-white">
              {tenant.full_name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{tenant.full_name}</h2>
              <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 font-medium tracking-wide">
                {tenant.phone && <span className="flex items-center gap-1.5"><i className="fa-solid fa-phone text-[10px] text-slate-400"></i>{tenant.phone}</span>}
                {tenant.identity_card && <span className="flex items-center gap-1.5"><i className="fa-regular fa-id-card text-[10px] text-slate-400"></i>{tenant.identity_card}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition text-slate-400">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="p-6 bg-[#fbfcfd] space-y-6 overflow-y-auto">
          {/* Notes / Detail Box */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3 text-[15px]">
            {tenant.identity_image_url && (
              <div className="w-full pb-3 border-b border-slate-100 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold text-[11px] uppercase tracking-wider"><i className="fa-regular fa-image mr-1"></i> Phân loại: Ảnh định danh cá nhân</span>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 flex justify-center bg-slate-100">
                  <img src={tenant.identity_image_url} className="w-full h-full object-contain max-h-48" alt="CCCD" />
                </div>
              </div>
            )}
            {tenant.email && (
              <div className="flex gap-4 items-center">
                <span className="text-slate-400 font-medium w-20 shrink-0">Email:</span>
                <span className="font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{tenant.email}</span>
              </div>
            )}
            <div className="flex gap-4 items-center">
              <span className="text-slate-400 font-medium w-20 shrink-0">Ngày tạo:</span>
              <span className="font-bold text-slate-700">{new Date(tenant.created_at).toLocaleDateString('vi-VN')}</span>
            </div>
            {tenant.notes && (
              <div className="flex gap-4 border-t border-slate-100 pt-3 mt-1 items-start">
                <span className="text-slate-400 font-medium w-20 shrink-0">Ghi chú:</span>
                <span className="text-slate-600 font-medium">{tenant.notes}</span>
              </div>
            )}
          </div>

          {/* Lịch sử tiền cọc */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-[15px] flex items-center gap-2">
              <i className="fa-solid fa-hand-holding-dollar text-slate-400"></i> LỊCH SỬ TIỀN CỌC
            </h3>
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
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-center text-slate-400 shadow-sm flex flex-col items-center">
                <i className="fa-solid fa-coins text-2xl mb-2 opacity-30"></i>
                <p className="text-[15px] font-medium">Chưa có phiếu thu tiền cọc nào.</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-[15px] flex items-center gap-2">
              <i className="fa-solid fa-clock-rotate-left text-slate-400"></i> LỊCH SỬ HỢP ĐỒNG
            </h3>

            {tenantContracts.length > 0 ? (
              <div className="flex flex-col gap-3">
                {displayedContracts.map(c => {
                  const room = rooms.find(r => r.id === c.room_id);
                  return (
                    <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex justify-between items-center group hover:border-emerald-300 transition">
                      <div className="flex flex-col gap-1.5">
                        <span className="font-bold text-[15px] text-slate-800"><i className="fa-solid fa-door-open text-slate-400 mr-1.5"></i> {room?.name || 'Phòng không rõ'}</span>
                        <span className="text-slate-500 text-[13px] font-medium tracking-wide"><i className="fa-regular fa-calendar mr-1.5"></i> {new Date(c.move_in_date).toLocaleDateString('vi-VN')} {c.expiration_date ? ` - ${new Date(c.expiration_date).toLocaleDateString('vi-VN')}` : ' - Không thời hạn'}</span>
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

        <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-between items-center rounded-b-2xl">
          <div className={`px-4 py-2 rounded-xl text-[15px] font-bold border flex items-center gap-2 ${hasActiveContract ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
            <i className={`fa-solid ${hasActiveContract ? 'fa-house-user' : 'fa-user-clock'}`}></i>
            {hasActiveContract ? 'Đang ở theo hợp đồng' : 'Chưa ở'}
          </div>

          <button onClick={() => setIsEditing(true)} className="px-6 py-2.5 rounded-xl text-[15px] font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.5)] hover:shadow-[0_4px_12px_-3px_rgba(16,185,129,0.6)] hover:-translate-y-0.5 transition-all flex items-center gap-2">
            <i className="fa-solid fa-pen-to-square"></i> Cập nhật hồ sơ
          </button>
        </div>
      </div>
    </div>
  );
}
