const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const sharp = require('sharp')
const defs = require('./notification-demo-definitions.json')
const dir = path.resolve(__dirname, '../webmobile/Mau thong bao')

async function main() {
  const reviews = JSON.parse(fs.readFileSync(path.join(dir, '_tao-anh/kiem-tra-truc-quan.json'), 'utf8'))
  const records = []
  for (const d of defs) {
    const file = path.join(dir, d.id + '.png')
    const bytes = fs.readFileSync(file)
    const size = await sharp(bytes).metadata()
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, '_tao-anh', d.id + '.json'), 'utf8'))
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    if (hash !== metadata.sha256 || !metadata.prompt || !reviews[d.id]) {
      throw Error('Missing provenance or visual review: ' + d.id)
    }
    records.push({ id: d.id, name: d.name, file, width: size.width, height: size.height, sha256: hash, visualReview: reviews[d.id] })
  }
  fs.writeFileSync(path.join(dir, '_tao-anh/ket-qua-kiem-tra.json'), JSON.stringify({ at: new Date().toISOString(), count: records.length, records }, null, 2) + '\n')
  const intro = '# Bộ mẫu email An Khang Home\n\n17 ảnh demo, mỗi tình huống một mẫu. Dựa trên ảnh email hợp đồng do người dùng cung cấp. Dữ liệu minh họa, ngày 09/10/2026. Đây là ảnh thiết kế để duyệt; chưa phải email HTML và chưa được đưa vào luồng gửi thật.\n\n'
  const gallery = defs.map((d, i) => `## ${i + 1}. ${d.name}\n\nĐối tượng: ${d.audience}.\n\n![${d.name}](<${path.join(dir, d.id + '.png').replace(/\\/g, '/')}>)\n`).join('\n')
  fs.writeFileSync(path.join(dir, 'XEM-TAT-CA-MAU.md'), intro + gallery)
  fs.writeFileSync(path.join(dir, 'README.md'), intro + 'Mở `XEM-TAT-CA-MAU.md` để xem toàn bộ ảnh, hoặc mở riêng các PNG được đánh số 01–17.\n\nQuy ước màu: xanh lá = xác nhận/thành công; đỏ = giao dịch cần đối soát; vàng/cam = thanh toán một phần và nhắc nợ; xanh dương = hóa đơn/nhắc đến kỳ thanh toán; tím = lịch trả phòng/hết hạn; xám = hủy hợp đồng lập nhầm.\n\nCác biên nhận hiển thị hóa đơn ngay trong email, không có nút mở hóa đơn ngoài. Riêng mẫu 15 chỉ nhắc đến kỳ thanh toán và dẫn tới https://pay.phongtroankhang.com: khách thuê chụp số điện nước trước, hệ thống lập hóa đơn sau, rồi khách kiểm tra và thanh toán. Email mẫu 15 không có hóa đơn, số tiền hay hạn thanh toán sẵn. Mẫu nhắc nợ dài ngày và nợ cũ dùng nội dung gọn. Hủy hợp đồng lập nhầm không mang ý nghĩa trả phòng.\n\nẢnh nguồn tại `_nguon`, thông tin sinh ảnh và kiểm tra tại `_tao-anh`.\n')
  console.log('Verified ' + records.length + ' images; gallery saved.')
}
main().catch((e) => { console.error(e.message); process.exitCode = 1 })
