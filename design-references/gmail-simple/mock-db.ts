export const getRooms = async () => []
export const getInvoices = async () => []
export const getEmailNotificationDeliveries = async () => []
export const updateUserProfile = async () => undefined
export const sendEmailNotification = async (payload) => {
  document.getElementById('fixture-status').textContent = `Đã mô phỏng gửi: ${payload.eventType}. Không gửi thư thật.`
  return { ok: true, status: 'sent' }
}
