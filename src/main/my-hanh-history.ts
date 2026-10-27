import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { MyHanhHistoryPoint } from '../shared/my-hanh-gold'

const CODES = new Set(['MH9999', 'MH24K', 'MH18K', 'MH16K', 'MH14K', 'MH10K', 'MHSILVER'])
const MAX_POINTS = 20000

export function validHistoryPoint(point: MyHanhHistoryPoint, now = Date.now()): boolean {
  if (!point || !CODES.has(point.code) || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)) return false
  const time = Date.parse(`${point.date}T00:00:00+07:00`)
  return Number.isFinite(time) && new Date(time + 7 * 3600000).toISOString().slice(0, 10) === point.date &&
    time <= now && Number.isSafeInteger(point.buyPerChi) && point.buyPerChi > 0 &&
    Number.isSafeInteger(point.sellPerChi) && point.sellPerChi >= point.buyPerChi && point.sellPerChi <= 1_000_000_000 &&
    (point.quotedAt === undefined || (typeof point.quotedAt === 'string' && point.quotedAt.startsWith(point.date) &&
      Number.isFinite(Date.parse(point.quotedAt)) && Date.parse(point.quotedAt) <= now + 300000))
}

// Latest observed quote per day, not a claimed exchange closing price.
export class MyHanhHistoryStore {
  private points: MyHanhHistoryPoint[] = []
  available = true
  constructor(private file?: string) {
    if (!file || !existsSync(file)) return
    try {
      if (statSync(file).size > 4_000_000) throw new Error('History too large')
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (data.version !== 1 || !Array.isArray(data.points) || data.points.length > MAX_POINTS ||
        !data.points.every((point: MyHanhHistoryPoint) => validHistoryPoint(point))) throw new Error('Invalid stored history')
      this.points = data.points
    } catch {
      // Preserve an unreadable file; do not overwrite the user's history.
      this.available = false
    }
  }
  record(incoming: MyHanhHistoryPoint[]): void {
    const merged = new Map(this.points.map(point => [`${point.code}:${point.date}`, point]))
    for (const point of incoming) {
      if (!validHistoryPoint(point)) continue
      const key = `${point.code}:${point.date}`
      const prior = merged.get(key)
      if (!prior || (point.quotedAt || '') >= (prior.quotedAt || '')) merged.set(key, point)
    }
    const next = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code)).slice(-MAX_POINTS)
    if (JSON.stringify(next) === JSON.stringify(this.points)) return
    this.points = next
    if (!this.file || !this.available) return
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(`${this.file}.tmp`, JSON.stringify({ version: 1, points: next }), 'utf8')
      renameSync(`${this.file}.tmp`, this.file)
    } catch { this.available = false }
  }
  read(): MyHanhHistoryPoint[] { return this.points.map(point => ({ ...point })) }
}
