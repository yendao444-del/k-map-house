import { forwardRef } from 'react'
import type { Contract, Room, AppSettings } from '../lib/db'

interface ContractPrintTemplateProps {
    contract: Contract
    room: Room
    settings: AppSettings
}

const formatVND = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
const numberToWords = (num: number): string => {
    if (num === 0) return 'Không đồng'
    const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
    const tens = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi']

    const readGroup = (n: number): string => {
        const h = Math.floor(n / 100)
        const t = Math.floor((n % 100) / 10)
        const u = n % 10
        let result = ''
        if (h > 0) result += units[h] + ' trăm '
        if (t > 0) result += tens[t] + ' '
        else if (h > 0 && u > 0) result += 'linh '
        if (u > 0) result += units[u] + ' '
        return result
    }

    const billions = Math.floor(num / 1_000_000_000)
    const millions = Math.floor((num % 1_000_000_000) / 1_000_000)
    const thousands = Math.floor((num % 1_000_000) / 1_000)
    const remainder = num % 1_000

    let result = ''
    if (billions > 0) result += readGroup(billions) + 'tỷ '
    if (millions > 0) result += readGroup(millions) + 'triệu '
    if (thousands > 0) result += readGroup(thousands) + 'nghìn '
    if (remainder > 0) result += readGroup(remainder)

    const finalStr = result.trim() + ' đồng'
    return finalStr.charAt(0).toUpperCase() + finalStr.slice(1)
}

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '......'
    const date = new Date(dateStr)
    return `ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`
}
const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return '......'
    const date = new Date(dateStr)
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

export const ContractPrintTemplate = forwardRef<HTMLDivElement, ContractPrintTemplateProps>(
    ({ contract, room, settings }, ref) => {
        const landlordName = settings.property_owner_name || 'Đỗ Kim Ngân'
        const landlordPhone = settings.property_owner_phone || '.....................'
        const landlordIdCard = settings.property_owner_id_card || '034300002743'
        const propertyAddress = settings.property_address || 'Số nhà 8, ngách 132b, ngõ 28, tổ dân phố 18, phường Đại Mỗ, Hà Nội'
        const bankName = settings.bank_id || 'BIDV'
        const bankAccountNo = settings.account_no || '8856782931'
        const bankAccountName = settings.account_name || 'Đỗ Kim Ngân'
        const invoiceDay = contract.invoice_day || 5

        return (
            <div
                ref={ref}
                className="text-black font-serif leading-relaxed w-full"
                style={{
                    fontSize: '14pt',
                    lineHeight: '1.5',
                    fontFamily: '"Times New Roman", Times, serif',
                }}
            >
                {/* Tiêu đề */}
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <p style={{ fontWeight: 700, fontSize: '13pt', letterSpacing: '0.5px' }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                    <p style={{ fontWeight: 700, textDecoration: 'underline', fontSize: '14pt' }}>Độc lập - Tự do - Hạnh phúc</p>
                    <p style={{ marginTop: '4px' }}>***</p>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <h1 style={{ fontWeight: 700, fontSize: '16pt', textTransform: 'uppercase', letterSpacing: '1px' }}>HỢP ĐỒNG THUÊ NHÀ</h1>
                </div>

                {/* Căn cứ pháp lý */}
                <div style={{ marginBottom: '16px', fontStyle: 'italic' }}>
                    <p style={{ margin: '0 0 4px 0' }}>– Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;</p>
                    <p style={{ margin: '0 0 4px 0' }}>– Căn cứ vào Luật Thương mại số 36/2005/QH11 ngày 14 tháng 06 năm 2005;</p>
                    <p>– Căn cứ vào nhu cầu và sự thỏa thuận của các bên tham gia Hợp đồng;</p>
                </div>

                <p style={{ marginBottom: '16px' }}>
                    Hôm nay, {formatDate(contract.created_at || new Date().toISOString())}, các Bên gồm:
                </p>

                {/* Bên A */}
                <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '6px' }}>BÊN CHO THUÊ (Bên A): {landlordName}</p>
                    <p style={{ margin: '0 0 4px 0' }}>CMND/CCCD số: {landlordIdCard}</p>
                    <p style={{ margin: '0 0 4px 0' }}>Số điện thoại: {landlordPhone}</p>
                    <p style={{ margin: '0 0 4px 0' }}>Địa chỉ: {propertyAddress}</p>
                </div>

                {/* Bên B */}
                <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '6px' }}>
                        BÊN THUÊ (Bên B): {contract.tenant_name || '..........................................'}
                    </p>
                    <p style={{ margin: '0 0 4px 0' }}>
                        CMND/CCCD số: {contract.tenant_id_card || '.............................'}
                        &nbsp;&nbsp;&nbsp;&nbsp;Ngày cấp: {contract.tenant_dob || '.......................'}
                    </p>
                    <p style={{ margin: '0 0 4px 0' }}>Số điện thoại: {contract.tenant_phone || '..........................................'}</p>
                </div>

                <p style={{ marginBottom: '16px', fontWeight: 600, fontStyle: 'italic' }}>
                    Sau khi thỏa luận, Hai Bên thống nhất đi đến ký kết Hợp đồng thuê nhà ("Hợp Đồng") với các điều khoản và điều kiện cụ thể như sau:
                </p>

                {/* ĐIỀU 1 */}
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 1: Nhà ở và các tài sản cho thuê kèm theo nhà ở:</p>
                    <p style={{ margin: '0 0 6px 0' }}>
                        1.1. Bên A cho Bên B thuê nhà tại địa chỉ: <strong>{propertyAddress}</strong>
                    </p>
                    <p style={{ margin: '0 0 4px 0', paddingLeft: '16px' }}>
                        Phòng số: <strong>{room.name}</strong> &nbsp;&nbsp; Diện tích: .............. m².
                    </p>
                    <p style={{ margin: '6px 0' }}>
                        1.2. <em><strong>Mục đích thuê:</strong></em> Chỉ sử dụng để ở, sinh hoạt cá nhân và hộ gia đình. Không được sử dụng căn nhà vào các mục đích:
                    </p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0 6px 0', listStyleType: 'disc' }}>
                        <li>Kinh doanh, buôn bán hoặc sản xuất hàng hóa; Làm văn phòng, kho chứa hàng hóa;</li>
                        <li>Cho thuê lại dưới bất kỳ hình thức nào;</li>
                        <li>Tổ chức tụ tập đông người hoặc thực hiện các hoạt động trái pháp luật (như cờ bạc, mại dâm, tàng trữ hàng cấm, chất cấm, hoặc bất kỳ hành vi vi phạm pháp luật nào khác).</li>
                    </ul>
                    <p style={{ margin: '6px 0' }}>
                        1.3. <em><strong>Hiện trạng bàn giao đính kèm:</strong></em> Bao gồm nội thất, trang thiết bị đi kèm (chi tiết phụ lục 01).
                    </p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0', listStyleType: 'disc' }}>
                        <li>Trong vòng 01 tháng kể từ ngày ký kết Hợp đồng, nếu nội thất và trang thiết bị đi kèm trong nhà bị hư hỏng do lỗi kỹ thuật, hao mòn tự nhiên hoặc không do lỗi của Bên B, Bên A có trách nhiệm kiểm tra, khắc phục và sửa chữa các hư hỏng này.</li>
                        <li>Sau thời hạn nêu trên, mọi trường hợp hư hỏng, mất mát hoặc thiệt hại liên quan đến nội thất, trang thiết bị hoặc kết cấu tài sản thuê sẽ do Bên B tự chịu trách nhiệm sửa chữa hoặc thay thế bằng chi phí của mình (Việc sửa chữa, thay thế bất kỳ tài sản, thiết bị nào đều phải có sự đồng ý trước của Bên A.)</li>
                    </ul>
                </div>

                {/* ĐIỀU 2 */}
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 2: Tiền thuê:</p>
                    <p style={{ margin: '0 0 6px 0' }}>
                        2.1. Tiền thuê nhà: <strong>{formatVND(contract.base_rent)} VNĐ/tháng</strong>
                    </p>
                    <p style={{ margin: '0 0 4px 0', paddingLeft: '16px' }}>
                        (Bằng chữ: <em>{numberToWords(contract.base_rent)}</em>)
                    </p>
                    <p style={{ margin: '8px 0 4px 0' }}>2.2. Tiền thuê nhà không bao gồm chi phí sử dụng trong quá trình thuê như:</p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0', listStyleType: 'disc' }}>
                        <li>Tiền điện, nước (theo đồng hồ riêng hoặc hóa đơn do cơ quan cung cấp);</li>
                        <li>Phí rác thải, vệ sinh môi trường;</li>
                        <li>Phí Internet, truyền hình cáp, điện thoại (nếu có đăng ký);</li>
                        <li>Phí quản lý (nếu nhà nằm trong khu dân cư, chung cư có áp dụng phí này);</li>
                        <li>Các khoản phí phát sinh khác do Bên B sử dụng dịch vụ.</li>
                    </ul>
                    <p style={{ margin: '8px 0 0 0' }}>
                        Các khoản phí sẽ được tính hàng tháng theo đơn giá của Nhà nước hoặc đơn vị cung cấp dịch vụ, căn cứ trên chỉ số thực tế sử dụng hoặc hóa đơn xuất hàng tháng và do bên B thanh toán.
                    </p>
                </div>

                {/* ĐIỀU 3 */}
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 3: Phương thức thanh toán:</p>
                    <p style={{ margin: '0 0 6px 0' }}>
                        <em><strong>3.1. Kỳ hạn thanh toán:</strong></em> Bên B có trách nhiệm thanh toán tiền thuê nhà định kỳ theo tháng (01 tháng/lần), cụ thể trong khoảng thời gian từ ngày {invoiceDay} đến ngày {Math.min(invoiceDay + 5, 28)} của tháng đầu tiên của mỗi tháng kế tiếp.
                    </p>
                    <p style={{ margin: '0 0 8px 0' }}>
                        Đối với kỳ đầu tiên, Bên B thanh toán tiền thuê nhà cho Bên A sau khi ký kết hợp đồng.
                    </p>
                    <p style={{ margin: '0 0 6px 0' }}>
                        <em><strong>3.2. Hình thức thanh toán:</strong></em> Tiền mặt hoặc Chuyển khoản
                    </p>
                    <p style={{ margin: '0 0 4px 0' }}>Chuyển khoản: Vào tài khoản ngân hàng của Bên A theo thông tin dưới đây:</p>
                    <div style={{ paddingLeft: '32px', margin: '6px 0' }}>
                        <p style={{ margin: '0 0 3px 0' }}>Họ và tên: <strong>{bankAccountName}</strong></p>
                        <p style={{ margin: '0 0 3px 0' }}>Số tài khoản: <strong>{bankAccountNo}</strong></p>
                        <p style={{ margin: '0' }}>Ngân hàng: <strong>{bankName}</strong></p>
                    </div>
                </div>

                {/* ĐIỀU 4 */}
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 4: Thời hạn thuê:</p>
                    <p style={{ margin: '0 0 6px 0' }}>
                        Bên A cam kết cho Bên B thuê nhà với thời hạn là{' '}
                        <strong>{contract.duration_months === 0 ? '...... tháng (không xác định)' : `${contract.duration_months} tháng`}</strong>,
                        bắt đầu từ ngày{' '}
                        <strong>{formatDateShort(contract.move_in_date)}</strong>
                        {contract.expiration_date ? <> đến hết ngày <strong>{formatDateShort(contract.expiration_date)}</strong></> : ' đến hết ngày ......./......./..........'}
                    </p>
                    <p>
                        Hết thời hạn thuê nêu trên, nếu bên B có nhu cầu tiếp tục sử dụng, Bên A cam kết ưu tiên cho Bên B được gia hạn hoặc ký kết hợp đồng thuê mới với các điều kiện thương lượng phù hợp tại thời điểm đó.
                    </p>
                </div>

                {/* ĐIỀU 5 */}
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 5: Đặc cọc tiền thuê nhà:</p>
                    <p style={{ margin: '0 0 4px 0' }}>
                        5.1. Ngay sau khi hai bên ký kết hợp đồng này, Bên B sẽ giao cho Bên A một khoản tiền đặt cọc là:{' '}
                        <strong>{formatVND(contract.deposit_amount)} VNĐ</strong>
                    </p>
                    <p style={{ margin: '0 0 8px 0', paddingLeft: '16px' }}>
                        (Bằng chữ: <em>{numberToWords(contract.deposit_amount)}</em>)
                    </p>
                    <p style={{ margin: '0 0 4px 0' }}>Khoản tiền này nhằm đảm bảo việc thực hiện đúng các nghĩa vụ của Bên B theo Hợp đồng và sẽ có hiệu lực kể từ ngày hợp đồng có hiệu lực.</p>
                    <p style={{ margin: '8px 0 4px 0' }}><em><strong>5.2. Nguyên tắc sử dụng tiền đặt cọc:</strong></em></p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0', listStyleType: 'disc' }}>
                        <li>Trong trường hợp Bên B đơn phương chấm dứt hợp đồng mà không thông báo trước cho Bên A ít nhất 30 ngày, hoặc chấm dứt hợp đồng trái quy định pháp luật, thì Bên A có quyền giữ lại toàn bộ số tiền đặt cọc;</li>
                        <li>Trong trường hợp Bên A đơn phương chấm dứt hợp đồng mà không báo trước cho Bên B theo đúng quy định, bên A có trách nhiệm hoàn trả toàn bộ số tiền đặt cọc cho Bên B;</li>
                        <li>Khoản tiền đặt cọc không được sử dụng để trừ vào tiền thuê nhà hoặc chi phí sử dụng hằng tháng, trừ khi có thỏa thuận cả hai bên;</li>
                        <li>Trong trường hợp Bên B gây thiệt hại đối với tài sản và trang thiết bị thuê, vi phạm nghĩa vụ hợp đồng, hoặc không bàn giao lại nhà đúng hạn, Bên A có quyền khấu trừ toàn bộ hoặc một phần tiền đặt cọc để bù đắp các thiệt hại, chi phí sửa chữa hoặc tổn thất phát sinh;</li>
                        <li>Bên A sẽ hoàn trả lại số tiền đặt cọc cho Bên B trong vòng 1 ngày kể từ ngày bàn giao lại nhà, sau khi đã khấu trừ các khoản bồi thường, sửa chữa (nếu có).</li>
                    </ul>
                </div>

                {/* ĐIỀU 6 */}
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 6: Quyền và nghĩa vụ của bên A:</p>
                    <p style={{ margin: '0 0 4px 0', fontStyle: 'italic', fontWeight: 600 }}>6.1. Quyền của Bên A:</p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0 8px 0', listStyleType: 'disc' }}>
                        <li>Yêu cầu Bên B thanh toán đầy đủ và đúng hạn tiền thuê nhà cùng các chi phí sử dụng liên quan theo thỏa thuận trong Hợp đồng;</li>
                        <li>Yêu cầu Bên B sửa chữa hoặc bồi thường đối với phần hư hỏng, thiệt hại do lỗi của Bên B gây ra trong quá trình sử dụng tài sản thuê;</li>
                        <li>Bên A có quyền kiểm tra phòng trọ định kỳ với thông báo trước ít nhất 24 giờ cho Bên B để đảm bảo an toàn, an ninh và bảo trì thiết bị.</li>
                    </ul>
                    <p style={{ margin: '0 0 4px 0', fontStyle: 'italic', fontWeight: 600 }}>6.2. Nghĩa vụ của Bên A:</p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0', listStyleType: 'disc' }}>
                        <li>Bên A cam kết căn nhà và quyền sử dụng đất là tài sản hợp pháp của Bên A; mọi tranh chấp phát sinh, Bên A chịu hoàn toàn trách nhiệm trước pháp luật;</li>
                        <li>Đảm bảo việc cho thuê theo Hợp đồng này là hợp pháp, không vi phạm các quy định của pháp luật hiện hành;</li>
                        <li>Bàn giao diện tích thuê cho Bên B theo đúng thời gian, đúng hiện trạng và theo đúng cam kết trong Hợp đồng;</li>
                        <li>Trường hợp Bên B thanh toán muộn quá 10 ngày, Bên A có quyền đơn phương chấm dứt hợp đồng, yêu cầu Bên B bàn giao lại nhà ngay lập tức; khấu trừ vào tiền đặt cọc (nếu có) để bù đắp số tiền nợ; áp dụng các biện pháp pháp lý để thu hồi công nợ nếu cần thiết.</li>
                    </ul>
                </div>

                {/* ĐIỀU 7 */}
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 7: Quyền và nghĩa vụ của bên B:</p>
                    <p style={{ margin: '0 0 4px 0', fontStyle: 'italic', fontWeight: 600 }}>7.1. Quyền của Bên B:</p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0 8px 0', listStyleType: 'disc' }}>
                        <li>Nhận bàn giao diện tích thuê theo đúng thời hạn và hiện trạng theo thỏa thuận trong Hợp Đồng;</li>
                        <li>Sử dụng phần diện tích thuê hợp pháp theo đúng mục đích đã thỏa thuận trong hợp đồng;</li>
                    </ul>
                    <p style={{ margin: '0 0 4px 0', fontStyle: 'italic', fontWeight: 600 }}>7.2. Nghĩa vụ của Bên B:</p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0', listStyleType: 'disc' }}>
                        <li>Sử dụng diện tích thuê theo đúng mục đích đã thỏa thuận, giữ gìn tài sản thuê và tự chịu trách nhiệm sửa chữa những hư hỏng, mất mát;</li>
                        <li>Thanh toán đầy đủ tiền đặt cọc, tiền thuê, và các chi phí phát sinh đúng thời hạn đã cam kết;</li>
                        <li>Trả lại tài sản thuê đúng thời hạn và trong tình trạng nguyên vẹn, sạch sẽ, không hư hỏng, trừ hao mòn hợp lý do sử dụng đúng công năng;</li>
                        <li>Mọi việc sửa chữa, cải tạo, lắp đặt bổ sung các trang thiết bị làm ảnh hưởng đến kết cấu hoặc hiện trạng tài sản thuê phải được thông báo bằng văn bản và chỉ được thực hiện sau khi có sự đồng ý của Bên A;</li>
                        <li>Cam kết tuân thủ các quy định về an ninh trật tự, phòng chống cháy nổ, vệ sinh môi trường;</li>
                        <li>Không được chuyển nhượng Hợp Đồng thuê, cho thuê lại, hoặc cho bên thứ ba sử dụng toàn bộ hoặc một phần diện tích thuê dưới bất kỳ hình thức nào khi chưa có sự đồng ý bằng văn bản của Bên A;</li>
                        <li>Bên B có nghĩa vụ khai báo tạm trú đầy đủ với công an phường/xã nơi thuê theo quy định pháp luật. Nếu không thực hiện hoặc khai báo sai, Bên B chịu hoàn toàn trách nhiệm trước pháp luật;</li>
                        <li>Khi chấm dứt hợp đồng, Bên B phải báo trước ít nhất 30 ngày, dọn sạch phòng, tháo toàn bộ tài sản cá nhân, và ký biên bản bàn giao phòng, công tơ điện, nước (nếu không dọn sạch phòng bên A sẽ thu lại 300.000 phí dọn dẹp phòng). Sau khi bàn giao, Bên B phải hoàn tất thủ tục xóa đăng ký tạm trú;</li>
                        <li>Thực hiện đầy đủ các nghĩa vụ quy định tại Hợp Đồng này và các quy định của pháp luật liên quan.</li>
                    </ul>
                </div>

                {/* ĐIỀU 8 */}
                <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 8: Đơn phương chấm dứt hợp đồng thuê nhà:</p>
                    <ul style={{ paddingLeft: '24px', margin: '4px 0', listStyleType: 'disc' }}>
                        <li>Trong trường hợp một trong hai Bên muốn đơn phương chấm dứt Hợp Đồng trước thời hạn, Bên đó phải thông báo bằng văn bản cho Bên còn lại ít nhất 30 (ba mươi) ngày trước ngày dự kiến chấm dứt.</li>
                        <li>Nếu một trong hai Bên không thực hiện nghĩa vụ thông báo theo quy định trên, Bên vi phạm phải chịu trách nhiệm bồi thường cho Bên còn lại khoản tiền tương đương với tiền thuê trong thời gian không báo trước, cùng với các thiệt hại thực tế khác phát sinh do việc chấm dứt hợp đồng trái quy định.</li>
                    </ul>
                </div>

                {/* ĐIỀU 9 */}
                <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontWeight: 700, marginBottom: '8px' }}>Điều 9: Điều khoản thi hành:</p>
                    <p style={{ margin: '0 0 6px 0' }}>
                        Hợp Đồng này có hiệu lực kể từ ngày hai Bên ký kết. Mọi sửa đổi, bổ sung đối với bất kỳ nội dung nào của Hợp Đồng này đều phải được lập thành văn bản, có chữ ký xác nhận của cả hai Bên. Các văn bản này có giá trị pháp lý như Hợp Đồng chính và là bộ phận không thể tách rời của Hợp Đồng.
                    </p>
                    <p>
                        Hợp Đồng được lập thành 02 (hai) bản có giá trị pháp lý như nhau, mỗi Bên giữ 01 (một) bản để thực hiện và lưu giữ.
                    </p>
                </div>

                {/* Chữ ký */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingLeft: '20px', paddingRight: '20px' }}>
                    <div style={{ textAlign: 'center', minWidth: '160px' }}>
                        <p style={{ fontWeight: 700, marginBottom: '4px' }}>BÊN THUÊ (BÊN B)</p>
                        <p style={{ fontStyle: 'italic', fontSize: '12px', marginBottom: '0' }}>(Ký và ghi rõ họ tên)</p>
                        <div style={{ height: '80px' }}></div>
                        <p style={{ fontWeight: 700 }}>{contract.tenant_name || ''}</p>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '160px' }}>
                        <p style={{ fontWeight: 700, marginBottom: '4px' }}>BÊN CHO THUÊ (BÊN A)</p>
                        <p style={{ fontStyle: 'italic', fontSize: '12px', marginBottom: '0' }}>(Ký và ghi rõ họ tên)</p>
                        <div style={{ height: '80px' }}></div>
                        <p style={{ fontWeight: 700 }}>{landlordName}</p>
                    </div>
                </div>
            </div>
        )
    }
)

ContractPrintTemplate.displayName = 'ContractPrintTemplate'
