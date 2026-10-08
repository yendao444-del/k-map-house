// Demo context only. Production must load the active contract/meter from the
// authenticated backend, never accept the old reading or limits from a client.
export const demoMeterContexts = {
  'demo-current-101': {
    electric: { previousReading: 12600, elapsedDays: 30, maxDailyUsage: 40, recentDailyUsage: [3, 3.2, 3.4], spikeMultiplier: 3, minimumSpikeDailyUsage: 5 },
    water: { previousReading: 280, elapsedDays: 30, maxDailyUsage: 2, recentDailyUsage: [.23, .25, .27], spikeMultiplier: 3, minimumSpikeDailyUsage: .5 }
  },
  'demo-current-102': {
    electric: { previousReading: null, purpose: 'handover' },
    water: { previousReading: null, purpose: 'handover' }
  }
}

export function assessReading(reading, meter, context) {
  const unit = meter === 'electric' ? 'kWh' : 'm³'
  if (!['electric', 'water'].includes(meter) || !Number.isSafeInteger(reading) || reading < 0 || reading > 99_999_999) return { status: 'retake', reason: 'Chỉ số không hợp lệ. Hãy chụp lại công tơ.', usage: null }
  if (!context) return { status: 'review', reason: 'Chưa có thông tin công tơ để kiểm tra. Chủ nhà cần cập nhật trước khi xác nhận.', usage: null }
  if (context.previousReading === null && context.purpose === 'handover') return { status: 'pass', reason: '', usage: null }
  const old = context.previousReading
  if (!Number.isSafeInteger(old) || old < 0 || !Number.isFinite(context.elapsedDays) || context.elapsedDays <= 0 || !Number.isFinite(context.maxDailyUsage) || context.maxDailyUsage <= 0) return { status: 'review', reason: 'Thiếu chỉ số kỳ trước hoặc cấu hình kỳ ghi số. Chủ nhà cần kiểm tra.', usage: null }
  const usage = reading - old
  if (usage < 0) return { status: 'retake', reason: `Chỉ số mới ${reading} nhỏ hơn số cũ ${old} ${unit}. Hãy kiểm tra đúng công tơ và chụp lại. Nếu đã thay công tơ, cần chủ nhà cập nhật.`, usage }
  if (usage / context.elapsedDays > context.maxDailyUsage) return { status: 'review', reason: `Mức tăng ${usage} ${unit} vượt giới hạn kiểm tra của kỳ này. Hãy chụp lại; nếu vẫn đúng, cần chủ nhà kiểm tra trước khi lập hóa đơn.`, usage }
  const recent = (context.recentDailyUsage || []).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (recent.length >= 3 && Number.isFinite(context.spikeMultiplier) && context.spikeMultiplier > 1 && Number.isFinite(context.minimumSpikeDailyUsage) && context.minimumSpikeDailyUsage >= 0) {
    const middle = Math.floor(recent.length / 2)
    const median = recent.length % 2 ? recent[middle] : (recent[middle - 1] + recent[middle]) / 2
    const limit = Math.max(median * context.spikeMultiplier, context.minimumSpikeDailyUsage)
    if (usage / context.elapsedDays > limit) return { status: 'review', reason: `Mức tăng ${usage} ${unit} cao bất thường so với các kỳ gần đây. Hãy chụp lại; nếu vẫn đúng, cần chủ nhà kiểm tra.`, usage }
  }
  return { status: 'pass', reason: '', usage }
}
