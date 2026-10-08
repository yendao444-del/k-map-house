import type { AppUser, Invoice, Room } from './db'
import {
  getInvoiceEmailSnapshot,
  buildNotificationEmailLayout,
  type NotificationEmailLayout
} from './payment-success-email'
import { emailNotificationOptions } from './email-notification-preferences'
import { buildInvoiceTransferDescription, createInvoiceTransferIndex } from './invoiceTransfer'
import {
  buildManualReminderEmail,
  emailDeliveryDecision,
  emailRecipientDecision,
  escapeEmailHtml,
  getManualEmailTargets,
  manualEmailKey,
  notificationSupport,
  type ManualEmailTarget,
  type NotificationType
} from './notification-email'
import {
  buildSepayEmail,
  evaluateSepayNotificationTransaction,
  getNewSepayPaymentEmails,
  sepayEmailKey,
  type SepayEmailEvent,
  type SepayNotificationTransaction
} from './sepay-email'

type Scenario = { id: string; label: string }
export const notificationTestScenarios: Record<NotificationType, readonly Scenario[]> = {
  room_checkout_due: [
    { id: 'due', label: 'Đã đến hạn trả phòng' },
    { id: 'future', label: 'Chưa đến hạn trả phòng' }
  ],
  rent_overdue: [
    { id: 'overdue', label: 'Qua ngày 15, còn hóa đơn chưa trả' },
    { id: 'paid', label: 'Đã trả hết, không còn nợ' },
    { id: 'before15', label: 'Chưa tới ngày 15' },
    { id: 'old_debt', label: 'Qua ngày 15, còn nợ cũ' }
  ],
  sepay_matched: [
    { id: 'full', label: 'Đã ghi nhận trả đủ' },
    { id: 'old_debt', label: 'Đã ghi nhận trả nợ tháng trước' },
    { id: 'partial', label: 'Đã duyệt và ghi nhận trả một phần' },
    { id: 'historical', label: 'Khoản thu cũ trước khi mở ứng dụng' },
    { id: 'duplicate', label: 'Thông báo đã gửi trước đó (giả lập)' }
  ],
  sepay_unmatched: [
    { id: 'no_invoice', label: 'Không tìm thấy hóa đơn' },
    { id: 'partial', label: 'Đúng mã nhưng chuyển thiếu, chưa duyệt' },
    { id: 'over', label: 'Đúng mã nhưng chuyển thừa' },
    { id: 'ambiguous', label: 'Nội dung chứa hai mã hóa đơn' },
    { id: 'awaiting', label: 'Đúng mã, trả đủ, chờ lưu khoản thu' },
    { id: 'recorded', label: 'Giao dịch đã ghi nhận, không cảnh báo lại' }
  ],
  rent_long_unpaid: [{ id: 'sample', label: 'Mẫu nhắc khoản nợ lâu chưa thanh toán' }],
  invoices_services: [{ id: 'sample', label: 'Mẫu thông tin hóa đơn và dịch vụ' }],
  contract_expiring: [{ id: 'sample', label: 'Mẫu nhắc hợp đồng sắp hết hạn' }]
}

export type NotificationTestCase = {
  type: NotificationType
  scenarioId: string
  scenarioLabel: string
  mail: { subject: string; html: string }
  condition: string
  event?: SepayEmailEvent
  target?: ManualEmailTarget
  duplicate: boolean
  date: string
}

export function createNotificationTestCase(
  type: NotificationType,
  scenarioId: string,
  name: string,
  clock = new Date()
): NotificationTestCase {
  const scenario = notificationTestScenarios[type].find((item) => item.id === scenarioId)
  if (!scenario) throw new Error('Tình huống kiểm thử không hợp lệ.')
  // A controlled date makes due-date checks reproducible on any day of the month.
  const now = new Date(
    clock.getFullYear(),
    clock.getMonth(),
    scenarioId === 'before15' ? 10 : 20,
    12
  )
  const date = now.toISOString().slice(0, 10)
  const room: Room = {
    id: 'TEST-room-101',
    name: 'Phòng mẫu 101',
    floor: 1,
    base_rent: 3000000,
    status: 'ending',
    created_at: date,
    expected_end_date:
      scenarioId === 'future'
        ? new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
        : date,
    old_debt: 0
  }
  const invoice: Invoice = {
    id: 'TEST-invoice-101',
    created_at: date,
    room_id: room.id,
    tenant_id: 'TEST-tenant',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    due_date: date,
    electric_old: 0,
    electric_new: 0,
    electric_usage: 0,
    electric_cost: 250000,
    water_old: 0,
    water_new: 0,
    water_usage: 0,
    water_cost: 100000,
    room_cost: 2500000,
    wifi_cost: 100000,
    garbage_cost: 50000,
    old_debt: 0,
    total_amount: 3000000,
    paid_amount: 0,
    payment_status: 'unpaid',
    payment_records: []
  }
  const result: NotificationTestCase = {
    type,
    scenarioId,
    scenarioLabel: scenario.label,
    mail: { subject: '', html: '' },
    condition: '',
    duplicate: scenarioId === 'duplicate',
    date
  }
  if (type === 'room_checkout_due' || type === 'rent_overdue') {
    if (scenarioId === 'paid') {
      invoice.payment_status = 'paid'
      invoice.paid_amount = invoice.total_amount
    }
    if (scenarioId === 'old_debt') room.old_debt = 500000
    const targets = getManualEmailTargets([room], scenarioId === 'old_debt' ? [] : [invoice], now)
    result.target = targets.find((target) => target.type === type)
    result.condition = result.target
      ? 'Dữ liệu giả thỏa điều kiện xuất hiện trong danh sách nhắc thủ công.'
      : 'Dữ liệu giả không thỏa điều kiện; không tạo thông báo.'
    result.mail = buildManualReminderEmail(
      result.target || {
        id: `${room.id}:${type}`,
        roomName: room.name,
        date,
        type,
        reason: type === 'room_checkout_due' ? 'Đến hạn trả phòng' : 'Nhắc nợ tiền phòng',
        label: scenario.label
      },
      name
    )
  } else if (type === 'sepay_matched' || type === 'sepay_unmatched') {
    if (scenarioId === 'old_debt') {
      const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      invoice.month = previous.getMonth() + 1
      invoice.year = previous.getFullYear()
      invoice.debt_confirmed_at = date
    }
    const amount = scenarioId === 'partial' ? 1000000 : scenarioId === 'over' ? 3500000 : 3000000
    const tx: SepayNotificationTransaction = {
      id: 'TEST-transaction',
      reference_number: 'TEST-BANK-101',
      amount_in: amount,
      transaction_content:
        scenarioId === 'no_invoice'
          ? 'Chuyen khoan khong co ma hoa don'
          : buildInvoiceTransferDescription(invoice, room.name)
    }
    const invoices = [invoice]
    if (scenarioId === 'ambiguous') {
      const second = { ...invoice, id: 'TEST-invoice-102' }
      invoices.push(second)
      tx.transaction_content += ` ${buildInvoiceTransferDescription(second, room.name)}`
    }
    if (type === 'sepay_matched' || scenarioId === 'recorded') {
      invoice.paid_amount = amount
      invoice.payment_status = amount < invoice.total_amount ? 'partial' : 'paid'
      invoice.payment_records = [
        {
          id: 'TEST-receipt',
          source: 'sepay',
          external_ref: tx.reference_number,
          amount,
          created_at: new Date(
            now.getTime() - (scenarioId === 'historical' ? 86400000 : 1000)
          ).toISOString(),
          payment_date: date
        }
      ]
    }
    if (type === 'sepay_matched') {
      result.event = getNewSepayPaymentEmails(invoices, now.getTime() - 60000, () => room.name)[0]
      result.condition = result.event
        ? 'Khoản thu giả đã ghi nhận được nhận diện là thanh toán SePay mới.'
        : 'Khoản thu giả có trước phiên mở ứng dụng; không gửi bù lịch sử.'
      if (scenarioId === 'partial')
        result.condition += ' Giả lập ảnh dữ liệu sau khi đã duyệt thu một phần.'
    } else {
      const decision = evaluateSepayNotificationTransaction(
        tx,
        invoices,
        createInvoiceTransferIndex(invoices, () => room.name)
      )
      result.event = decision.event
      const labels = {
        ignored: 'Bỏ qua giao dịch không hợp lệ.',
        recorded: 'Khoản thu đã ghi nhận; không gửi cảnh báo chưa khớp.',
        awaiting_record: 'Đúng mã và đủ tiền: đợi khoản thu được lưu rồi mới gửi xác nhận.',
        partial: 'Chuyển thiếu: cần duyệt thu một phần.',
        over: 'Chuyển thừa: cần đối soát thủ công.',
        unmatched: 'Không tìm thấy mã hóa đơn; cần đối soát.',
        ambiguous: 'Khớp nhiều hóa đơn; cần đối soát thủ công.'
      }
      result.condition = labels[decision.status]
    }
    result.mail = buildSepayEmail({
      ...(result.event || {
        type,
        transactionKey: tx.reference_number!,
        amount,
        roomName: room.name,
        month: invoice.month,
        year: invoice.year,
        remaining: Math.max(0, invoice.total_amount - invoice.paid_amount),
        ...getInvoiceEmailSnapshot(invoice),
        content: tx.transaction_content
      }),
      recipientName: name
    })
  } else {
    const title = emailNotificationOptions.find((item) => item.key === type)!.label
    result.condition =
      'Chưa có luồng gửi thực tế cho loại này. Chỉ kiểm tra mẫu thư và cài đặt nhận.'
    result.mail = {
      subject: `[AN KHANG HOME] ${title} · ${room.name}`,
      html: ''
    }
  }
  const money = (value: number): string => new Intl.NumberFormat('vi-VN').format(value) + ' đ'
  let title: string = emailNotificationOptions.find((item) => item.key === type)!.label
  const rows: Array<[string, string]> = [['Phòng', room.name]]
  let tone: NotificationEmailLayout['tone'] = 'info'
  let statusLabel: string | undefined
  let introduction = 'Thông tin hóa đơn và dịch vụ của ' + room.name + '.'
  let conclusion = 'Vui lòng kiểm tra thông tin hóa đơn trong ứng dụng.'
  const compact = type === 'rent_overdue' || type === 'rent_long_unpaid'
  let highlight = room.expected_end_date || date
  let snapshot: ReturnType<typeof getInvoiceEmailSnapshot> | undefined
  let remaining: number | undefined
  if (type === 'rent_overdue' || type === 'rent_long_unpaid' || type === 'invoices_services') {
    if (scenarioId === 'old_debt') {
      rows.push(['Nguồn nợ', 'Nợ cũ của phòng'])
      highlight = money(Number(room.old_debt || 0))
      remaining = room.old_debt
    } else {
      if (type === 'invoices_services') snapshot = getInvoiceEmailSnapshot(invoice)
      remaining = Math.max(0, invoice.total_amount - invoice.paid_amount)
      highlight = money(type === 'invoices_services' ? invoice.total_amount : remaining)
      if (type !== 'rent_long_unpaid')
        rows.push(
          ['Hóa đơn', `${invoice.month}/${invoice.year}`],
          ['Hạn thanh toán', invoice.due_date || date]
        )
    }
    if (type === 'invoices_services') {
      remaining = undefined
    } else {
      tone = scenarioId === 'paid' ? 'success' : scenarioId === 'before15' ? 'info' : 'warning'
      statusLabel =
        scenarioId === 'paid'
          ? 'KHÔNG CÒN NỢ'
          : scenarioId === 'before15'
            ? 'CHƯA ĐẾN HẠN'
            : 'NHẮC CÔNG NỢ'
      title =
        type === 'rent_long_unpaid'
          ? 'Lâu chưa thanh toán'
          : scenarioId === 'paid'
            ? 'Đã thanh toán hết'
            : scenarioId === 'before15'
              ? 'Chưa đến hạn nhắc nợ'
              : 'Nhắc nợ tiền phòng'
      introduction =
        scenarioId === 'paid'
          ? room.name + ' đã trả hết, không còn nợ.'
          : scenarioId === 'before15'
            ? room.name + ' còn hóa đơn chưa thanh toán. Chưa tới ngày 15 để nhắc nợ.'
            : room.name + ' còn khoản nợ chưa thanh toán.'
      conclusion =
        scenarioId === 'paid'
          ? 'Không cần gửi nhắc nợ cho phòng này.'
          : scenarioId === 'before15'
            ? 'Vui lòng theo dõi hạn thanh toán của hóa đơn.'
            : 'Vui lòng kiểm tra và thu hồi công nợ.'
    }
    if (type === 'rent_long_unpaid') rows.push(['Chưa thanh toán', '45 ngày'])
  } else if (type === 'contract_expiring') {
    tone = 'reminder'
    statusLabel = 'HỢP ĐỒNG SẮP HẾT HẠN'
    introduction = 'Hợp đồng của ' + room.name + ' sắp hết hạn.'
    conclusion = 'Vui lòng liên hệ người thuê để thống nhất gia hạn hoặc bàn giao phòng.'
    highlight = 'Còn 7 ngày'
    rows.push(['Ngày hết hạn', new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)])
  } else if (type === 'room_checkout_due') {
    tone = 'reminder'
    statusLabel = scenarioId === 'future' ? 'LỊCH TRẢ PHÒNG' : 'ĐẾN HẠN TRẢ PHÒNG'
    introduction =
      scenarioId === 'future'
        ? room.name + ' chưa đến hạn trả phòng.'
        : room.name + ' đã đến hạn trả phòng.'
    conclusion = 'Vui lòng kiểm tra kế hoạch trả phòng và bàn giao.'
    rows.push(['Hạn trả phòng', room.expected_end_date || date])
  } else if (type === 'sepay_unmatched') {
    tone = scenarioId === 'recorded' ? 'success' : scenarioId === 'awaiting' ? 'info' : 'danger'
    title =
      scenarioId === 'recorded'
        ? 'Giao dịch đã ghi nhận'
        : scenarioId === 'awaiting'
          ? 'Đang chờ ghi nhận'
          : 'Giao dịch chưa khớp'
    statusLabel =
      scenarioId === 'recorded'
        ? 'ĐÃ GHI NHẬN'
        : scenarioId === 'awaiting'
          ? 'CHỜ GHI NHẬN'
          : 'CẦN ĐỐI SOÁT'
    introduction =
      {
        no_invoice: 'Hệ thống nhận được giao dịch nhưng không tìm thấy hóa đơn tương ứng.',
        partial: 'Số tiền chuyển khoản còn thiếu so với hóa đơn. Cần duyệt khoản thu một phần.',
        over: 'Số tiền chuyển khoản vượt số tiền còn phải thu. Cần kiểm tra trước khi ghi nhận.',
        ambiguous: 'Nội dung chuyển khoản chứa hai mã hóa đơn. Cần xác định hóa đơn nhận tiền.',
        awaiting: 'Mã hóa đơn và số tiền đã khớp. Khoản thu đang chờ được lưu.',
        recorded: 'Khoản thu đã được ghi nhận. Không cần gửi cảnh báo đối soát.'
      }[scenarioId] || ''
    conclusion =
      scenarioId === 'recorded'
        ? 'Không gửi lại cảnh báo cho giao dịch này.'
        : scenarioId === 'awaiting'
          ? 'Thư xác nhận sẽ được gửi khi khoản thu được ghi nhận.'
          : 'Vui lòng kiểm tra giao dịch trong mục Đồng bộ SePay.'
    highlight = money(
      scenarioId === 'partial' ? 1000000 : scenarioId === 'over' ? 3500000 : 3000000
    )
    rows.push(['Mã giao dịch', 'TEST-BANK-101'], ['Trạng thái', statusLabel], ['Kênh', 'SePay'])
    if (scenarioId === 'no_invoice' || scenarioId === 'ambiguous')
      rows[0] = ['Phòng', 'Chưa xác định']
    else rows.push(['Hóa đơn tham chiếu', `${invoice.month}/${invoice.year}`])
  }
  if (type !== 'sepay_matched')
    result.mail.html = buildNotificationEmailLayout({
      title,
      tone,
      statusLabel,
      date: new Intl.DateTimeFormat('vi-VN').format(now),
      compact,
      highlightLabel: 'Còn phải thu',
      recipientName: name,
      introduction,
      highlight,
      rows,
      conclusion,
      ...snapshot,
      remaining
    })
  result.mail = {
    subject: `[KIỂM THỬ] ${result.mail.subject}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;padding:12px;background:#f8fafc;"><strong>KIỂM THỬ — Dữ liệu giả, không ghi nhận thanh toán hay thay đổi công nợ.</strong><p style="margin-bottom:0;">Tình huống: ${escapeEmailHtml(scenario.label)}.</p></div>${result.mail.html}`
  }
  return result
}

export type SimulationCheck = {
  name: string
  status: 'pass' | 'blocked' | 'info' | 'unavailable'
  detail: string
}
export type NotificationSimulation = {
  summary: string
  checks: SimulationCheck[]
  wouldSend: boolean
  secondWouldSend: boolean
}

// No DB, IPC, timers or sender imports: a simulation cannot send mail or modify a ledger.
export function simulateNotification(
  testCase: NotificationTestCase,
  user: AppUser,
  gmail: { available: boolean; authenticated?: boolean }
): NotificationSimulation {
  const support = notificationSupport[testCase.type]
  const exists = support.mode !== 'template'
  const eventExists = Boolean(testCase.event || testCase.target)
  const recipient = emailRecipientDecision(user, testCase.type)
  const checks: SimulationCheck[] = [
    { name: 'Luồng thực tế', status: exists ? 'info' : 'unavailable', detail: support.label },
    {
      name: 'Điều kiện phát sinh',
      status: !exists ? 'unavailable' : eventExists ? 'pass' : 'blocked',
      detail: testCase.condition
    },
    {
      name: 'Cài đặt nhận (mô phỏng)',
      status: recipient.allowed ? 'pass' : 'blocked',
      detail: recipient.reason
    },
    {
      name: 'Gmail (mô phỏng)',
      status: gmail.available && gmail.authenticated ? 'pass' : 'blocked',
      detail:
        gmail.available && gmail.authenticated
          ? 'Giả lập Gmail đã kết nối; không kiểm tra kết nối thật và không gửi thư.'
          : 'Giả lập Gmail chưa kết nối.'
    }
  ]
  const key = testCase.event
    ? sepayEmailKey(testCase.event, user.id)
    : testCase.target
      ? manualEmailKey(testCase.target, user.id)
      : ''
  const completed = new Set<string>(testCase.duplicate && key ? [key] : [])
  const first = key ? emailDeliveryDecision(user, testCase.type, key, completed, gmail) : undefined
  const wouldSend = exists && eventExists && first?.status === 'ready'
  if (wouldSend) completed.add(key) // Simulate successful delivery in memory only.
  const second = key ? emailDeliveryDecision(user, testCase.type, key, completed, gmail) : undefined
  const secondWouldSend = exists && eventExists && second?.status === 'ready'
  checks.push({
    name: 'Lượt gửi đầu (mô phỏng)',
    status: wouldSend ? 'pass' : 'blocked',
    detail: wouldSend
      ? 'Sẽ gửi nếu sự kiện xảy ra thật và dịch vụ gửi thành công.'
      : !eventExists
        ? 'Không có thông báo để gửi.'
        : first?.reason || 'Chưa có luồng gửi.'
  })
  checks.push({
    name: 'Lặp lại cùng thông báo',
    status: second?.status === 'duplicate' ? 'pass' : 'info',
    detail:
      second?.status === 'duplicate'
        ? 'Bỏ qua lượt lặp nhờ cùng khóa chống trùng, giả lập lần trước đã gửi thành công.'
        : 'Chưa thể kiểm tra chống trùng vì lượt đầu không đủ điều kiện gửi.'
  })
  return {
    summary: !exists
      ? 'Chưa có luồng thực tế; chỉ xem trước nội dung thư mẫu.'
      : wouldSend
        ? 'Mô phỏng: đủ điều kiện gửi, lượt lặp được bỏ qua.'
        : 'Mô phỏng: thông báo sẽ được bỏ qua hoặc chờ xử lý.',
    checks,
    wouldSend,
    secondWouldSend
  }
}

export function buildNotificationSamplePayload(
  testCase: NotificationTestCase,
  userId: string,
  runId: string
): {
  recipientUserId: string
  eventType: 'email_test'
  subject: string
  html: string
  dedupeKey: string
  payload: Record<string, unknown>
} {
  return {
    recipientUserId: userId,
    eventType: 'email_test',
    ...testCase.mail,
    dedupeKey: `${userId}:notification_sample:${testCase.type}:${runId}`,
    payload: {
      test: true,
      testMode: 'sample',
      notificationType: testCase.type,
      scenarioId: testCase.scenarioId
    }
  }
}
