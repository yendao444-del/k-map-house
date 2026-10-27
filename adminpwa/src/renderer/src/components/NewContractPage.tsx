import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, FileText, Mail, Save, UserRound, Zap, Droplets, LoaderCircle, AlertCircle, Clock3 } from 'lucide-react'
import { getAppSettings, getContracts, getRoomAssets, getTenants, type Invoice, type Room, type ServiceZone } from '../lib/db'
import { buildContractDraftSnapshot, contractExpiration, contractReadingError, formatContractMoney, hasValidContractEmail, localContractDate, previewContract, validateContractDraft, validateContractReadings, type ContractDraft, type ContractDraftForm } from '../lib/contract-draft'
import { getContractDraftForRoom, saveContractDraft } from '../lib/contract-drafts'
import { ContractPrintTemplate } from './ContractPrintTemplate'
import { ContractLeaveDialog } from './ContractLeaveDialog'
import { ContractEmailResultDialog } from './ContractEmailResultDialog'
import { saveAndDeliverContractEmail, type ContractEmailResult } from '../lib/contract-email-delivery'
import { getContractConfirmationAvailability, getContractConfirmationStatus, getContractConfirmationHistory, getContractHistory, createContractConfirmation, contractEmailHtml, markContractConfirmationDelivery } from '../lib/contract-confirmation'
import { ContractConfirmationHistory } from './ContractConfirmationHistory'
import { contractChanges } from '../../../shared/contract-changes'
import { useTenantEmailCheck } from '../lib/use-tenant-email-check'
import { assertTenantEmail } from '../lib/tenant-email'

type Props = {
  room: Room
  zone?: ServiceZone
  lastInvoice?: Invoice
  initialTenantId?: string
  initialMoveInDate?: string
  initialDraft?: ContractDraft
  onClose: () => void
  onNavigateToTenants: () => void
  onNavigateToAssets: () => void
  onDirtyChange?: (dirty: boolean) => void
}

const inputClass = 'w-full rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2.5 text-sm text-[var(--brand-ink)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-[var(--brand-canvas)]'
const labelClass = 'mb-1.5 block text-xs font-semibold text-[var(--brand-ink)]'

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  return <div><label className={labelClass} htmlFor={id}>{label}</label><div className="relative"><input id={id} inputMode="numeric" value={formatContractMoney(value)} onChange={event => onChange(Number(event.target.value.replace(/\D/g, '')))} className={`${inputClass} pr-10 font-semibold tabular-nums`} /><span className="absolute right-3 top-3 text-[10px] text-[var(--brand-muted)]">VNĐ</span></div></div>
}

export default function NewContractPage(props: Props) {
  const existingDraft = useQuery({ queryKey: ['contractDrafts', props.room.id], queryFn: () => getContractDraftForRoom(props.room.id), enabled: !props.initialDraft })
  if (!props.initialDraft && existingDraft.isPending) return <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--brand-muted)]"><LoaderCircle className="animate-spin" size={18} />Đang mở trang lập hợp đồng…</div>
  if (!props.initialDraft && existingDraft.isError) return <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6"><p role="alert" className="text-sm text-rose-700">Không tải được bản nháp hợp đồng. {existingDraft.error.message}</p><button type="button" onClick={() => existingDraft.refetch()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Thử lại</button><button type="button" onClick={props.onClose} className="text-sm text-[var(--brand-muted)]">Quay lại</button></div>
  const draft = props.initialDraft || existingDraft.data || undefined
  // Keep the editor mounted when its first save adds an ID during email delivery.
  return <ContractEditor key={props.initialDraft?.id || props.room.id} {...props} initialDraft={draft} />
}

function ContractEditor({ room, zone, lastInvoice, initialTenantId, initialMoveInDate, initialDraft, onClose, onNavigateToTenants, onNavigateToAssets, onDirtyChange }: Props) {
  const queryClient = useQueryClient()
  const tenantsQuery = useQuery({ queryKey: ['tenants'], queryFn: getTenants })
  const contractsQuery = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const settingsQuery = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings })
  const assetsQuery = useQuery({ queryKey: ['room_assets', room.id], queryFn: () => getRoomAssets(room.id) })
  const [selectedTenantId, setSelectedTenantId] = useState(initialDraft?.tenant_id || initialTenantId || '')
  const [tenantSearch, setTenantSearch] = useState('')
  const [savedDraft, setSavedDraft] = useState(initialDraft)
  const isAmendment = Boolean(initialDraft?.parent_contract_id)
  const [amendmentReason, setAmendmentReason] = useState(initialDraft?.snapshot.amendment?.reason || '')
  const [dirty, setDirty] = useState(!initialDraft)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const sendInFlightRef = useRef(false)
  const [emailResult, setEmailResult] = useState<ContractEmailResult | null>(null)
  const [showEmailResult, setShowEmailResult] = useState(false)
  const backendQuery = useQuery({ queryKey: ['contract-confirmation-availability'], queryFn: getContractConfirmationAvailability, retry: false })
  const gmailQuery = useQuery({ queryKey: ['contract-gmail-availability'], queryFn: () => window.api.gmail.getAvailability(), retry: false })
  const confirmationQuery = useQuery({ queryKey: ['contract-confirmation-status', savedDraft?.id], queryFn: () => getContractConfirmationStatus(savedDraft!.id), enabled: Boolean(savedDraft && backendQuery.data?.ready), refetchInterval: 5000, retry: false })
  const [connectingGmail, setConnectingGmail] = useState(false)
  const latestConfirmation = confirmationQuery.data
  const [showHistory, setShowHistory] = useState(false)
  const historyQuery = useQuery({ queryKey: ['contract-confirmation-history', savedDraft?.id], queryFn: () => isAmendment ? getContractHistory(initialDraft!.parent_contract_id!) : getContractConfirmationHistory(savedDraft!.id), enabled: Boolean(showHistory && savedDraft && backendQuery.data?.ready), refetchInterval: showHistory ? 5000 : false, retry: false })
  const confirmationLabel = latestConfirmation?.status === 'confirmed' ? 'Khách đã xác nhận' : latestConfirmation?.status === 'viewed' ? 'Khách đã mở link' : latestConfirmation?.status === 'sent' ? 'Đã gửi Gmail · Chờ khách xác nhận' : latestConfirmation?.status === 'prepared' ? 'Đang gửi hoặc cần kiểm tra hộp thư' : latestConfirmation?.status === 'expired' ? 'Link đã hết hạn' : latestConfirmation?.status === 'failed' ? 'Chưa gửi được Gmail · Có thể thử lại sau khi xử lý lỗi' : ''
  const [exitRequested, setExitRequested] = useState(false)
  const exitActionRef = useRef(onClose)
  const [createdAt] = useState(initialDraft?.created_at || new Date().toISOString())
  const detailsRef = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const hasHistory = Boolean(lastInvoice)
  const initialElectric = isAmendment ? Number(initialDraft?.snapshot.form.electricInitial) : lastInvoice?.electric_new ?? room.electric_new ?? room.electric_old ?? 0
  const initialWater = isAmendment ? Number(initialDraft?.snapshot.form.waterInitial) : lastInvoice?.water_new ?? room.water_new ?? room.water_old ?? 0
  const [allowReadingEdit, setAllowReadingEdit] = useState(false)
  const [form, setForm] = useState<ContractDraftForm>(initialDraft?.snapshot.form || {
    baseRent: room.base_rent, depositAmount: room.default_deposit ?? room.base_rent,
    moveInDate: initialMoveInDate || localContractDate(), durationMonths: 12,
    invoiceDay: room.invoice_day || 5, occupantCount: 1,
    electricInitial: hasHistory ? initialElectric : '', waterInitial: hasHistory ? initialWater : '',
    readingEditReason: '', additionalTerms: ''
  })
  const activeTenantIds = new Set((contractsQuery.data || []).filter(contract => contract.status === 'active').map(contract => contract.tenant_id))
  const availableTenants = (tenantsQuery.data || []).filter(tenant => tenant.is_active && (!activeTenantIds.has(tenant.id) || (isAmendment || latestConfirmation?.status === 'confirmed') && tenant.id === selectedTenantId))
  const currentTenant = availableTenants.find(tenant => tenant.id === selectedTenantId) || null
  const selectedTenant = currentTenant && isAmendment ? { ...currentTenant, ...initialDraft!.snapshot.tenant } : currentTenant
  const tenantEmailValid = hasValidContractEmail(selectedTenant?.email)
  const emailCheck = useTenantEmailCheck(selectedTenant?.email)
  const selectableTenants = availableTenants.filter(tenant => hasValidContractEmail(tenant.email))
  const search = tenantSearch.trim().toLocaleLowerCase('vi-VN')
  const suggestions = selectableTenants.filter(tenant => `${tenant.full_name} ${tenant.phone || ''} ${tenant.identity_card || ''}`.toLocaleLowerCase('vi-VN').includes(search))
  const snapshot = useMemo(() => selectedTenant ? isAmendment ? { ...initialDraft!.before_snapshot!, form, amendment: { contractId: initialDraft!.parent_contract_id!, previousForm: initialDraft!.before_snapshot!.form, reason: amendmentReason.trim() } } : buildContractDraftSnapshot(room, selectedTenant, settingsQuery.data || {}, form, zone, assetsQuery.data || []) : null, [room, selectedTenant, settingsQuery.data, form, zone, assetsQuery.data, isAmendment, initialDraft, amendmentReason])
  const changes = isAmendment && initialDraft?.before_snapshot ? contractChanges(initialDraft.before_snapshot.form, form) : []
  const expirationDate = contractExpiration(form.moveInDate, form.durationMonths)
  const loading = [tenantsQuery, contractsQuery, settingsQuery, assetsQuery].some(query => query.isPending)
  const dataError = [tenantsQuery, contractsQuery, settingsQuery, assetsQuery].find(query => query.isError)?.error
  const electricError = contractReadingError(form.electricInitial, 'điện')
  const waterError = contractReadingError(form.waterInitial, 'nước')
  const submissionError = validateContractDraft(form, selectedTenant) || emailCheck.error || validateContractReadings(form)
    || (isAmendment && (amendmentReason.trim().length < 5 || amendmentReason.length > 1000) ? 'Nhập lý do sửa từ 5 đến 1000 ký tự.' : null)
    || (!isAmendment && hasHistory && (form.electricInitial !== initialElectric || form.waterInitial !== initialWater) && !form.readingEditReason.trim() ? 'Ghi lý do điều chỉnh chỉ số đầu kỳ.' : null)
  const availabilityError = backendQuery.isError ? 'Không kiểm tra được dịch vụ xác nhận. Hãy thử lại.'
    : !backendQuery.isPending && !backendQuery.data?.ready ? backendQuery.data?.reason || 'Chưa kết nối được dịch vụ xác nhận hợp đồng.'
    : gmailQuery.isError ? 'Không kiểm tra được kết nối Gmail. Hãy thử lại.'
    : !gmailQuery.isPending && (!gmailQuery.data?.available || !gmailQuery.data?.authenticated) ? gmailQuery.data?.reason || (gmailQuery.data?.available ? 'Kết nối Gmail để gửi xác nhận.' : 'Thiết lập Gmail trước khi gửi xác nhận.') : ''
  const sendDisabledReason = latestConfirmation?.status === 'confirmed' ? 'Khách đã xác nhận hợp đồng.'
    : loading || backendQuery.isPending || gmailQuery.isPending || savedDraft && confirmationQuery.isPending ? 'Đang kiểm tra thông tin hợp đồng và kết nối Gmail.'
    : dataError ? 'Không tải đủ dữ liệu. Hãy mở lại hợp đồng.'
    : emailCheck.checking ? 'Đang kiểm tra email người thuê.' : submissionError || availabilityError || (savedDraft && confirmationQuery.isError ? 'Chưa kiểm tra được trạng thái gửi. Hãy thử lại.'
    : !dirty && savedDraft && latestConfirmation?.revision === savedDraft.revision && !['failed', 'expired', 'revoked'].includes(latestConfirmation.status) ? 'Hợp đồng đã gửi hoặc đang xử lý; kiểm tra trạng thái trước khi gửi lại.' : null)
  useEffect(() => { onDirtyChange?.(dirty && Boolean(selectedTenantId)) }, [dirty, selectedTenantId, onDirtyChange])
  useEffect(() => {
    if (latestConfirmation?.status !== 'confirmed') return
    for (const key of ['contracts', 'rooms', 'tenants', 'tenantWebAccounts', 'tenant-web-accounts', 'contractDrafts']) void queryClient.invalidateQueries({ queryKey: [key] })
  }, [latestConfirmation?.status, queryClient])

  function change<K extends keyof ContractDraftForm>(field: K, value: ContractDraftForm[K]) {
    setForm(previous => ({ ...previous, [field]: value }))
    setDirty(true); setError(''); setNotice(''); setEmailResult(null); setExitRequested(false)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (loading || dataError) throw new Error('Chờ tải đầy đủ dữ liệu phòng, khách thuê và hợp đồng trước khi lưu.')
      const validation = validateContractDraft(form, selectedTenant)
      if (validation) throw new Error(validation)
      await assertTenantEmail(selectedTenant?.email)
      if (!snapshot) throw new Error('Chọn khách thuê trước khi lưu bản nháp.')
      if (isAmendment && (amendmentReason.trim().length < 5 || amendmentReason.length > 1000)) throw new Error('Nhập lý do sửa từ 5 đến 1000 ký tự.')
      if (!isAmendment && hasHistory && (form.electricInitial !== initialElectric || form.waterInitial !== initialWater) && !form.readingEditReason.trim()) throw new Error('Ghi lý do điều chỉnh chỉ số đầu kỳ.')
      return saveContractDraft(snapshot, savedDraft)
    },
    onSuccess: draft => {
      setSavedDraft(draft); setDirty(false); setError(''); setEmailResult(null); setNotice(sendInFlightRef.current ? '' : isAmendment ? 'Đã lưu bản sửa · Chưa gửi xác nhận' : 'Đã lưu bản nháp · Chưa gửi cho khách thuê'); setExitRequested(false)
      void queryClient.invalidateQueries({ queryKey: ['contractDrafts'] })
    },
    onError: failure => { setError(sendInFlightRef.current ? '' : failure instanceof Error ? failure.message : 'Không lưu được bản nháp.'); setNotice('') }
  })

  const locked = saveMutation.isPending || sendingEmail || connectingGmail
  async function connectGmail() {
    setConnectingGmail(true); setError('')
    try { const result = await window.api.gmail.reauthenticate(); if (!result.ok) throw new Error(result.error || 'Chưa xác thực được Gmail.'); await gmailQuery.refetch() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa xác thực được Gmail.') }
    finally { setConnectingGmail(false) }
  }
  async function copyGmailLoginLink() {
    try {
      await navigator.clipboard.writeText('http://127.0.0.1:3456/authorize')
      setNotice('Đã sao chép link. Dán vào hồ sơ Chrome có Gmail phòng trọ, rồi chọn đúng tài khoản gửi.')
    } catch { setNotice('Mở http://127.0.0.1:3456/authorize trong trình duyệt có Gmail phòng trọ.') }
  }
  async function sendConfirmation() {
    if (sendInFlightRef.current || locked || sendDisabledReason || !selectedTenant) return
    sendInFlightRef.current = true
    setSendingEmail(true); setError(''); setNotice(''); setEmailResult(null); setShowEmailResult(false)
    try {
      const gmail = await window.api.gmail.getAvailability()
      queryClient.setQueryData(['contract-gmail-availability'], gmail)
      if (!gmail.available || !gmail.authenticated) throw new Error(gmail.reason || 'Xác thực Gmail trước khi gửi hợp đồng.')
      let payload: { to: string; subject: string; html: string }
      const result = await saveAndDeliverContractEmail({
        save: () => dirty || !savedDraft ? saveMutation.mutateAsync() : Promise.resolve(savedDraft),
        prepare: async draft => {
          const readingsError = validateContractReadings(draft.snapshot.form)
          if (readingsError) throw new Error(readingsError)
          const confirmation = await createContractConfirmation(draft)
          payload = { to: confirmation.email!, subject: `AN KHANG HOME · Xác nhận ${isAmendment ? 'bản sửa ' : ''}hợp đồng phòng ${confirmation.room || room.name}`, html: contractEmailHtml({ tenantName: confirmation.tenantName || draft.snapshot.tenant.full_name, room: confirmation.room || room.name, url: confirmation.url!, moveInDate: draft.snapshot.form.moveInDate, amendment: isAmendment }) }
          return { email: confirmation.email!, id: confirmation.confirmation!.id }
        },
        send: () => window.api.gmail.sendNotification(payload),
        mark: (draft, confirmation, messageId, failed) => markContractConfirmationDelivery(draft.id, confirmation.id, messageId, failed)
      })
      setEmailResult(result); setShowEmailResult(true)
    } catch (cause) {
      setEmailResult({ outcome: 'failed', title: 'Chưa gửi được Gmail', message: cause instanceof Error ? cause.message : 'Chưa gửi được Gmail.' }); setShowEmailResult(true)
    }
    finally {
      sendInFlightRef.current = false; setSendingEmail(false)
      void queryClient.invalidateQueries({ queryKey: ['contract-confirmation-status'] })
      void queryClient.invalidateQueries({ queryKey: ['contract-confirmation-history'] })
    }
  }
  const requestLeave = (action: () => void) => {
    if (saveMutation.isPending || sendingEmail || connectingGmail) return
    exitActionRef.current = action
    if (dirty && selectedTenantId) { setExitRequested(true); return }
    action()
  }
  const deliveryFeedback: ContractEmailResult | null = emailResult || (!dirty && latestConfirmation?.revision === savedDraft?.revision && latestConfirmation?.status === 'sent' ? {
    outcome: 'success', title: 'Đã gửi Gmail thành công',
    message: `Đã gửi link xác nhận tới ${selectedTenant?.email || 'email người thuê'}. ${isAmendment ? 'Bản hiện tại vẫn có hiệu lực đến khi khách xác nhận bản sửa.' : 'Đang chờ khách xác nhận; hợp đồng chưa được kích hoạt.'}`
  } : null)

  return <div className="flex min-h-0 flex-1 flex-col bg-[var(--brand-canvas)] text-[var(--brand-ink)]" aria-labelledby="new-contract-title">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--brand-border)] bg-white px-6 py-4">
      <div className="flex items-center gap-3"><button type="button" aria-label="Quay lại danh sách hợp đồng" onClick={() => requestLeave(onClose)} disabled={locked} className="rounded-lg border border-[var(--brand-border)] p-2.5 text-[var(--brand-muted)] hover:bg-[var(--brand-mint)]"><ArrowLeft size={19} /></button><div><h1 id="new-contract-title" className="text-xl font-bold text-[var(--brand-shell)]">{isAmendment ? 'Sửa hợp đồng' : 'Lập hợp đồng'} · {room.name}</h1><p className="mt-1 text-xs text-[var(--brand-muted)]">{zone?.name || 'Chưa gán khu dịch vụ'} · Hồ sơ khách → Nội dung hợp đồng → Xác nhận qua Gmail</p></div></div>
      <div className="flex items-center gap-2"><button type="button" aria-label="Xem lịch sử xác nhận hợp đồng" title="Lịch sử xác nhận" onClick={() => setShowHistory(true)} disabled={!savedDraft || !backendQuery.data?.ready} className="flex items-center gap-2 rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--brand-shell)] hover:bg-[var(--brand-mint)] disabled:opacity-40"><Clock3 size={16} className="text-primary" />Lịch sử</button><span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-mint)] px-3 py-1.5 text-xs font-semibold text-primary">{confirmationLabel || 'Bản nháp · Chưa gửi'}</span></div>
    </header>
    <nav aria-label="Các bước lập hợp đồng" className="flex shrink-0 flex-wrap gap-5 border-b border-[var(--brand-border)] bg-white px-6 py-3 text-sm">
      {[{ label: 'Thông tin thuê', ref: detailsRef }, { label: 'Xem hợp đồng', ref: previewRef }, { label: 'Gmail xác nhận', ref: emailRef }].map((step, index) => <button key={step.label} type="button" onClick={() => step.ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex items-center gap-2 font-medium text-[var(--brand-shell)]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-mint)] text-xs font-bold text-primary">{index + 1}</span>{step.label}</button>)}
    </nav>
    <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:grid lg:grid-cols-[minmax(350px,410px)_minmax(0,1fr)] lg:gap-5 lg:overflow-hidden">
      <div ref={detailsRef} className="space-y-4 lg:overflow-y-auto lg:pr-1">
        {loading && <p role="status" className="flex items-center gap-2 text-sm text-[var(--brand-muted)]"><LoaderCircle className="animate-spin" size={16} />Đang tải thông tin…</p>}
        {dataError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Không tải đủ dữ liệu. Hãy quay lại và thử mở hợp đồng lần nữa.</p>}
        {isAmendment && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><h2 className="font-bold">Bản sửa chờ khách xác nhận</h2><p className="mt-2 text-xs leading-5">Bản hiện tại vẫn có hiệu lực. Chỉ áp dụng thay đổi sau khi khách xác nhận qua email; không đổi khách hoặc phòng.</p><label className={`${labelClass} mt-3`} htmlFor="amendment-reason">Lý do sửa *</label><textarea id="amendment-reason" rows={2} maxLength={1000} disabled={locked || latestConfirmation?.status === 'confirmed'} className={inputClass} value={amendmentReason} onChange={event => { setAmendmentReason(event.target.value); setDirty(true) }} />{changes.length > 0 && <dl className="mt-3 space-y-2">{changes.map(item => <div key={item.label} className="rounded-lg bg-white p-2 text-xs"><dt className="font-semibold">{item.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words"><span className="text-[var(--brand-muted)]">{item.before}</span> → <strong className="text-primary">{item.after}</strong></dd></div>)}</dl>}</section>}
        <fieldset disabled={locked || latestConfirmation?.status === 'confirmed'} className="space-y-4">
          <section className="rounded-xl border border-[var(--brand-border)] bg-white p-4">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--brand-shell)]"><UserRound size={17} className="text-primary" />Khách thuê</h2>
            <label className={labelClass} htmlFor="contract-tenant-search">Tìm hồ sơ khách thuê</label><input id="contract-tenant-search" disabled={isAmendment} className={inputClass} value={tenantSearch} placeholder="Tên, điện thoại hoặc CCCD" onChange={event => setTenantSearch(event.target.value)} />
            <label className={`${labelClass} mt-3`} htmlFor="contract-tenant">Đại diện thuê phòng <span className="text-rose-500">*</span></label>
            <select id="contract-tenant" disabled={isAmendment} aria-describedby="contract-tenant-email-help" className={inputClass} value={selectableTenants.some(tenant => tenant.id === selectedTenantId) ? selectedTenantId : ''} onChange={event => { const tenant = selectableTenants.find(item => item.id === event.target.value); if (event.target.value && !tenant) return; setSelectedTenantId(event.target.value); setDirty(true); setError(''); setNotice(''); setEmailResult(null) }}><option value="">Chọn khách có email hợp lệ</option>{selectableTenants.filter(tenant => tenant.id === selectedTenantId || suggestions.some(item => item.id === tenant.id)).map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.full_name}{tenant.phone ? ` · ${tenant.phone}` : ''}</option>)}</select>
            <p id="contract-tenant-email-help" role="status" className={`mt-2 text-xs leading-5 ${emailCheck.error || selectedTenant && !tenantEmailValid ? "text-rose-700" : "text-[var(--brand-muted)]"}`}>{emailCheck.error || (emailCheck.checking ? "Đang kiểm tra email người thuê…" : "Bắt buộc có email riêng của người thuê, không trùng tài khoản hệ thống, để nhận và xác nhận hợp đồng.")}</p>
            {selectedTenant ? <><dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-xs"><div><dt className="text-[var(--brand-muted)]">Số điện thoại</dt><dd className="mt-1 font-semibold">{selectedTenant.phone || 'Chưa bổ sung'}</dd></div><div><dt className="text-[var(--brand-muted)]">CCCD / CMND</dt><dd className="mt-1 font-semibold">{selectedTenant.identity_card || 'Chưa bổ sung'}</dd></div><div className="col-span-2"><dt className="text-[var(--brand-muted)]">Email người thuê</dt><dd className="mt-1 break-all font-semibold">{selectedTenant.email || 'Chưa bổ sung email'}</dd></div><div className="col-span-2"><dt className="text-[var(--brand-muted)]">Địa chỉ trên giấy tờ</dt><dd className="mt-1 leading-5">{selectedTenant.address || 'Chưa bổ sung'}</dd></div></dl><p className="mt-3 flex items-center gap-1.5 text-[11px] text-primary"><CheckCircle2 size={13} />Thông tin lấy từ hồ sơ khách thuê</p></> : <p className="mt-3 text-xs leading-5 text-[var(--brand-muted)]">Chọn khách để tự điền thông tin vào hợp đồng.</p>}
            <button type="button" onClick={() => requestLeave(onNavigateToTenants)} className="mt-3 text-xs font-semibold text-primary hover:underline">Mở danh sách khách thuê</button>
          </section>
          <section className="rounded-xl border border-[var(--brand-border)] bg-white p-4"><h2 className="mb-4 text-sm font-bold text-[var(--brand-shell)]">Điều kiện thuê</h2><div className="grid grid-cols-2 gap-3">
            <MoneyField id="contract-rent" label="Giá thuê / tháng *" value={form.baseRent} onChange={value => change('baseRent', value)} /><MoneyField id="contract-deposit" label="Tiền đặt cọc" value={form.depositAmount} onChange={value => change('depositAmount', value)} />
            <div><label className={labelClass} htmlFor="contract-start">Ngày bắt đầu *</label><input id="contract-start" type="date" className={inputClass} value={form.moveInDate} onChange={event => change('moveInDate', event.target.value)} /></div>
            <div><label className={labelClass} htmlFor="contract-duration">Thời hạn</label><select id="contract-duration" className={inputClass} value={form.durationMonths} onChange={event => change('durationMonths', Number(event.target.value))}>{[0, 1, 3, 6, 12, 24, 36].map(months => <option key={months} value={months}>{months ? `${months} tháng` : 'Không xác định'}</option>)}</select></div>
            <div><label className={labelClass} htmlFor="contract-invoice-day">Ngày chốt hóa đơn</label><select id="contract-invoice-day" className={inputClass} value={form.invoiceDay} onChange={event => change('invoiceDay', Number(event.target.value))}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>Ngày {i + 1}</option>)}</select></div>
            <div><label className={labelClass} htmlFor="contract-occupants">Số người ở</label><input id="contract-occupants" type="number" min="1" max={room.max_occupants || 20} className={inputClass} value={form.occupantCount} onChange={event => change('occupantCount', Number(event.target.value))} /></div>
          </div><p className="mt-3 text-xs text-[var(--brand-muted)]">{expirationDate ? `Ngày hết hạn: ${expirationDate.split('-').reverse().join('/')}` : 'Hợp đồng chưa xác định ngày hết hạn.'}</p></section>
          <section className="rounded-xl border border-[var(--brand-border)] bg-white p-4"><h2 className="mb-4 text-sm font-bold text-[var(--brand-shell)]">Điện, nước và tài sản bàn giao</h2><div className="grid grid-cols-2 gap-3">
            <div><label className={`${labelClass} flex items-center gap-1.5`} htmlFor="contract-electric"><Zap size={13} />Chỉ số điện đầu kỳ <span className="text-rose-500">*</span></label><input id="contract-electric" type="number" min="0" step="1" readOnly={isAmendment || hasHistory && !allowReadingEdit} aria-required="true" aria-invalid={Boolean(electricError)} aria-describedby={electricError ? "contract-electric-error" : undefined} className={`${inputClass} ${electricError ? "border-amber-400" : ""}`} value={form.electricInitial} placeholder="Nhập chỉ số" onChange={event => change('electricInitial', event.target.value === '' ? '' : Number(event.target.value))} />{electricError && <p id="contract-electric-error" className="mt-1.5 text-xs leading-5 text-amber-800">{electricError}</p>}</div>
            <div><label className={`${labelClass} flex items-center gap-1.5`} htmlFor="contract-water"><Droplets size={13} />Chỉ số nước đầu kỳ <span className="text-rose-500">*</span></label><input id="contract-water" type="number" min="0" step="1" readOnly={isAmendment || hasHistory && !allowReadingEdit} aria-required="true" aria-invalid={Boolean(waterError)} aria-describedby={waterError ? "contract-water-error" : undefined} className={`${inputClass} ${waterError ? "border-amber-400" : ""}`} value={form.waterInitial} placeholder="Nhập chỉ số" onChange={event => change('waterInitial', event.target.value === '' ? '' : Number(event.target.value))} />{waterError && <p id="contract-water-error" className="mt-1.5 text-xs leading-5 text-amber-800">{waterError}</p>}</div>
          </div>{isAmendment && <p className="mt-3 text-xs text-[var(--brand-muted)]">Giữ nguyên chỉ số bàn giao. Bản sửa không thay đổi chỉ số hiện tại hoặc hóa đơn đã lập.</p>}{!isAmendment && hasHistory && <><p className="mt-3 text-[11px] leading-5 text-[var(--brand-muted)]">Chỉ số kế thừa từ lần chốt gần nhất. Nếu điều chỉnh, ghi rõ lý do.</p><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={allowReadingEdit} onChange={event => setAllowReadingEdit(event.target.checked)} />Cho phép điều chỉnh chỉ số</label>{allowReadingEdit && <input aria-label="Lý do điều chỉnh chỉ số" className={`${inputClass} mt-2`} value={form.readingEditReason} onChange={event => change('readingEditReason', event.target.value)} placeholder="Lý do điều chỉnh" />}</>}
            <p className="mt-3 text-xs leading-5 text-[var(--brand-muted)]">{snapshot ? `Điện ${formatContractMoney(snapshot.services.electricPrice)} đ/kWh · Nước ${formatContractMoney(snapshot.services.waterPrice)} đ/m³` : zone ? `Điện ${formatContractMoney(zone.electric_price)} đ/kWh · Nước ${formatContractMoney(zone.water_price)} đ/m³` : 'Chưa gán biểu phí dịch vụ cho phòng.'}</p>
            <div className="mt-3 border-t border-[var(--brand-border)] pt-3"><p className="text-xs text-[var(--brand-muted)]">{assetsQuery.data?.length ? `${assetsQuery.data.length} loại tài sản sẽ đi kèm bản hợp đồng.` : 'Phòng chưa có danh sách tài sản bàn giao.'}</p><button type="button" onClick={() => requestLeave(onNavigateToAssets)} className="mt-2 text-xs font-semibold text-primary hover:underline">Xem / thiết lập tài sản</button></div>
          </section>
          <section className="rounded-xl border border-[var(--brand-border)] bg-white p-4"><label className="mb-3 block text-sm font-bold text-[var(--brand-shell)]" htmlFor="contract-terms">Điều khoản bổ sung</label><textarea id="contract-terms" rows={3} className={inputClass} value={form.additionalTerms} onChange={event => change('additionalTerms', event.target.value)} placeholder="Thỏa thuận bổ sung sẽ hiển thị trong hợp đồng…" /></section>
        <section ref={emailRef} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-mint)] p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--brand-shell)]"><Mail size={17} className="text-primary" />Xác nhận qua Gmail của khách</h2>
          <p className="mt-3 text-xs text-[var(--brand-muted)]">Người nhận</p><p className="mt-1 break-all text-sm font-semibold">{selectedTenant?.email || 'Chưa có email trong hồ sơ khách thuê'}</p>
          <p className="mt-3 text-xs leading-5 text-[var(--brand-ink)]">Khách sẽ mở link để xem toàn bộ hợp đồng, kiểm tra thông tin và xác nhận.</p>
          {gmailQuery.data?.senderEmail && <p className="mt-3 break-all text-xs leading-5 text-[var(--brand-muted)]">Gửi từ: <strong>{gmailQuery.data.senderEmail}</strong></p>}
          {(backendQuery.isPending || gmailQuery.isPending) && <p role="status" className="mt-3 text-xs text-[var(--brand-muted)]">Đang kiểm tra kết nối…</p>}
          {availabilityError && <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <p>{availabilityError}</p>
            {backendQuery.data?.ready && gmailQuery.data?.available && !gmailQuery.data?.authenticated ? <button type="button" className="mt-2 font-semibold text-primary underline" disabled={connectingGmail} onClick={() => void connectGmail()}>{connectingGmail ? 'Đang kết nối…' : 'Kết nối Gmail'}</button> : <button type="button" className="mt-2 font-semibold text-primary underline" disabled={locked} onClick={() => { void backendQuery.refetch(); void gmailQuery.refetch() }}>Kiểm tra lại</button>}
          </div>}
        </section>
        </fieldset>
      </div>
      <section ref={previewRef} aria-label="Bản xem trước hợp đồng" className="mt-5 flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white lg:mt-0">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--brand-border)] px-5 py-3.5"><h2 className="flex items-center gap-2 text-sm font-bold text-[var(--brand-shell)]"><FileText size={17} className="text-primary" />Xem trước hợp đồng</h2><span className="text-[11px] text-[var(--brand-muted)]">Cập nhật theo thông tin bên trái</span></div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#eef2ef] p-5">
          {snapshot ? <div className="mx-auto max-w-[794px] bg-white p-6 shadow-sm sm:p-10"><p className="mb-6 text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-muted)]">Bản dự thảo · Chưa có xác nhận của người thuê</p><ContractPrintTemplate contract={previewContract(snapshot, createdAt)} room={room} settings={snapshot.settings} compact /><div className="mt-8 border-t border-slate-300 pt-5 text-xs leading-6 text-black"><h3 className="mb-2 font-bold">PHỤ LỤC · THÔNG TIN PHÒNG VÀ BÀN GIAO</h3><p>Số người ở: {form.occupantCount} · Chỉ số điện: {form.electricInitial === '' ? 'Chưa nhập' : form.electricInitial} · Chỉ số nước: {form.waterInitial === '' ? 'Chưa nhập' : form.waterInitial}</p><p>Điện: {formatContractMoney(snapshot.services.electricPrice)} đ/kWh · Nước: {formatContractMoney(snapshot.services.waterPrice)} đ/m³</p><p>Internet: {formatContractMoney(snapshot.services.internetPrice)} đ/tháng · Vệ sinh: {formatContractMoney(snapshot.services.cleaningPrice)} đ/tháng</p>{snapshot.assets.length ? <ul className="mt-2 list-disc pl-4">{snapshot.assets.map(asset => <li key={asset.id}>{asset.name} · SL {asset.quantity}{asset.condition ? ` · ${asset.condition}` : ''}</li>)}</ul> : <p className="mt-2">Danh sách tài sản chưa được bổ sung.</p>}{form.additionalTerms.trim() && <><h3 className="mt-4 font-bold">ĐIỀU KHOẢN BỔ SUNG</h3><p className="whitespace-pre-wrap">{form.additionalTerms}</p></>}</div></div> : <div className="flex min-h-[380px] flex-col items-center justify-center rounded-lg bg-white p-8 text-center"><FileText size={40} className="text-emerald-200" /><h3 className="mt-4 text-base font-semibold text-[var(--brand-shell)]">Hợp đồng của phòng {room.name}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-[var(--brand-muted)]">Chọn hồ sơ khách thuê ở bên trái để xem đầy đủ nội dung hợp đồng.</p></div>}
        </div>
      </section>
    </div>
    <footer className="shrink-0 border-t border-[var(--brand-border)] bg-white px-6 py-3">
      {(sendingEmail || deliveryFeedback) && <div role={deliveryFeedback?.outcome === 'success' || sendingEmail ? 'status' : 'alert'} className={`mb-3 flex items-start gap-2.5 rounded-xl border p-3 ${sendingEmail || deliveryFeedback?.outcome === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : deliveryFeedback?.outcome === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        {sendingEmail ? <LoaderCircle size={18} className="mt-0.5 shrink-0 animate-spin" /> : deliveryFeedback?.outcome === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
        <div><p className="text-sm font-semibold">{sendingEmail ? saveMutation.isPending ? 'Đang lưu hợp đồng…' : 'Đang gửi Gmail xác nhận…' : deliveryFeedback?.title}</p><p className="mt-1 text-xs leading-5">{sendingEmail ? saveMutation.isPending ? 'Chờ lưu bản nháp thành công trước khi gửi xác nhận.' : `Đang xử lý thư gửi tới ${selectedTenant?.email}. Vui lòng chờ kết quả.` : deliveryFeedback?.message}</p></div>
      </div>}
      {submissionError && latestConfirmation?.status !== 'confirmed' && <p id="contract-submit-warning" role="status" className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertCircle size={16} className="shrink-0" /><span>Chưa thể gửi hợp đồng: {submissionError}</span></p>}
      {error && <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={16} />{error}</p>}
      {connectingGmail && <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900"><span>Chrome mở sai tài khoản? Dán link kết nối vào trình duyệt có Gmail bạn muốn dùng.</span><button type="button" onClick={() => void copyGmailLoginLink()} className="font-semibold underline">Sao chép link kết nối Gmail</button></div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className={`max-w-lg text-xs leading-5 ${!dirty && ['sent', 'viewed', 'confirmed'].includes(latestConfirmation?.status || '') ? 'font-semibold text-primary' : 'text-[var(--brand-muted)]'}`}>{notice || (!dirty && confirmationLabel) || (dirty ? savedDraft ? 'Có thay đổi chưa lưu · Chưa gửi bản mới' : 'Bản nháp chưa lưu · Chưa gửi' : 'Bản nháp đã lưu · Chưa gửi')}</p><div className="flex gap-2"><button type="button" onClick={() => saveMutation.mutate()} disabled={locked || latestConfirmation?.status === 'confirmed' || loading || Boolean(dataError) || !selectedTenant || !tenantEmailValid || emailCheck.blocked} className="flex items-center gap-2 rounded-lg border border-primary bg-white px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-40">{saveMutation.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}Lưu bản nháp</button><button type="button" onClick={() => void sendConfirmation()} disabled={locked || Boolean(sendDisabledReason)} title={sendDisabledReason || undefined} aria-describedby={submissionError ? "contract-submit-warning" : undefined} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{sendingEmail ? <LoaderCircle className="animate-spin" size={16} /> : <Mail size={16} />}{sendingEmail ? saveMutation.isPending ? 'Đang lưu…' : 'Đang gửi…' : 'Lưu và gửi xác nhận'}</button></div></div>
    </footer>
    {exitRequested && <ContractLeaveDialog onCancel={() => setExitRequested(false)} onLeave={() => { setExitRequested(false); exitActionRef.current() }} />}
    {showEmailResult && emailResult && <ContractEmailResultDialog result={emailResult} onClose={() => setShowEmailResult(false)} />}
    {showHistory && <ContractConfirmationHistory events={historyQuery.data || []} loading={historyQuery.isPending} error={historyQuery.error?.message} refreshing={historyQuery.isFetching} onRefresh={() => void historyQuery.refetch()} onClose={() => setShowHistory(false)} />}
  </div>
}
