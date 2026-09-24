import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { hostname, platform, release, arch } from 'os'
import { join } from 'path'

type TelegramConfig = {
  token?: string
  chatId?: string | number
}

type ReportDetails = Record<string, unknown>

// Bundled fallback keeps production reporting automatic after installation.
// Environment variables and the per-user config file can still override it.
const BUNDLED_TELEGRAM_BOT_TOKEN = '8841287120:AAEUYamxi4sEQpbJulBBU6Ph9wzcTs8InfE'
const BUNDLED_TELEGRAM_CHAT_ID = '1397184795'

const MAX_REPORTS_PER_HOUR = 20
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000
const reportHistory = new Map<string, number>()
let reportCount = 0
let reportWindowStartedAt = Date.now()
let machineId: string | undefined

function readConfig(): { token: string; chatIds: string[] } {
  const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const envChatIds = (process.env.TELEGRAM_ALLOWED_CHAT_ID || '').trim()
  let fileConfig: TelegramConfig = {}

  try {
    const path = join(app.getPath('userData'), 'telegram-config.json')
    if (existsSync(path)) fileConfig = JSON.parse(readFileSync(path, 'utf8')) as TelegramConfig
  } catch {
    // Reporting must never affect application startup.
  }

  const token = envToken || String(fileConfig.token || '').trim() || BUNDLED_TELEGRAM_BOT_TOKEN
  const rawChatIds = envChatIds || String(fileConfig.chatId || '').trim() || BUNDLED_TELEGRAM_CHAT_ID
  const chatIds = rawChatIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return { token, chatIds }
}

function getMachineId(): string {
  if (machineId) return machineId
  try {
    const path = join(app.getPath('userData'), 'installation-id.txt')
    if (existsSync(path)) machineId = readFileSync(path, 'utf8').trim()
    if (!machineId) {
      machineId = `DBY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(path, machineId, 'utf8')
    }
  } catch {
    machineId = hostname()
  }
  return machineId
}

function sanitize(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return (text || '')
    .replace(/(token|password|secret|authorization|apikey|api_key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 1800)
}

function readRecentCrashLog(): string {
  try {
    const path = join(app.getPath('temp'), 'k-map-house-logs', 'main-crash.log')
    if (!existsSync(path)) return ''
    const raw = readFileSync(path, 'utf8')
    return raw.slice(-1200).replace(/(token|password|secret|authorization|apikey|api_key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  } catch {
    return ''
  }
}

function reportSignature(scope: string, details: ReportDetails): string {
  return `${scope}|${String(details.reason || details.message || details.error || '')}|${String(details.exitCode || '')}`
}

async function sendMessage(token: string, chatId: string, text: string): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_notification: true }),
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`)
  } finally {
    clearTimeout(timeout)
  }
}

export async function reportTelegramError(scope: string, details: ReportDetails = {}): Promise<void> {
  try {
    const { token, chatIds } = readConfig()
    if (!token || !chatIds.length) return

    const now = Date.now()
    if (now - reportWindowStartedAt >= 60 * 60 * 1000) {
      reportWindowStartedAt = now
      reportCount = 0
    }
    if (reportCount >= MAX_REPORTS_PER_HOUR) return

    const signature = reportSignature(scope, details)
    const previous = reportHistory.get(signature) || 0
    if (now - previous < DUPLICATE_WINDOW_MS) return
    reportHistory.set(signature, now)
    reportCount += 1

    const lines = [
      'DBY HOME - PRODUCTION ERROR',
      `Scope: ${scope}`,
      `Version: ${app.getVersion()}`,
      `Machine: ${getMachineId()}`,
      `Host: ${hostname()}`,
      `OS: ${platform()} ${release()} ${arch()}`,
      `Electron: ${process.versions.electron}`,
      `Time: ${new Date().toISOString()}`
    ]
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null && value !== '') lines.push(`${key}: ${sanitize(value)}`)
    }
    const recentLog = readRecentCrashLog()
    if (recentLog) lines.push(`Recent log:\n${recentLog}`)

    const text = lines.join('\n').slice(0, 3900)
    await Promise.allSettled(chatIds.map((chatId) => sendMessage(token, chatId, text)))
  } catch {
    // A telemetry failure must never crash or block DBY HOME.
  }
}
