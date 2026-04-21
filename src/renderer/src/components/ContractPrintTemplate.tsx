import { forwardRef } from 'react'
import type { Contract, Room, AppSettings } from '../lib/db'

interface ContractPrintTemplateProps {
    contract: Contract
    room: Room
    settings: AppSettings
}

const formatVND = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
const formatDate = (dateStr?: string) => {
    if (!dateStr) return '...'
    const date = new Date(dateStr)
    return `ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`
}

export const ContractPrintTemplate = forwardRef<HTMLDivElement, ContractPrintTemplateProps>(
    ({ contract, room, settings }, ref) => {
        const renderTemplate = () => {
            const template = settings.contract_template || `
<h4 class="font-bold">ĐIỀU 1: THÔNG TIN PHÒNG CHO THUÊ</h4>
<p>1. Bên A đồng ý cho bên B thuê phòng số: <strong>{{room_name}}</strong></p>
<p>2. Giá thuê phòng là: <strong>{{base_rent}} VNĐ / tháng</strong></p>
<p>3. Số người ở tối đa: {{occupant_count}} người.</p>

<h4 class="font-bold">ĐIỀU 2: THỜI HẠN VÀ PHƯƠNG THỨC THANH TOÁN</h4>
<p>1. Thời gian thuê: <strong>{{duration}}</strong>, tính từ ngày {{move_in_date}} {{expiration_date}}.</p>
<p>2. Tiền đặt cọc: <strong>{{deposit_amount}} VNĐ</strong>. Số tiền này sẽ được bên A hoàn trả cho bên B sau khi thanh lý hợp đồng và trừ đi các khoản chi phí phát sinh, hư hỏng tài sản (nếu có).</p>
<p>3. Thanh toán: Tiền thuê phòng được thanh toán vào ngày {{invoice_day}} hàng tháng.</p>
<p>4. Chỉ số ban đầu: Điện: {{electric_init}} kWh. Nước: {{water_init}} khối.</p>

<h4 class="font-bold">ĐIỀU 3: TRÁCH NHIỆM CỦA CÁC BÊN</h4>
<h5 class="font-semibold italic mt-2">Trách nhiệm của Bên A:</h5>
<ul class="list-disc pl-5">
    <li>Đảm bảo quyền sử dụng trọn vẹn phòng trọ cho Bên B.</li>
    <li>Sửa chữa kịp thời các hư hỏng thuộc về kết cấu phòng trống.</li>
</ul>
<h5 class="font-semibold italic mt-2">Trách nhiệm của Bên B:</h5>
<ul class="list-disc pl-5">
    <li>Thanh toán tiền thuê và các chi phí đúng hạn.</li>
    <li>Tự bảo quản tài sản cá nhân. Giữ gìn vệ sinh chung, an ninh trật tự.</li>
    <li>Không tàng trữ chất cấm, vũ khí hoặc các vật liệu dễ nổ. Tuân thủ quy định PCCC.</li>
    <li>Nếu thôi thuê phòng báo trước ít nhất 30 ngày.</li>
</ul>

<h4 class="font-bold">ĐIỀU 4: CAM KẾT CHUNG</h4>
<p>Hai bên cam kết thực hiện đúng các điều khoản đã ghi trong hợp đồng. Nếu có tranh chấp, hai bên cùng thương lượng giải quyết.</p>
<p>Hợp đồng này được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</p>
`

            const replacements: Record<string, string> = {
                '{{room_name}}': room.name,
                '{{base_rent}}': formatVND(contract.base_rent),
                '{{deposit_amount}}': formatVND(contract.deposit_amount),
                '{{tenant_name}}': contract.tenant_name || '',
                '{{occupant_count}}': (contract.occupant_count || 1).toString(),
                '{{move_in_date}}': formatDate(contract.move_in_date),
                '{{duration}}': contract.duration_months === 0 ? 'Không xác định thời hạn' : `${contract.duration_months} tháng`,
                '{{expiration_date}}': contract.expiration_date ? `đến ngày ${formatDate(contract.expiration_date)}` : '',
                '{{invoice_day}}': (contract.invoice_day || 5).toString(),
                '{{electric_init}}': (contract.electric_init || 0).toString(),
                '{{water_init}}': (contract.water_init || 0).toString(),
            }

            let html = template
            Object.entries(replacements).forEach(([key, value]) => {
                html = html.split(key).join(value)
            })

            return <div dangerouslySetInnerHTML={{ __html: html }} className="space-y-4 text-justify" />
        }

        return (
            <div ref={ref} className="bg-white text-black p-10 font-serif leading-relaxed" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
                <div className="text-center mb-8">
                    <h2 className="text-lg font-bold uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h2>
                    <h3 className="text-md font-bold underline">Độc lập - Tự do - Hạnh phúc</h3>
                </div>

                <div className="text-center mb-10">
                    <h1 className="text-2xl font-bold uppercase mb-2">HỢP ĐỒNG THUÊ PHÒNG TRỌ</h1>
                    <p className="italic">Tại địa chỉ: {settings.property_address || '..........................................................'}</p>
                </div>

                <p className="mb-4">Hôm nay, {formatDate(contract.created_at || new Date().toISOString())}, tại {settings.property_address || '..............................'}, chúng tôi gồm:</p>

                <div className="mb-6">
                    <h4 className="font-bold mb-2">BÊN CHO THUÊ PHÒNG (BÊN A):</h4>
                    <p>Ông/Bà: <strong>{settings.property_owner_name || '..........................................................'}</strong></p>
                    <p>CCCD/CMND số: {settings.property_owner_id_card || '..............................'}</p>
                    <p>Số điện thoại: {settings.property_owner_phone || '..............................'}</p>
                    <p>Thuộc khu trọ: {settings.property_name || '..........................................................'}</p>
                    <p>Địa chỉ khu trọ: {settings.property_address || '..........................................................'}</p>
                </div>

                <div className="mb-6">
                    <h4 className="font-bold mb-2">BÊN THUÊ PHÒNG (BÊN B):</h4>
                    <p>Ông/Bà: <strong>{contract.tenant_name || '..........................................................'}</strong></p>
                    <p>Sinh năm: {contract.tenant_dob || '..............................'}</p>
                    <p>
                        CCCD/CMND số: {contract.tenant_id_card || '..............................'}
                    </p>
                    <p>Số điện thoại: {contract.tenant_phone || '..............................'}</p>
                </div>

                <p className="mb-4 font-bold italic">Hai bên cùng thỏa thuận ký kết hợp đồng thuê phòng với các điều khoản sau:</p>

                {renderTemplate()}

                <div className="flex justify-between mt-12 px-10">
                    <div className="text-center">
                        <h4 className="font-bold">BÊN THUÊ (BÊN B)</h4>
                        <p className="italic text-sm">(Ký và ghi rõ họ tên)</p>
                        <div className="h-32"></div>
                        <p className="font-bold">{contract.tenant_name}</p>
                    </div>
                    <div className="text-center">
                        <h4 className="font-bold">BÊN CHO THUÊ (BÊN A)</h4>
                        <p className="italic text-sm">(Ký và ghi rõ họ tên)</p>
                        <div className="h-32"></div>
                        <p className="font-bold">{settings.property_owner_name}</p>
                    </div>
                </div>
            </div>
        )
    }
)

ContractPrintTemplate.displayName = 'ContractPrintTemplate'
