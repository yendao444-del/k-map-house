import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContracts, getRooms, getAppSettings, updateContract, updateAppSettings, type Contract, type ContractStatus, type Room, type AppSettings } from '../lib/db'
import { ContractPrintTemplate } from './ContractPrintTemplate'
import { useReactToPrint } from 'react-to-print'
import { playClick, playSuccess } from '../lib/sound'

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
    case 'active':
      return 'Đang hiệu lực'
    case 'expired':
      return 'Đã hết hạn'
    case 'terminated':
      return 'Đã thanh lý'
    case 'cancelled':
      return 'Đã hủy'
    default:
      return status
  }
}

const getStatusClassName = (status: ContractStatus) => {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-700'
    case 'terminated':
      return 'bg-slate-100 text-slate-600'
    case 'cancelled':
      return 'bg-red-100 text-red-600'
    case 'expired':
      return 'bg-orange-100 text-orange-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

interface EditContractModalProps {
  contract: Contract
  onClose: () => void
}

const EditContractModal: React.FC<EditContractModalProps> = ({ contract, onClose }) => {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (updates: Partial<Contract>) => updateContract(contract.id, updates),
    onSuccess: () => {
      playSuccess()
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['activeContracts'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      onClose()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Lỗi cập nhật')
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    mutation.mutate({
      base_rent: parseInt((fd.get('base_rent') as string).replace(/\D/g, ''), 10) || 0,
      deposit_amount: parseInt((fd.get('deposit_amount') as string).replace(/\D/g, ''), 10) || 0,
      move_in_date: fd.get('move_in_date') as string,
      expiration_date: (fd.get('expiration_date') as string) || undefined,
      invoice_day: parseInt(fd.get('invoice_day') as string, 10) || 5,
    })
  }

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800">Sửa hợp đồng</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tiền thuê (tháng)</label>
              <input name="base_rent" defaultValue={formatVND(contract.base_rent)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tiền đặt cọc</label>
              <input name="deposit_amount" defaultValue={formatVND(contract.deposit_amount)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Ngày bắt đầu</label>
              <input name="move_in_date" type="date" defaultValue={contract.move_in_date} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Ngày hết hạn</label>
              <input name="expiration_date" type="date" defaultValue={contract.expiration_date} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Ngày chốt tiền hàng tháng</label>
            <input name="invoice_day" type="number" min="1" max="28" defaultValue={contract.invoice_day} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-100 text-sm font-bold text-gray-600">Hủy</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">Lưu thay đổi</button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface RoomSelectionModalProps {
  rooms: Room[]
  onSelect: (room: Room) => void
  onClose: () => void
}

const RoomSelectionModal: React.FC<RoomSelectionModalProps> = ({ rooms, onSelect, onClose }) => {
  const vacantRooms = rooms.filter(r => r.status === 'vacant')

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Chọn phòng để lập hợp đồng</h2>
            <p className="text-xs text-gray-500 mt-0.5">Chỉ hiển thị các phòng đang ở trạng thái Trống</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fa-solid fa-xmark text-lg"></i></button>
        </div>
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {vacantRooms.length === 0 ? (
            <div className="text-center py-10">
              <i className="fa-solid fa-house-circle-exclamation text-4xl text-gray-200 mb-3"></i>
              <p className="text-gray-500 text-sm italic">Hiện không có phòng nào đang trống để lập hợp đồng mới.</p>
              <p className="text-xs text-gray-400 mt-1">Vui lòng kiểm tra lại tình trạng phòng ở mục Quản lý phòng.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {vacantRooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => onSelect(room)}
                  className="p-4 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 transition-all text-center group"
                >
                  <div className="text-lg font-black text-gray-800 group-hover:text-primary mb-1">{room.name}</div>
                  <div className="text-[10px] uppercase font-bold text-gray-400 group-hover:text-primary/70">{formatVND(room.base_rent)} đ</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-white border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50">Đóng</button>
        </div>
      </div>
    </div>
  )
}

const ContractTemplateModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [settings, setSettings] = useState<AppSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  const DEFAULT_TEMPLATE = `
<h4 class="font-bold text-lg border-b pb-1 mb-4 text-gray-800 tracking-tight">ĐIỀU 1: THÔNG TIN PHÒNG CHO THUÊ</h4>
<p>1. Bên A đồng ý cho bên B thuê phòng số: <strong>{{room_name}}</strong></p>
<p>2. Giá thuê phòng là: <strong>{{base_rent}} VNĐ / tháng</strong></p>
<p>3. Số người ở tối đa: {{occupant_count}} người.</p>

<h4 class="font-bold text-lg border-b pb-1 mt-6 mb-4 text-gray-800 tracking-tight">ĐIỀU 2: THỜI HẠN VÀ PHƯƠNG THỨC THANH TOÁN</h4>
<p>1. Thời gian thuê tính từ ngày {{move_in_date}} {{expiration_date}}.</p>
<p>2. Tiền đặt cọc: <strong>{{deposit_amount}} VNĐ</strong>. Số tiền này sẽ được bên A hoàn trả cho bên B sau khi thanh lý hợp đồng và trừ đi các khoản chi phí phát sinh, hư hỏng tài sản (nếu có).</p>
<p>3. Thanh toán: Tiền thuê phòng được thanh toán vào ngày {{invoice_day}} hàng tháng.</p>
<p>4. Chỉ số ban đầu: Điện: {{electric_init}} kWh. Nước: {{water_init}} khối.</p>

<h4 class="font-bold text-lg border-b pb-1 mt-6 mb-4 text-gray-800 tracking-tight">ĐIỀU 3: TRÁCH NHIỆM CỦA CÁC BÊN</h4>
<p class="font-semibold italic mt-4 text-gray-700">Trách nhiệm của Bên A:</p>
<ul class="list-disc pl-5 space-y-1">
    <li>Đảm bảo quyền sử dụng trọn vẹn phòng trọ cho Bên B.</li>
    <li>Sửa chữa kịp thời các hư hỏng thuộc về kết cấu phòng trống.</li>
</ul>
<p class="font-semibold italic mt-4 text-gray-700">Trách nhiệm của Bên B:</p>
<ul class="list-disc pl-5 space-y-1">
    <li>Thanh toán tiền thuê và các chi phí đúng hạn.</li>
    <li>Tự bảo quản tài sản cá nhân. Giữ gìn vệ sinh chung, an ninh trật tự.</li>
    <li>Không tàng trữ chất cấm, vũ khí hoặc các vật liệu dễ nổ. Tuân thủ quy định PCCC.</li>
    <li>Nếu thôi thuê phòng báo trước ít nhất 30 ngày.</li>
</ul>

<h4 class="font-bold text-lg border-b pb-1 mt-6 mb-4 text-gray-800 tracking-tight">ĐIỀU 4: CAM KẾT CHUNG</h4>
<p>Hai bên cam kết thực hiện đúng các điều khoản đã ghi trong hợp đồng. Nếu có tranh chấp, hai bên cùng thương lượng giải quyết.</p>
<p>Hợp đồng này được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</p>
`.trim()

  useEffect(() => {
    getAppSettings().then((value) => {
      setSettings(value)
      if (!value.contract_template) {
        setSettings(v => ({ ...v, contract_template: DEFAULT_TEMPLATE }))
      }
      setLoading(false)
    })
  }, [])

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value)
    if (editorRef.current) {
      setSettings(prev => ({ ...prev, contract_template: editorRef.current?.innerHTML }))
    }
  }

  const insertVariable = (variable: string) => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    const textNode = document.createTextNode(`{{${variable}}}`)
    range.deleteContents()
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.setEndAfter(textNode)
    selection.removeAllRanges()
    selection.addRange(range)
    if (editorRef.current) {
      setSettings(prev => ({ ...prev, contract_template: editorRef.current?.innerHTML }))
    }
    playClick()
  }

  const handleSave = async () => {
    setSaving(true)
    const content = editorRef.current?.innerHTML || ''
    await updateAppSettings({ ...settings, contract_template: content })
    setSaving(false)
    setSaved(true)
    playSuccess()
    setTimeout(() => setSaved(false), 2000)
  }

  const renderPreview = () => {
    const samples: Record<string, string> = {
      '{{room_name}}': 'Phòng 101', '{{base_rent}}': '3.500.000',
      '{{deposit_amount}}': '3.500.000', '{{tenant_name}}': 'Nguyễn Văn A',
      '{{occupant_count}}': '2', '{{move_in_date}}': '01/01/2026',
      '{{expiration_date}}': 'đến 01/01/2027', '{{invoice_day}}': '5',
      '{{electric_init}}': '1250', '{{water_init}}': '340',
    }
    let html = settings.contract_template || ''
    Object.entries(samples).forEach(([k, v]) => {
      html = html.split(k).join(`<u class="text-blue-600 not-italic">${v}</u>`)
    })
    return html
  }

  const VARIABLES = [
    { label: 'Tên phòng', key: 'room_name' },
    { label: 'Giá thuê', key: 'base_rent' },
    { label: 'Tiền cọc', key: 'deposit_amount' },
    { label: 'Khách thuê', key: 'tenant_name' },
    { label: 'Ngày vào', key: 'move_in_date' },
    { label: 'Hạn HĐ', key: 'expiration_date' },
    { label: 'Ngày chốt', key: 'invoice_day' },
  ]

  if (loading) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">Thiết lập mẫu hợp đồng</h2>
            <p className="text-xs text-gray-400 mt-0.5">Soạn điều khoản bên trái — xem trước bên phải</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
          <div className="flex items-center border border-gray-200 rounded bg-white overflow-hidden">
            <button onClick={() => execCommand('bold')} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 border-r border-gray-200 transition-colors" title="Đậm"><i className="fa-solid fa-bold text-xs"></i></button>
            <button onClick={() => execCommand('italic')} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 border-r border-gray-200 transition-colors" title="Nghiêng"><i className="fa-solid fa-italic text-xs"></i></button>
            <button onClick={() => execCommand('formatBlock', 'h4')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 border-r border-gray-200 transition-colors">Tiêu đề</button>
            <button onClick={() => execCommand('formatBlock', 'p')} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors">Đoạn văn</button>
          </div>
          <div className="w-px h-5 bg-gray-200 mx-2"></div>
          <span className="text-xs text-gray-400 font-medium mr-1">Chèn biến:</span>
          {VARIABLES.map(v => (
            <button
              key={v.key}
              onClick={() => insertVariable(v.key)}
              className="px-2 py-1 text-xs border border-gray-200 rounded bg-white text-gray-600 hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Main 2-col */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Editor */}
          <div className="w-1/2 border-r border-gray-100 overflow-y-auto p-6 bg-white shrink-0">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => setSettings(prev => ({ ...prev, contract_template: editorRef.current?.innerHTML }))}
              dangerouslySetInnerHTML={{ __html: settings.contract_template || '' }}
              className="outline-none leading-relaxed text-[14px] text-gray-800 min-h-full contract-editor"
            />
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto bg-gray-100/50 p-8 flex justify-center items-start">
            <div className="bg-white shadow-md border border-gray-200 w-full max-w-[210mm] min-h-[297mm] p-[20mm] text-[14px] leading-relaxed relative">
              <div className="text-center mb-6">
                <p className="font-bold text-[13px]">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                <p className="font-bold underline text-[12px]">Độc lập - Tự do - Hạnh phúc</p>
              </div>
              <h1 className="text-center text-lg font-bold uppercase mb-6">HỢP ĐỒNG THUÊ PHÒNG TRỌ</h1>
              <div className="text-xs text-gray-400 italic mb-6 border-l-2 border-gray-200 pl-3">
                *(Dữ liệu bên dưới là dữ liệu mẫu để xem trước)*
              </div>
              <div
                dangerouslySetInnerHTML={{ __html: renderPreview() }}
                className="contract-preview text-justify max-w-none"
              />

              <div className="flex justify-between mt-16 px-10 pt-10">
                <div className="text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-20">BÊN THUÊ (BÊN B)</div>
                  <div className="text-sm font-bold text-gray-900 italic">Nguyễn Văn A</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-20">BÊN CHO THUÊ (BÊN A)</div>
                  <div className="text-sm font-bold text-gray-900 italic">Lê Văn Chủ</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white shrink-0">
          <button
            onClick={() => {
              if (window.confirm('Quay về mẫu mặc định?')) {
                setSettings(v => ({ ...v, contract_template: DEFAULT_TEMPLATE }))
                if (editorRef.current) editorRef.current.innerHTML = DEFAULT_TEMPLATE
              }
            }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Về mẫu mặc định
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-emerald-600 font-medium"><i className="fa-solid fa-check mr-1"></i>Đã lưu</span>}
            <button onClick={onClose} className="px-6 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">Đóng</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-2.5 text-sm bg-primary text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <i className="fa-solid fa-spinner animate-spin text-xs"></i>}
              {saving ? 'Đang lưu...' : 'Lưu mẫu'}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .contract-editor h4, .contract-preview h4 { font-weight: 700; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 2rem 0 1rem; color: #1f2937; }
        .contract-editor p, .contract-preview p { margin-bottom: 1rem; }
        .contract-editor ul, .contract-preview ul { padding-left: 1.5rem; list-style-type: decimal; margin-bottom: 1rem; }
        .contract-editor li, .contract-preview li { margin-bottom: 0.5rem; }
      `}</style>
    </div>
  )
}

interface ContractsTabProps {
  onCreateContract?: (room: Room) => void
}

export const ContractsTab: React.FC<ContractsTabProps> = ({ onCreateContract }) => {
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: settings } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings })
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('active')
  const [isPickingRoom, setIsPickingRoom] = useState(false)
  const [isSettingTemplate, setIsSettingTemplate] = useState(false)

  // Print context
  const contentRef = useRef<HTMLDivElement>(null)
  const [printingContractId, setPrintingContractId] = useState<string | null>(null)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)

  const printFn = useReactToPrint({
    contentRef,
    documentTitle: 'Hop_dong_thue_phong',
    onAfterPrint: () => setPrintingContractId(null)
  })

  // Whenever printingContractId is set, wait for state to propagate, then trigger print
  useEffect(() => {
    if (printingContractId && contentRef.current) {
      setTimeout(() => {
        printFn()
      }, 100)
    }
  }, [printingContractId, printFn])

  const filteredContracts = contracts.filter(
    (contract: Contract) => statusFilter === 'all' || contract.status === statusFilter
  )

  const printingContract = contracts.find(c => c.id === printingContractId)
  const printingRoom = printingContract ? rooms.find(r => r.id === printingContract.room_id) : undefined

  return (
    <div className="flex-1 overflow-y-auto p-4 relative">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Danh sách hợp đồng</h2>
            <p className="text-sm text-gray-500 mt-1">
              Quản lý toàn bộ hợp đồng thuê theo trạng thái
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => {
                playClick()
                setIsSettingTemplate(true)
              }}
              className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors"
            >
              <i className="fa-solid fa-file-pen text-primary"></i>
              Thiết lập mẫu
            </button>

            <button
              onClick={() => {
                playClick()
                setIsPickingRoom(true)
              }}
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

                return (
                  <tr key={contract.id} className="hover:bg-gray-50 transition group">
                    <td className="px-5 py-4 text-xs font-mono text-gray-400">
                      ...{contract.id.slice(-6)}
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-800">
                      {room?.name || contract.room_id}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-700">{contract.tenant_name}</td>
                    <td className="px-5 py-4 text-gray-600">{formatDate(contract.move_in_date)}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-primary">
                      {formatVND(contract.base_rent)} đ
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-gray-600">
                      {formatVND(contract.deposit_amount)} đ
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${getStatusClassName(contract.status)}`}
                      >
                        {getStatusLabel(contract.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingContract(contract)}
                          className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-center border border-blue-100 shadow-sm"
                          title="Sửa hợp đồng"
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button
                          onClick={() => setPrintingContractId(contract.id)}
                          className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-emerald-600 hover:text-white transition-colors flex items-center justify-center border border-gray-200 shadow-sm"
                          title="In mẫu hợp đồng PDF"
                        >
                          <i className="fa-solid fa-print"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredContracts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    <i className="fa-solid fa-file-contract text-4xl mb-4 block text-gray-300"></i>
                    <p className="text-sm font-medium">Không có hợp đồng nào phù hợp với bộ lọc.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden container for print template */}
      <div className="hidden">
        <div ref={contentRef}>
          {printingContractId && printingContract && printingRoom && (
            <ContractPrintTemplate
              contract={printingContract}
              room={printingRoom}
              settings={settings || {}}
            />
          )}
        </div>
      </div>

      {editingContract && (
        <EditContractModal
          contract={editingContract}
          onClose={() => setEditingContract(null)}
        />
      )}

      {isPickingRoom && (
        <RoomSelectionModal
          rooms={rooms}
          onClose={() => setIsPickingRoom(false)}
          onSelect={(room) => {
            setIsPickingRoom(false)
            onCreateContract?.(room)
          }}
        />
      )}

      {isSettingTemplate && (
        <ContractTemplateModal
          onClose={() => setIsSettingTemplate(false)}
        />
      )}
    </div>
  )
}
