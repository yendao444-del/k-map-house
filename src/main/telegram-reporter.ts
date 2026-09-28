import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

type TelegramConfig = {
  token?: string
  chatId?: string | number
}

type ReportDetails = Record<string, unknown>

const MAX_REPORTS_PER_HOUR = 20
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000
const reportHistory = new Map<string, number>()
let reportCount = 0
let reportWindowStartedAt = Date.now()
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

  const token = envToken || String(fileConfig.token || '').trim()
  const rawChatIds = envChatIds || String(fileConfig.chatId || '').trim()
  const chatIds = rawChatIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return { token, chatIds }
}

function reportSignature(scope: string, details: ReportDetails): string {
  return `${scope}|${String(details.exitCode || '')}`
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
      `Time: ${new Date().toISOString()}`
    ]
    if (typeof details.exitCode === 'number' && Number.isSafeInteger(details.exitCode)) {
      lines.push(`Exit code: ${details.exitCode}`)
    }

    const text = lines.join('\n').slice(0, 3900)
    await Promise.allSettled(chatIds.map((chatId) => sendMessage(token, chatId, text)))
  } catch {
    // A telemetry failure must never crash or block DBY HOME.
  }
}
