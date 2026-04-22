import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpDown,
  CheckCircle2,
  Filter,
  MoreVertical,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  XCircle
} from 'lucide-react'
import {
  createServiceZone,
  createUser,
  createUserViaAdmin,
  deleteServiceZone,
  deleteUser,
  getAppSettings,
  getContracts,
  getRooms,
  getServiceZones,
  getUsers,
  resetUserPassword,
  updateAppSettings,
  updateServiceZone,
  updateUserProfile,
  updateUserRole,
  updateUserStatus,
  type AppSettings,
  type AppUser,
  type Contract,
  type ContractStatus,
  type ServiceZone,
  type UserRole
} from '../lib/db'

type SettingsSection = 'general' | 'zones' | 'users' | 'updates'

export const SettingsTab: React.FC<{ initialTab?: SettingsSection; currentUser: AppUser }> = ({
  currentUser,
  initialTab = 'general'
}) => {
  const [activeTab, setActiveTab] = useState<SettingsSection>(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const navItems: { id: SettingsSection; icon: string; label: string }[] = [
    { id: 'general', icon: 'fa-building', label: 'Thông tin chung' },
    { id: 'zones', icon: 'fa-tags', label: 'Vùng giá dịch vụ' },
    ...(currentUser.role === 'admin'
      ? [{ id: 'users' as const, icon: 'fa-users-gear', label: 'Tài khoản' }]
      : []),
    { id: 'updates', icon: 'fa-cloud-arrow-down', label: 'Cập nhật' }
  ]

  return (
    <div className="m-4 flex h-[calc(100vh-140px)] flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:flex-row">
      <div className="w-full shrink-0 border-r border-gray-100 bg-gray-50 md:w-64">
        <div className="hidden border-b border-gray-100 p-4 md:block">
          <h2 className="text-lg font-bold text-gray-800">Quản trị hệ thống</h2>
          <p className="mt-1 text-xs text-gray-500">Cấu hình, tài khoản và cập nhật.</p>
        </div>
        <nav className="flex gap-1 overflow-y-auto p-3 md:block">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex min-w-fit items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium transition md:w-full ${activeTab === item.id
                ? 'border border-gray-100 bg-white text-primary shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <i className={`fa-solid ${item.icon} w-4 text-center`}></i>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="relative flex-1 overflow-y-auto bg-white">
        {activeTab === 'general' && <GeneralSettingsSafe />}
        {activeTab === 'zones' && <ServiceZonesSettings />}
        {activeTab === 'users' && currentUser.role === 'admin' && <UsersSettingsPanel />}
        {activeTab === 'updates' && <ProductionUpdateSettings />}
      </div>
    </div>
  )
}

function normalizeAccountHolderName(name: string, enforceUpper = true): string {
  let str = name || '';
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  str = str.replace(/[^a-zA-Z0-9 ]/g, '');
  if (enforceUpper) {
    str = str.toUpperCase();
  }
  return str;
}

function isAsciiUpperName(name: string): boolean {
  if (!name) return false;
  return /^[A-Z0-9 ]+$/.test(name);
}

function buildVietQrPreviewUrl(bankId: string, accountNo: string, accountName: string): string {
  const url = new URL('https://qr.sepay.vn/img');
  url.searchParams.append('bank', bankId);
  url.searchParams.append('acc', accountNo);
  url.searchParams.append('template', 'compact');
  url.searchParams.append('amount', '0');
  url.searchParams.append('des', 'DBY HOME');
  url.searchParams.append('name', accountName);
  return url.toString();
}

const GeneralSettingsSafe = (): React.JSX.Element => {
  const [settings, setSettings] = useState<AppSettings>({})
  const [initialSettings, setInitialSettings] = useState<AppSettings>({})
  const [loading, setLoading] = useState(true)
  const [savingInfo, setSavingInfo] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [savedInfo, setSavedInfo] = useState(false)
  const [savedPayment, setSavedPayment] = useState(false)
  const [infoError, setInfoError] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [showBankDropdown, setShowBankDropdown] = useState(false)
  const [qrPreviewUrl, setQrPreviewUrl] = useState('')
  const [qrPreviewError, setQrPreviewError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const propertyNameInputRef = useRef<HTMLInputElement | null>(null)
  const bankDropdownRef = useRef<HTMLDivElement | null>(null)

  const bankOptions = [
    { id: 'VCB', bin: '970436', label: 'Vietcombank' },
    { id: 'MBBANK', bin: '970422', label: 'MB Bank' },
    { id: 'TCB', bin: '970407', label: 'Techcombank' },
    { id: 'ACB', bin: '970416', label: 'ACB' },
    { id: 'BIDV', bin: '970418', label: 'BIDV' },
    { id: 'VPB', bin: '970432', label: 'VPBank' },
    { id: 'TPB', bin: '970423', label: 'TPBank' },
    { id: 'AGRIBANK', bin: '970405', label: 'Agribank' },
    { id: 'SHB', bin: '970443', label: 'SHBank' },
    { id: 'OCB', bin: '970448', label: 'OCB' },
    { id: 'MSB', bin: '970426', label: 'MSB' },
    { id: 'VIB', bin: '970441', label: 'VIB' },
    { id: 'HDB', bin: '970437', label: 'HDBank' },
    { id: 'SCB', bin: '970429', label: 'SCB' },
    { id: 'SACOMBANK', bin: '970403', label: 'Sacombank' },
    { id: 'EXIMBANK', bin: '970431', label: 'Eximbank' },
  ]

  const infoSettings = useMemo(
    () => ({
      property_name: settings.property_name || '',
      property_owner_name: settings.property_owner_name || '',
      property_owner_phone: settings.property_owner_phone || '',
      property_address: settings.property_address || ''
    }),
    [settings]
  )

  const initialInfoSettings = useMemo(
    () => ({
      property_name: initialSettings.property_name || '',
      property_owner_name: initialSettings.property_owner_name || '',
      property_owner_phone: initialSettings.property_owner_phone || '',
      property_address: initialSettings.property_address || ''
    }),
    [initialSettings]
  )

  const paymentSettings = useMemo(
    () => ({
      bank_id: settings.bank_id || '',
      account_no: settings.account_no || '',
      account_name: settings.account_name || '',
      sepay_api_token: settings.sepay_api_token || ''
    }),
    [settings]
  )

  const initialPaymentSettings = useMemo(
    () => ({
      bank_id: initialSettings.bank_id || '',
      account_no: initialSettings.account_no || '',
      account_name: initialSettings.account_name || '',
      sepay_api_token: initialSettings.sepay_api_token || ''
    }),
    [initialSettings]
  )

  const hasInfoChanges = useMemo(
    () => JSON.stringify(infoSettings) !== JSON.stringify(initialInfoSettings),
    [infoSettings, initialInfoSettings]
  )

  const hasPaymentChanges = useMemo(
    () => JSON.stringify(paymentSettings) !== JSON.stringify(initialPaymentSettings),
    [paymentSettings, initialPaymentSettings]
  )

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const value = await getAppSettings()
        const normalized = { ...(value || {}) }
        setSettings(normalized)
        setInitialSettings({ ...normalized })
        const normalizedName = normalizeAccountHolderName(normalized.account_name || '')
        const normalizedNo = (normalized.account_no || '').replace(/\s+/g, '')
        if (normalized.bank_id && normalizedNo && normalizedName && isAsciiUpperName(normalizedName)) {
          setQrPreviewUrl(buildVietQrPreviewUrl(normalized.bank_id, normalizedNo, normalizedName))
        }
      } catch {
        setSettings({})
        setInitialSettings({})
      } finally {
        setLoading(false)
      }
    }
    void loadSettings()
  }, [])

  useEffect(() => {
    if (loading) return
    const timer = window.setTimeout(() => propertyNameInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [loading])

  const doLookup = async () => {
    const bankId = settings.bank_id
    const accountNo = settings.account_no?.replace(/\s+/g, '')
    if (!bankId || !accountNo || accountNo.length < 5) return

    const bin = bankOptions.find(b => b.id === bankId)?.bin
    if (!bin) return

    setIsLookingUp(true)
    try {
      const res = await window.api.bank.lookup(bin, accountNo)
      if (res.ok && res.data && (res.data as any).data && typeof (res.data as any).data.accountName === 'string') {
        const fetchedName = normalizeAccountHolderName((res.data as any).data.accountName)
        setSettings(prev => ({ ...prev, account_name: fetchedName }))
      }
    } catch (err) {
      console.error('Auto lookup bank name failed:', err)
    } finally {
      setIsLookingUp(false)
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Auto lookup using the same logic function after 1.5s
      if (settings.bank_id && settings.account_no && settings.account_no.length >= 5 && !settings.account_name) {
        doLookup()
      }
    }, 1500)

    return () => clearTimeout(timeoutId)
  }, [settings.bank_id, settings.account_no, settings.account_name])

  const handleSaveInfo = async () => {
    setInfoError('')
    setSavingInfo(true)
    try {
      await updateAppSettings(infoSettings)
      setInitialSettings((prev) => ({ ...prev, ...infoSettings }))
      setSavedInfo(true)
      setTimeout(() => setSavedInfo(false), 2500)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể lưu thông tin.'
      console.error('[Settings] handleSaveInfo error:', msg, error)
      setInfoError(msg)
    } finally {
      setSavingInfo(false)
    }
  }

  const handleSavePayment = async () => {
    setPaymentError('')
    setQrPreviewError('')
    const bankId = (settings.bank_id || '').trim()
    const accountNo = (settings.account_no || '').replace(/\s+/g, '')
    const accountNameRaw = (settings.account_name || '').trim()
    const accountName = normalizeAccountHolderName(accountNameRaw)

    if (bankId || accountNo || accountName) {
      if (!bankId) { setPaymentError('Vui lòng chọn ngân hàng'); return }
      if (!accountNo) { setPaymentError('Vui lòng nhập số tài khoản'); return }
      if (!accountName) { setPaymentError('Vui lòng nhập tên chủ tài khoản (không dấu)'); return }
      if (!isAsciiUpperName(accountName)) { setPaymentError('Tên chủ tài khoản không hợp lệ (nhập IN HOA mất dấu)'); return }
    }

    setSavingPayment(true)
    try {
      await updateAppSettings({ ...paymentSettings, account_name: accountName })
      setInitialSettings((prev) => ({ ...prev, ...paymentSettings, account_name: accountName }))
      setSettings((prev) => ({ ...prev, account_name: accountName }))
      setSavedPayment(true)
      setTimeout(() => setSavedPayment(false), 2500)
      if (bankId && accountNo && accountName) {
        setQrPreviewUrl(buildVietQrPreviewUrl(bankId, accountNo, accountName))
      } else {
        setQrPreviewUrl('')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Khong the luu thanh toan'
      setPaymentError(msg)
    } finally {
      setSavingPayment(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl text-gray-300" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20 p-2 md:p-6">

      {/* 1. Thông tin chung */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col border-b border-gray-50/80 bg-gray-50/30 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 shadow-inner">
              <i className="fa-solid fa-house-chimney" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-800">Thông tin nhà trọ</h2>
              <p className="mt-0.5 text-[12px] text-gray-500">Cấu hình thông tin in trên hóa đơn, biên nhận.</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
            <Field
              label="Tên nhà trọ"
              value={settings.property_name || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, property_name: value }))}
              inputRef={propertyNameInputRef}
            />
            <Field
              label="Người đại diện thu"
              value={settings.property_owner_name || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, property_owner_name: value }))}
            />
            <Field
              label="SĐT người đại diện"
              value={settings.property_owner_phone || ''}
              onChange={(value) => setSettings((prev) => ({ ...prev, property_owner_phone: value }))}
            />
            <div className="md:col-span-2">
              <Field
                label="Địa chỉ nhà trọ"
                value={settings.property_address || ''}
                onChange={(value) => setSettings((prev) => ({ ...prev, property_address: value }))}
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-gray-50 pt-4">
            <div className="h-5">
              {savedInfo && (
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                  <i className="fa-solid fa-circle-check" /> Đã lưu thành công!
                </span>
              )}
              {infoError && !savedInfo && (
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-red-500">
                  <i className="fa-solid fa-triangle-exclamation" /> {infoError}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettings((prev) => ({ ...prev, ...initialInfoSettings }))}
                disabled={!hasInfoChanges || savingInfo}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveInfo}
                disabled={!hasInfoChanges || savingInfo}
                className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-700 disabled:opacity-50"
              >
                {savingInfo ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
                Lưu cấu hình
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Cài đặt thanh toán */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col border-b border-gray-50/80 bg-gray-50/30 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 shadow-inner">
              <i className="fa-solid fa-money-check-dollar" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-800">Tài khoản nhận tiền</h2>
              <p className="mt-0.5 text-[12px] text-gray-500">Cấu hình VietQR để hiển thị lên hóa đơn gửi khách.</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                <i className="fa-solid fa-building-columns text-gray-300" style={{ fontSize: 10 }} />
                Ngân hàng
              </label>
              <div className="relative" ref={bankDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowBankDropdown((v) => !v)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-left transition-all hover:border-violet-300 focus:border-violet-400 focus:outline-none focus:ring-3 focus:ring-violet-100"
                >
                  {settings.bank_id ? (() => {
                    const bank = bankOptions.find((b) => b.id === settings.bank_id)
                    return (
                      <>
                        <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded bg-violet-100 text-[10px] font-bold text-violet-700">
                          {settings.bank_id.slice(0, 3)}
                        </span>
                        <span className="flex-1 text-[13px] text-gray-800">{bank?.label ?? settings.bank_id}</span>
                      </>
                    )
                  })() : (
                    <span className="flex-1 text-[13px] text-gray-400">Chọn ngân hàng...</span>
                  )}
                  <i className={`fa-solid fa-chevron-down text-[10px] text-gray-400 transition-transform duration-200 ${showBankDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showBankDropdown && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60">
                    <div className="max-h-56 overflow-y-auto py-1">
                      {bankOptions.map((bank) => (
                        <button
                          key={bank.id}
                          type="button"
                          onClick={() => { setSettings((prev) => ({ ...prev, bank_id: bank.id, account_name: '' })); setShowBankDropdown(false) }}
                          className={`flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-violet-50 ${settings.bank_id === bank.id ? 'bg-violet-50' : ''}`}
                        >
                          <span className={`flex h-6 w-8 shrink-0 items-center justify-center rounded text-[10px] font-bold ${settings.bank_id === bank.id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {bank.id.slice(0, 3)}
                          </span>
                          <span className="flex-1 text-[13px] text-gray-700">{bank.label}</span>
                          {settings.bank_id === bank.id && (
                            <i className="fa-solid fa-check text-[11px] text-violet-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                <i className="fa-solid fa-hashtag text-gray-300" style={{ fontSize: 10 }} />
                Số tài khoản
              </label>
              <input
                type="text"
                value={settings.account_no || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, account_no: e.target.value, account_name: '' }))}
                placeholder="0123456789"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-3 focus:ring-violet-100"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
              <i className="fa-solid fa-id-card text-gray-300" style={{ fontSize: 10 }} />
              Chủ tài khoản
              {isLookingUp && (
                <span className="ml-2 text-violet-500 flex items-center gap-1 animate-pulse">
                  <i className="fa-solid fa-circle-notch fa-spin"></i> Tra cứu...
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                value={settings.account_name || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, account_name: normalizeAccountHolderName(e.target.value, false) }))}
                onBlur={(e) => setSettings((prev) => ({ ...prev, account_name: normalizeAccountHolderName(e.target.value) }))}
                placeholder="Nhập tên hoặc Vui lòng bấm [Lấy tên]..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-[13px] uppercase text-gray-800 placeholder-gray-300 outline-none transition-all focus:border-violet-400 focus:bg-white focus:ring-3 focus:ring-violet-100"
              />
              <button
                type="button"
                onClick={doLookup}
                disabled={isLookingUp || !settings.bank_id || !settings.account_no}
                className="absolute right-1.5 top-1.5 rounded-lg bg-violet-100 px-3 py-1 text-[11px] font-bold text-violet-600 hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Lấy tên chủ tài khoản"
              >
                Lấy tên
              </button>
            </div>
            <p className="text-[11px] text-gray-400">Được tra cứu tự động từ Số tài khoản. Bạn có thể bấm [Lấy tên] nếu không cập nhật.</p>
          </div>

          <div className="flex flex-col gap-1.5 mt-2">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
              <i className="fa-solid fa-key text-gray-300" style={{ fontSize: 10 }} />
              SePay API Token (Dùng để đồng bộ hóa đơn tự động)
            </label>
            <input
              type="text"
              value={settings.sepay_api_token || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, sepay_api_token: e.target.value }))}
              placeholder="VD: 1N2UJKPXD9DAFHHQZHY0H..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 transition-all focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-3 focus:ring-violet-100"
            />
            <p className="text-[11px] text-gray-400">Khóa API lấy từ trang Quản trị SePay để kết nối phần mềm.</p>
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-2.5">
            <i className="fa-solid fa-qrcode text-sm text-violet-400" />
            <span className="text-[11px] font-medium text-violet-600">
              Thông tin tài khoản sẽ hiển thị trên <strong>mã QR thanh toán</strong> của hóa đơn.
            </span>
          </div>

          {qrPreviewUrl && (
            <div className="rounded-2xl border border-violet-100 bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-violet-700">
                <i className="fa-solid fa-qrcode" />
                Mã QR quét thử
              </div>
              <div className="flex flex-col items-center gap-3 md:flex-row md:items-start">
                <img
                  src={qrPreviewUrl}
                  alt="QR thanh toán"
                  className="h-56 w-56 rounded-xl border border-gray-200 bg-white p-2 md:h-64 md:w-64"
                  onError={() => setQrPreviewError('Không tạo được QR. Vui lòng kiểm tra lại ngân hàng hoặc số tài khoản.')}
                />
                <div className="text-[11px] text-gray-500">
                  <p>Quét thử bằng app ngân hàng để kiểm tra người nhận trước khi gửi cho khách.</p>
                  {qrPreviewError && <p className="mt-2 text-rose-500">{qrPreviewError}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between border-t border-gray-50 pt-4">
            <div className="h-5">
              {savedPayment && (
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                  <i className="fa-solid fa-circle-check" /> Đã lưu thành công!
                </span>
              )}
              {paymentError && !savedPayment && (
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-red-500">
                  <i className="fa-solid fa-triangle-exclamation" /> {paymentError}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettings((prev) => ({ ...prev, ...initialPaymentSettings }))}
                disabled={!hasPaymentChanges || savingPayment}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleSavePayment}
                disabled={!hasPaymentChanges || savingPayment}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-md shadow-violet-500/20 transition hover:bg-violet-700 disabled:opacity-50"
              >
                {savingPayment ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
                Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ServiceZonesSettings = (): React.JSX.Element => {
  const queryClient = useQueryClient()
  const { data: serviceZones = [] } = useQuery({ queryKey: ['serviceZones'], queryFn: getServiceZones })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const [editingZone, setEditingZone] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ServiceZone>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [newZone, setNewZone] = useState<Partial<ServiceZone>>({
    name: '',
    electric_price: 3500,
    water_price: 20000,
    internet_price: 100000,
    cleaning_price: 20000
  })

  const createMutation = useMutation({
    mutationFn: createServiceZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      setIsAdding(false)
      setNewZone({
        name: '',
        electric_price: 3500,
        water_price: 20000,
        internet_price: 100000,
        cleaning_price: 20000
      })
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ServiceZone> }) =>
      updateServiceZone(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      setEditingZone(null)
      setEditForm({})
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteServiceZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
    }
  })

  const roomCount = (zoneId: string) => rooms.filter((room) => room.service_zone_id === zoneId).length

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 p-6 md:p-8">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Vùng bảng giá</h3>
          <p className="mt-1 text-sm text-gray-500">Quản lý giá điện, nước, internet và rác theo từng vùng.</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark"
        >
          Thêm vùng giá
        </button>
      </div>

      <div className="flex-1 p-6 md:p-8">
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-4">Tên vùng</th>
                <th className="px-5 py-4">Điện</th>
                <th className="px-5 py-4">Nước</th>
                <th className="px-5 py-4">Internet</th>
                <th className="px-5 py-4">Rác</th>
                <th className="px-5 py-4 text-center">Phòng</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isAdding && (
                <ZoneRowEditor
                  values={newZone}
                  onChange={setNewZone}
                  onCancel={() => setIsAdding(false)}
                  onSave={() => createMutation.mutate(newZone)}
                  saving={createMutation.isPending}
                />
              )}
              {serviceZones.map((zone) =>
                editingZone === zone.id ? (
                  <ZoneRowEditor
                    key={zone.id}
                    values={editForm}
                    onChange={setEditForm}
                    onCancel={() => {
                      setEditingZone(null)
                      setEditForm({})
                    }}
                    onSave={() => updateMutation.mutate({ id: zone.id, updates: editForm })}
                    saving={updateMutation.isPending}
                  />
                ) : (
                  <tr key={zone.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-bold text-gray-800">{zone.name}</td>
                    <td className="px-5 py-4">{formatNumber(zone.electric_price)}</td>
                    <td className="px-5 py-4">{formatNumber(zone.water_price)}</td>
                    <td className="px-5 py-4">{formatNumber(zone.internet_price)}</td>
                    <td className="px-5 py-4">{formatNumber(zone.cleaning_price)}</td>
                    <td className="px-5 py-4 text-center">
                      <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
                        {roomCount(zone.id)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingZone(zone.id)
                            setEditForm(zone)
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-500 transition hover:bg-blue-50"
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        {zone.id !== 'zone-1' && (
                          <button
                            onClick={() => deleteMutation.mutate(zone.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const UsersSettings = (): React.JSX.Element => {
  const queryClient = useQueryClient()
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'user' as UserRole
  })
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({})

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setForm({ username: '', full_name: '', password: '', role: 'user' })
    }
  })

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'inactive' }) =>
      updateUserStatus(userId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) => updateUserRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      resetUserPassword(userId, password),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setResetPasswords((prev) => ({ ...prev, [variables.userId]: '' }))
    }
  })

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-gray-100 p-6 md:p-8">
        <h3 className="text-lg font-bold text-gray-800">Tài khoản hệ thống</h3>
        <p className="mt-1 text-sm text-gray-500">Tạo user mới, reset mật khẩu và vô hiệu hóa user.</p>
      </div>

      <div className="grid flex-1 gap-6 p-6 md:grid-cols-[360px_1fr] md:p-8">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-gray-500">
            Thêm tài khoản
          </div>
          <div className="space-y-4">
            <Field
              label="Username"
              value={form.username}
              onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
            />
            <Field
              label="Họ tên"
              value={form.full_name}
              onChange={(value) => setForm((prev) => ({ ...prev, full_name: value }))}
            />
            <Field
              label="Mật khẩu"
              value={form.password}
              onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
              type="password"
            />
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-gray-500">
                Vai trò
              </label>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark disabled:opacity-60"
            >
              {createMutation.isPending ? 'Đang tạo...' : 'Thêm tài khoản'}
            </button>
            {createMutation.error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : 'Không thể tạo user.'}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-4">Tài khoản</th>
                <th className="px-5 py-4">Vai trò</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Reset mật khẩu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="align-top hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="font-bold text-gray-800">{user.full_name}</div>
                    <div className="mt-1 text-xs text-gray-500">@{user.username}</div>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      value={user.role}
                      onChange={(event) =>
                        roleMutation.mutate({ userId: user.id, role: event.target.value as UserRole })
                      }
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() =>
                        statusMutation.mutate({
                          userId: user.id,
                          status: user.status === 'active' ? 'inactive' : 'active'
                        })
                      }
                      className={`rounded-full px-3 py-1 text-xs font-bold ${user.status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                      {user.status === 'active' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={resetPasswords[user.id] || ''}
                        onChange={(event) =>
                          setResetPasswords((prev) => ({ ...prev, [user.id]: event.target.value }))
                        }
                        placeholder="Mật khẩu mới"
                        className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <button
                        onClick={() =>
                          resetPasswordMutation.mutate({
                            userId: user.id,
                            password: resetPasswords[user.id] || ''
                          })
                        }
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

void UsersSettings

const UsersSettingsPanel = (): React.JSX.Element => {
  const queryClient = useQueryClient()
  const { data: users = [], isLoading, error: usersError } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers
  })
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'username' | 'role'>('name')
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'user' as UserRole
  })

  const createUserMutation = useMutation({
    mutationFn: createUserViaAdmin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowAddForm(false)
      setNewUserForm({ email: '', password: '', full_name: '', role: 'user' })
    }
  })

  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '' })
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [deletingUser, setDeletingUser] = useState<AppUser | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { full_name: string } }) =>
      updateUserProfile(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditingUser(null)
    }
  })

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetUserPassword(id, password),
    onSuccess: () => {
      setPasswordUser(null)
      setNewPassword('')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDeletingUser(null)
    }
  })

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'inactive' }) =>
      updateUserStatus(userId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  })

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) => updateUserRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  })

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    const nextUsers = users.filter((user) => {
      if (statusFilter !== 'all' && user.status !== statusFilter) return false
      if (!keyword) return true
      return [user.username, user.email || '', user.full_name, accountRoleLabel(user.role)].some((value) =>
        value.toLowerCase().includes(keyword)
      )
    })

    return [...nextUsers].sort((a, b) => {
      if (sortBy === 'username') return a.username.localeCompare(b.username, 'vi')
      if (sortBy === 'role') {
        return accountRoleLabel(a.role).localeCompare(accountRoleLabel(b.role), 'vi')
      }
      return a.full_name.localeCompare(b.full_name, 'vi')
    })
  }, [searchTerm, sortBy, statusFilter, users])

  const totalUsers = users.length
  const activeUsers = users.filter((user) => user.status === 'active').length
  const adminUsers = users.filter((user) => user.role === 'admin').length

  return (
    <>
      <div className="app-system-font flex min-h-full flex-col bg-[#f5f7fb]">
        <div className="border-b border-slate-200 bg-white px-6 py-5 md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-[#00558d]">
                Quản trị tài khoản
              </div>
              <h3 className="mt-2 text-xl font-black text-slate-900">Tài khoản hệ thống</h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Quản lý người dùng nội bộ, phân quyền truy cập và thao tác bảo mật ngay trong một màn
                hình.
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-3 gap-3">
              <AccountMetricCard label="Tổng tài khoản" value={String(totalUsers)} tone="slate" />
              <AccountMetricCard label="Đang hoạt động" value={String(activeUsers)} tone="emerald" />
              <AccountMetricCard label="Quản trị viên" value={String(adminUsers)} tone="blue" />
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 md:p-8">
          <div className="mx-auto max-w-[1440px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.25)]">
            <div className="border-b border-slate-100 bg-white px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Tìm theo tên, username hoặc vai trò..."
                      className="h-10 w-[320px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <Filter size={14} />
                    <select
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')
                      }
                      className="bg-transparent pr-2 outline-none"
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="active">Đang hoạt động</option>
                      <option value="inactive">Đã vô hiệu hóa</option>
                    </select>
                  </div>
                  <button
                    onClick={() =>
                      setSortBy((current) =>
                        current === 'name' ? 'username' : current === 'username' ? 'role' : 'name'
                      )
                    }
                    className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    <ArrowUpDown size={14} />
                    {sortBy === 'name'
                      ? 'Sắp xếp: Họ tên'
                      : sortBy === 'username'
                        ? 'Sắp xếp: Username'
                        : 'Sắp xếp: Vai trò'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-primary"
                    title="Làm mới danh sách"
                  >
                    <RefreshCcw size={16} />
                  </button>
                  <button
                    onClick={() => setShowAddForm((current) => !current)}
                    className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition ${showAddForm ? 'bg-rose-500 hover:bg-rose-600' : 'bg-[#00558d] hover:bg-[#004470]'
                      }`}
                  >
                    {showAddForm ? <XCircle size={16} /> : <Plus size={16} />}
                    {showAddForm ? 'Đóng biểu mẫu' : 'Thêm tài khoản'}
                  </button>
                </div>
              </div>
            </div>

            {usersError && (
              <div className="border-b border-rose-100 bg-rose-50 px-6 py-4 text-sm text-rose-700">
                {usersError instanceof Error ? usersError.message : 'Không thể tải danh sách tài khoản.'}
              </div>
            )}

            {showAddForm && (
              <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_100%)] px-6 py-6">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    createUserMutation.mutate(newUserForm)
                  }}
                  className="mx-auto max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="mb-5 text-sm font-bold text-[#00558d]">Tạo tài khoản mới</div>

                  {createUserMutation.error && (
                    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {createUserMutation.error instanceof Error
                        ? createUserMutation.error.message
                        : 'Có lỗi xảy ra khi tạo tài khoản.'}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-600">
                        Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={newUserForm.email}
                        onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="example@email.com"
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-600">
                        Mật khẩu <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={newUserForm.password}
                        onChange={(e) => setNewUserForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Tối thiểu 6 ký tự"
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-600">
                        Họ tên <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newUserForm.full_name}
                        onChange={(e) => setNewUserForm((f) => ({ ...f, full_name: e.target.value }))}
                        placeholder="Nguyễn Văn A"
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-600">Vai trò</label>
                      <select
                        value={newUserForm.role}
                        onChange={(e) =>
                          setNewUserForm((f) => ({ ...f, role: e.target.value as UserRole }))
                        }
                        className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                      >
                        <option value="user">Người dùng</option>
                        <option value="admin">Quản trị viên</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false)
                        setNewUserForm({ email: '', password: '', full_name: '', role: 'user' })
                        createUserMutation.reset()
                      }}
                      className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={createUserMutation.isPending}
                      className="rounded-xl bg-[#00558d] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#004470] disabled:opacity-60"
                    >
                      {createUserMutation.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                    <th className="px-6 py-4">Tài khoản</th>
                    <th className="px-6 py-4">Vai trò</th>
                    <th className="px-6 py-4">Trạng thái</th>
                    <th className="px-6 py-4">Hoạt động</th>
                    <th className="px-6 py-4">Thông tin</th>
                    <th className="px-6 py-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading && (
                    <tr>
                      <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-400">
                        Đang tải danh sách tài khoản...
                      </td>
                    </tr>
                  )}
                  {!isLoading && filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-14 text-center">
                        <div className="mx-auto max-w-md">
                          <div className="text-base font-bold text-slate-700">
                            Không có tài khoản phù hợp
                          </div>
                          <div className="mt-2 text-sm text-slate-500">
                            Hãy đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái để xem thêm dữ liệu.
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filteredUsers.map((user) => {
                    const isUpdatingStatus =
                      statusMutation.isPending && statusMutation.variables?.userId === user.id
                    const isUpdatingRole =
                      roleMutation.isPending && roleMutation.variables?.userId === user.id

                    return (
                      <tr key={user.id} className="group bg-white transition hover:bg-slate-50/80">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                              {accountUserInitials(user)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-[#00558d]">
                                @{user.username}
                              </div>
                              <div className="mt-1 truncate text-sm text-slate-600">
                                {user.full_name}
                              </div>
                              <div className="mt-1 text-xs text-slate-400">
                                Tạo lúc {accountFormatDateTime(user.created_at)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${user.role === 'admin'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                                }`}
                            >
                              <ShieldCheck size={14} />
                              {accountRoleLabel(user.role)}
                            </span>
                            <select
                              value={user.role}
                              onChange={(event) =>
                                roleMutation.mutate({
                                  userId: user.id,
                                  role: event.target.value as UserRole
                                })
                              }
                              disabled={isUpdatingRole}
                              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
                            >
                              <option value="user">Người dùng</option>
                              <option value="admin">Quản trị viên</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase ${user.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                              }`}
                          >
                            <CheckCircle2 size={14} />
                            {user.status === 'active' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-medium text-slate-700">
                            {user.last_login_at
                              ? accountFormatDateTime(user.last_login_at)
                              : 'Chưa đăng nhập'}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {user.status === 'active'
                              ? 'Sẵn sàng sử dụng'
                              : 'Đã tạm khóa truy cập'}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-slate-700">
                              {user.email || '@' + user.username}
                            </div>
                            <div className="text-xs text-slate-400">ID: {user.id.slice(0, 8)}</div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() =>
                                statusMutation.mutate({
                                  userId: user.id,
                                  status: user.status === 'active' ? 'inactive' : 'active'
                                })
                              }
                              disabled={isUpdatingStatus}
                              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${user.status === 'active'
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              {user.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt'}
                            </button>
                            <div className="relative">
                              <button
                                onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                              >
                                <MoreVertical size={16} />
                              </button>
                              {openMenuId === user.id && (
                                <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                                  <button
                                    onClick={() => {
                                      setEditForm({ full_name: user.full_name })
                                      setEditingUser(user)
                                      setOpenMenuId(null)
                                    }}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    Sửa thông tin
                                  </button>
                                  <button
                                    onClick={() => {
                                      setPasswordUser(user)
                                      setNewPassword('')
                                      setOpenMenuId(null)
                                    }}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    Đổi mật khẩu
                                  </button>
                                  <div className="border-t border-slate-100" />
                                  <button
                                    onClick={() => {
                                      setDeletingUser(user)
                                      setOpenMenuId(null)
                                    }}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-rose-600 hover:bg-rose-50"
                                  >
                                    Xóa tài khoản
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4 text-sm text-slate-500">
              <span>
                Hiển thị {filteredUsers.length} / {totalUsers} tài khoản
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                  Đang hoạt động: {activeUsers}
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                  Admin: {adminUsers}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal sửa thông tin */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              editMutation.mutate({ id: editingUser.id, data: editForm })
            }}
            className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 text-base font-bold text-slate-800">Sửa thông tin tài khoản</div>
            {editMutation.error && (
              <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {editMutation.error instanceof Error ? editMutation.error.message : 'Có lỗi xảy ra.'}
              </div>
            )}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600">Họ tên <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingUser(null)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
              <button type="submit" disabled={editMutation.isPending} className="rounded-xl bg-[#00558d] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#004470] disabled:opacity-60">
                {editMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal đổi mật khẩu */}
      {passwordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              passwordMutation.mutate({ id: passwordUser.id, password: newPassword })
            }}
            className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-1 text-base font-bold text-slate-800">Đổi mật khẩu</div>
            <div className="mb-5 text-sm text-slate-500">@{passwordUser.username}</div>
            {passwordMutation.error && (
              <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {passwordMutation.error instanceof Error ? passwordMutation.error.message : 'Có lỗi xảy ra.'}
              </div>
            )}
            {passwordMutation.isSuccess && (
              <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Đổi mật khẩu thành công.</div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600">Mật khẩu mới <span className="text-rose-500">*</span></label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setPasswordUser(null); setNewPassword(''); passwordMutation.reset() }} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Đóng</button>
              <button type="submit" disabled={passwordMutation.isPending} className="rounded-xl bg-[#00558d] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#004470] disabled:opacity-60">
                {passwordMutation.isPending ? 'Đang lưu...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal xác nhận xóa */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-2 text-base font-bold text-slate-800">Xóa tài khoản?</div>
            <p className="text-sm text-slate-500">
              Tài khoản <span className="font-bold text-slate-700">@{deletingUser.username}</span> ({deletingUser.email}) sẽ bị xóa vĩnh viễn và không thể khôi phục.
            </p>
            {deleteMutation.error && (
              <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Có lỗi xảy ra.'}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setDeletingUser(null); deleteMutation.reset() }} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
              <button onClick={() => deleteMutation.mutate(deletingUser.id)} disabled={deleteMutation.isPending} className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-60">
                {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa tài khoản'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const AccountMetricCard = ({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: 'slate' | 'emerald' | 'blue'
}): React.JSX.Element => {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : tone === 'blue'
        ? 'border-blue-100 bg-blue-50 text-blue-700'
        : 'border-slate-200 bg-slate-50 text-slate-700'

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  )
}

function accountRoleLabel(role: UserRole): string {
  return role === 'admin' ? 'Quản trị viên' : 'Người dùng'
}

function accountUserInitials(user: AppUser): string {
  const source = user.full_name.trim() || user.username.trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
}

function accountFormatDateTime(value?: string): string {
  if (!value) return 'Chưa cập nhật'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật'
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const UpdateSettings = (): React.JSX.Element => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'downloading'>('idle')
  const [message, setMessage] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
    releaseNotes: string
    publishedAt: string
    downloadUrl: string | null
    downloadSize: number
  } | null>(null)

  const checkForUpdate = async () => {
    setStatus('checking')
    setMessage('')
    const result = await window.api.update.check()
    if (!result.success || !result.data) {
      setMessage(result.error || 'Không thể kiểm tra cập nhật.')
      setStatus('idle')
      return
    }

    setUpdateInfo(result.data)
    setMessage(
      result.data.hasUpdate
        ? `Có bản mới v${result.data.latestVersion}.`
        : 'Đang sử dụng bản mới nhất.'
    )
    setStatus(result.data.hasUpdate ? 'ready' : 'idle')
  }

  const applyUpdate = async () => {
    if (false) {
      setMessage('Bản phát hành chưa có tệp cập nhật phù hợp.')
      return
    }
    setStatus('downloading')
    setMessage('Đang tải và áp dụng bản cập nhật...')
    const result = await window.api.update.installLatest()
    if (!result.success) {
      setMessage(result.error || 'Cập nhật thất bại.')
      setStatus('ready')
      return
    }
    if (!updateInfo) return
    setMessage(`Đã áp dụng bản v${result.data?.version || updateInfo.latestVersion}. Ứng dụng sẽ tự khởi động lại.`)
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-gray-100 p-6 md:p-8">
        <h3 className="text-lg font-bold text-gray-800">Cập nhật phần mềm</h3>
        <p className="mt-1 text-sm text-gray-500">Kiểm tra bản phát hành mới trên GitHub và cập nhật không cần cài lại.</p>
      </div>
      <div className="flex-1 p-6 md:p-8">
        <div className="max-w-3xl rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_55%,#eff6ff_100%)] p-6 shadow-[0_24px_60px_-30px_rgba(21,128,61,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-emerald-600">
                Bản phát hành GitHub
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                Kiểm tra phiên bản mới
              </div>
            </div>
            <button
              onClick={checkForUpdate}
              disabled={status === 'checking' || status === 'downloading'}
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark disabled:opacity-60"
            >
              {status === 'checking' ? 'Đang kiểm tra...' : 'Kiểm tra bản cập nhật'}
            </button>
          </div>

          {updateInfo && (
            <div className="mt-6 grid gap-4 rounded-3xl border border-white bg-white/85 p-5 shadow-sm md:grid-cols-2">
              <InfoTile label="Phiên bản hiện tại" value={`v${updateInfo.currentVersion}`} />
              <InfoTile label="Bản mới nhất" value={`v${updateInfo.latestVersion}`} />
              <InfoTile
                label="Dung lượng tệp"
                value={
                  updateInfo.downloadSize > 0
                    ? `${(updateInfo.downloadSize / 1024 / 1024).toFixed(2)} MB`
                    : 'Không rõ'
                }
              />
              <InfoTile
                label="Ngày phát hành"
                value={new Date(updateInfo.publishedAt).toLocaleDateString('vi-VN')}
              />
            </div>
          )}

          {message && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          {updateInfo?.hasUpdate && (
            <div className="mt-6">
              <button
                onClick={applyUpdate}
                disabled={status === 'downloading'}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {status === 'downloading' ? 'Đang cập nhật...' : 'Cập nhật ngay'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type ProductionUpdateInfo = {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseNotes: string
  publishedAt: string
  downloadUrl: string | null
  downloadSize: number
  artifactType: 'installer' | 'zip' | 'none'
  fileName: string | null
}

const updateArtifactLabel = (artifactType?: ProductionUpdateInfo['artifactType']): string => {
  if (artifactType === 'installer') return 'Bộ cài đặt'
  if (artifactType === 'zip') return 'Gói cập nhật'
  if (artifactType === 'none') return 'Không có tệp'
  return 'Mặc định'
}

type UpdateRuntimeStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'extracting'
  | 'installing'
  | 'restarting'
  | 'error'

const ProductionUpdateSettings = (): React.JSX.Element => {
  const [status, setStatus] = useState<UpdateRuntimeStatus>('idle')
  const [message, setMessage] = useState('Hệ thống sẽ tự động kiểm tra bản cập nhật khi khởi động.')
  const [updateInfo, setUpdateInfo] = useState<ProductionUpdateInfo | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [progress, setProgress] = useState(0)

  const fetchHistory = async () => {
    setLoadingHistory(true)
    const result = await (window.api as any).update.getHistory()
    if (result.success) {
      setHistory(result.data)
    }
    setLoadingHistory(false)
  }

  useEffect(() => {
    fetchHistory()

    // Lấy phiên bản hiện tại ngay khi mở màn hình.
    window.api.update.getCurrentVersion().then((res: any) => {
      if (res.success) {
        setUpdateInfo(prev => prev ? { ...prev, currentVersion: res.data } : { currentVersion: res.data } as any)
      }
    })

    const removeStatus = window.api.update.onStatus((event: any) => {
      setStatus(event.status)
      setMessage(event.message)
      if (event.data) setUpdateInfo(event.data)
    })
    const removeProgress = window.api.update.onProgress((event: any) => {
      setProgress(event.percent)
    })
    const removeAvailable = window.api.update.onAvailable((data: any) => {
      setUpdateInfo(data)
      setStatus('available')
      setMessage(`Có phiên bản mới v${data.latestVersion}.`)
    })

    return () => {
      removeStatus()
      removeProgress()
      removeAvailable()
    }
  }, [])

  const checkForUpdate = async () => {
    setStatus('checking')
    setMessage('Đang kiểm tra bản cập nhật mới...')
    setProgress(0)
    const result = await window.api.update.check()
    if (!result.success || !result.data) {
      setMessage(result.error || 'Không thể kiểm tra cập nhật.')
      setStatus('error')
      return
    }

    setUpdateInfo(result.data as ProductionUpdateInfo)
    setMessage(
      result.data.hasUpdate
        ? `Phát hiện phiên bản mới v${result.data.latestVersion}.`
        : 'Ứng dụng đang ở phiên bản mới nhất.'
    )
    setStatus(result.data.hasUpdate ? 'available' : 'idle')
    fetchHistory()
  }

  const applyUpdate = async () => {
    if (false) {
      setMessage('Bản phát hành không có tệp cập nhật phù hợp.')
      return
    }

    setStatus('downloading')
    setMessage(
      updateInfo?.artifactType === 'installer'
        ? 'Đang tải bộ cài đặt cập nhật...'
        : 'Đang tải và chuẩn bị áp dụng bản cập nhật...'
    )
    setProgress(0)
    const result = await window.api.update.installLatest()
    if (!result.success) {
      setMessage(result.error || 'Cập nhật thất bại.')
      setStatus('available')
      return
    }
    if (!updateInfo) return
    setMessage(
      updateInfo?.artifactType === 'installer'
        ? 'Bộ cài đã được mở. Ứng dụng sẽ thoát để hoàn tất cài đặt.'
        : `Đã chuẩn bị bản v${result.data?.version || updateInfo.latestVersion}. Ứng dụng sẽ khởi động lại.`
    )
  }

  const busy = ['checking', 'downloading', 'extracting', 'installing', 'restarting'].includes(status)

  return (
    <div className="flex h-full flex-col bg-slate-50/30 text-slate-700">
      {/* Breadcrumb Header */}
      <header className="bg-white h-14 border-b border-slate-100 px-6 md:px-12 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span>Hệ thống</span>
          <i className="fa-solid fa-chevron-right text-[8px]"></i>
          <span className="text-slate-900">Cập nhật phiên bản</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 font-medium">
            Lần kiểm tra cuối: Hôm nay, {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Main Update Card */}
          <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="p-8 md:p-10 flex flex-col md:flex-row items-center md:items-start gap-8">
              <div className={`p-6 rounded-[32px] shrink-0 transition-all duration-500 shadow-lg ${status === 'available'
                ? 'bg-amber-50 text-amber-500 shadow-amber-200/20'
                : 'bg-emerald-50 text-emerald-500 shadow-emerald-200/20'
                }`}>
                <i className={`fa-solid ${status === 'available' ? 'fa-rocket animate-pulse' : 'fa-circle-check'} text-5xl`}></i>
              </div>

              <div className="flex-1 text-center md:text-left w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {status === 'available' ? `Phát hiện phiên bản mới (v${updateInfo?.latestVersion})` : 'Hệ thống đã được cập nhật'}
                    </h2>
                    <div className="flex items-center justify-center md:justify-start gap-2 mt-2">
                      <span className="text-xs font-medium text-slate-500">Phiên bản hiện tại:</span>
                      <span className="font-mono font-semibold text-xs text-primary bg-emerald-50 px-2 py-0.5 rounded-md">
                        v{updateInfo?.currentVersion || (window as any).electronAPI?.appVersion || '...'}
                      </span>
                    </div>
                  </div>

                  {!busy && (
                    <button
                      onClick={checkForUpdate}
                      disabled={busy}
                      className="flex items-center justify-center gap-2.5 bg-white hover:bg-slate-50 text-primary border border-emerald-100 px-5 py-3 rounded-2xl font-bold text-xs transition-all shadow-sm hover:shadow-md"
                    >
                      <i className={`fa-solid fa-rotate-right ${status === 'checking' ? 'animate-spin' : ''}`}></i>
                      {status === 'checking' ? "Đang kiểm tra..." : "Kiểm tra cập nhật"}
                    </button>
                  )}
                </div>

                {status === 'available' && (
                  <div className="mt-8 p-6 bg-emerald-50/50 rounded-3xl border border-emerald-100 flex flex-col sm:flex-row items-center justify-between gap-6 transition-all animate-in fade-in slide-in-from-bottom-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-cloud-arrow-down text-emerald-500"></i>
                        <span className="text-sm font-bold text-slate-700">Sẵn sàng tải về ({updateInfo?.downloadSize ? (updateInfo.downloadSize / 1024 / 1024).toFixed(2) + ' MB' : '... MB'})</span>
                      </div>
                      <p className="text-xs font-medium text-slate-400">Mất khoảng 1-2 phút để hoàn tất quá trình này.</p>
                    </div>
                    <button
                      onClick={applyUpdate}
                      className="bg-primary hover:bg-primary-dark text-white px-8 py-3.5 rounded-[20px] font-bold text-xs flex items-center gap-2.5 shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <i className="fa-solid fa-bolt-lightning"></i> Cập nhật ngay
                    </button>
                  </div>
                )}

                {busy && status !== 'checking' && (
                  <div className="mt-8 space-y-4 animate-in fade-in">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-primary">{message}</span>
                        <div className="text-sm font-bold text-slate-800">
                          {status === 'downloading' ? 'Đang tải gói cập nhật...' : 'Đang xử lý...'}
                        </div>
                      </div>
                      <span className="text-xl font-bold text-primary">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Secondary Info Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Changelog Card */}
            <div className="lg:col-span-2 bg-white rounded-[24px] border border-slate-200 shadow-sm flex flex-col transition-all hover:shadow-md">
              <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2.5">
                  <i className="fa-solid fa-wand-magic-sparkles text-emerald-500/70"></i> Có gì mới trong bản v{updateInfo?.latestVersion || '...'}?
                </h3>
              </div>
              <div className="p-8 flex-1">
                {updateInfo?.releaseNotes ? (
                  <div className="prose prose-sm prose-slate max-w-none text-slate-600 font-medium leading-relaxed">
                    {updateInfo.releaseNotes.split('\n').map((line, i) => (
                      <p key={i} className="mb-2 last:mb-0 flex gap-3">
                        <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/40"></span>
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex gap-4 group">
                      <span className="shrink-0 mt-1 h-6 w-6 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center text-[10px] font-bold">MỚI</span>
                      <div className="space-y-1">
                        <p className="font-bold text-slate-800 text-sm">Tối ưu hiệu năng ứng dụng</p>
                        <p className="text-slate-400 text-xs font-medium">Giảm 20% dung lượng bộ nhớ khi xử lý hóa đơn quy mô lớn.</p>
                      </div>
                    </div>
                    <div className="flex gap-4 group">
                      <span className="shrink-0 mt-1 h-6 w-6 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-[10px] font-bold">SỬA</span>
                      <div className="space-y-1">
                        <p className="font-bold text-slate-800 text-sm">Cải thiện độ ổn định</p>
                        <p className="text-slate-400 text-xs font-medium">Khắc phục một số lỗi nhỏ trong quá trình in hợp đồng.</p>
                      </div>
                    </div>
                  </div>
                )}
                <button className="text-primary text-xs font-semibold hover:opacity-70 flex items-center gap-1.5 mt-8 transition-opacity">
                  Xem chi tiết ghi chú phát hành <i className="fa-solid fa-external-link text-[8px]"></i>
                </button>
              </div>
            </div>

            {/* Sidebar Column */}
            <div className="space-y-8">
              {/* Settings Card */}
              <div className="bg-white rounded-[24px] border border-slate-200 p-6 shadow-sm transition-all hover:shadow-md">
                <h4 className="text-sm font-bold text-slate-700 mb-6">Cấu hình cập nhật</h4>
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Kênh cập nhật</span>
                    <span className="text-[10px] font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded-md">{updateArtifactLabel(updateInfo?.artifactType)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Tự động kiểm tra</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Backup Promo */}
              <div className="bg-primary rounded-[24px] p-6 text-white shadow-xl shadow-primary/20 relative overflow-hidden group">
                <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-all duration-700">
                  <i className="fa-solid fa-shield-halved text-[120px]"></i>
                </div>
                <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-shield-heart"></i> Bảo mật dữ liệu
                </h4>
                <p className="text-[11px] text-white/80 font-medium leading-relaxed mb-6">
                  Vui lòng đảm bảo bạn đã lưu trữ dữ liệu quan trọng trước khi nâng cấp hệ thống.
                </p>
                <button className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl font-bold text-xs transition-all">
                  Sao lưu ngay
                </button>
              </div>
            </div>
          </div>

          {/* Update History */}
          <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="p-6 md:p-8 border-b border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <h3 className="font-bold text-slate-900">Lịch sử phiên bản</h3>
              <div className="relative w-full sm:w-64">
                <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Tìm kiếm phiên bản..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-100 bg-slate-50 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-primary/30 transition-all"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-xs font-semibold text-slate-500">Phiên bản</th>
                    <th className="px-8 py-4 text-xs font-semibold text-slate-500">Ngày phát hành</th>
                    <th className="px-8 py-4 text-xs font-semibold text-slate-500">Trạng thái</th>
                    <th className="px-8 py-4 text-xs font-semibold text-slate-500 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-300">
                        <i className="fa-solid fa-spinner animate-spin"></i>
                      </td>
                    </tr>
                  ) : history.length > 0 ? (
                    history.map((rel: any, i) => (
                      <tr key={rel.tag_name} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-8 py-5">
                          <span className="font-mono font-semibold text-sm text-slate-800">{rel.tag_name}</span>
                          {i === 0 && <span className="ml-3 text-[9px] font-semibold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">Nền tảng</span>}
                        </td>
                        <td className="px-8 py-5 text-xs text-slate-500 font-bold flex items-center gap-2">
                          <i className="fa-regular fa-calendar text-[10px]"></i>
                          {new Date(rel.published_at).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </td>
                        <td className="px-8 py-5">
                          <span className={`text-[9px] px-2.5 py-1 rounded-full font-semibold ${i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {i === 0 ? 'Ổn định' : 'Lưu trữ'}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button className="text-primary text-xs font-semibold hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Chi tiết</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-20 text-center">
                        <p className="text-xs font-semibold text-slate-300">Không tìm thấy dữ liệu</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


const ZoneRowEditor = ({
  values,
  onChange,
  onCancel,
  onSave,
  saving
}: {
  values: Partial<ServiceZone>
  onChange: React.Dispatch<React.SetStateAction<Partial<ServiceZone>>>
  onCancel: () => void
  onSave: () => void
  saving: boolean
}): React.JSX.Element => (
  <tr className="bg-blue-50/30">
    {(['name', 'electric_price', 'water_price', 'internet_price', 'cleaning_price'] as const).map(
      (field) => (
        <td key={field} className="px-5 py-3">
          <input
            type={field === 'name' ? 'text' : 'number'}
            value={values[field] ?? ''}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                [field]: field === 'name' ? event.target.value : Number(event.target.value)
              }))
            }
            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </td>
      )
    )}
    <td className="px-5 py-3 text-center text-gray-400">-</td>
    <td className="px-5 py-3 text-right">
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </td>
  </tr>
)

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  className,
  type = 'text',
  inputRef
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
}): React.JSX.Element => (
  <div className={className}>
    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-gray-500">
      {label}
    </label>
    <input
      type={type}
      value={value}
      ref={inputRef}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
    />
  </div>
)

const InfoTile = ({ label, value }: { label: string; value: string }): React.JSX.Element => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className="mt-2 text-lg font-black text-slate-900">{value}</div>
  </div>
)

const formatNumber = (value: number): string => new Intl.NumberFormat('vi-VN').format(value)

export const ContractsSection = (): React.JSX.Element => {
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('active')

  const filteredContracts = useMemo(
    () => contracts.filter((contract: Contract) => statusFilter === 'all' || contract.status === statusFilter),
    [contracts, statusFilter]
  )

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Hợp đồng</h3>
          <p className="mt-1 text-sm text-gray-500">Tổng hợp hợp đồng theo trạng thái.</p>
        </div>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'active', label: 'Đang hiệu lực' },
            { id: 'expired', label: 'Hết hạn' },
            { id: 'terminated', label: 'Đã thanh lý' },
            { id: 'cancelled', label: 'Đã hủy' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setStatusFilter(item.id as 'all' | ContractStatus)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${statusFilter === item.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-4">Mã HĐ</th>
              <th className="px-5 py-4">Phòng</th>
              <th className="px-5 py-4">Khách thuê</th>
              <th className="px-5 py-4">Ngày vào</th>
              <th className="px-5 py-4 text-right">Giá thuê</th>
              <th className="px-5 py-4 text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredContracts.map((contract: Contract) => {
              const room = rooms.find((item) => item.id === contract.room_id)
              return (
                <tr key={contract.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4 text-xs font-mono text-gray-400">...{contract.id.slice(-6)}</td>
                  <td className="px-5 py-4 font-bold text-gray-800">{room?.name || contract.room_id}</td>
                  <td className="px-5 py-4">{contract.tenant_name}</td>
                  <td className="px-5 py-4">
                    {contract.move_in_date
                      ? new Date(contract.move_in_date).toLocaleDateString('vi-VN')
                      : '-'}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-primary">
                    {formatNumber(contract.base_rent)} d
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                      {contract.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
