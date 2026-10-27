export interface SepayTransactionTime {
  date: string
  time: string
  full: string
}

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh'

/**
 * SePay commonly sends a local Vietnamese timestamp without an offset. Make
 * that meaning explicit so the display is stable on computers in other zones.
 */
const parseSepayDate = (value: string): { date: Date; hasTime: boolean } | null => {
  const raw = value.trim()
  if (!raw) return null
  const hasTime = /[T ]\d{2}:\d{2}/.test(raw)
  const vietnameseLocal = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?))?$/.exec(raw)
  const normalized = vietnameseLocal && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? `${vietnameseLocal[1]}T${vietnameseLocal[2] || '00:00:00'}+07:00`
    : raw
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : { date, hasTime }
}

export const formatSepayTransactionTime = (value?: string): SepayTransactionTime => {
  if (!value) return { date: '', time: '', full: '' }
  const parsed = parseSepayDate(value)
  if (!parsed) return { date: '', time: '', full: '' }
  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: VIETNAM_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: VIETNAM_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }
  const date = parsed.date.toLocaleDateString('vi-VN', dateOptions)
  const time = parsed.hasTime ? parsed.date.toLocaleTimeString('vi-VN', timeOptions) : ''
  return { date, time, full: time ? `${date} ${time}` : date }
}
