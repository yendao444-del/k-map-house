import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const ULTRAVIEWER_REGISTRY_KEY = 'HKLM\\Software\\WOW6432Node\\UltraViewer'
const TELEGRAM_COMMAND = '/ultraview'
const POLL_TIMEOUT_SECONDS = 25
const RETRY_DELAY_MS = 5_000

type TelegramUpdate = {
  update_id?: number
  message?: {
    text?: string
    chat?: { id?: number }
  }
}

type TelegramResponse<T> = {
  ok: boolean
  result?: T
  description?: string
}

const wait = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timeout = setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        resolve()
      },
      { once: true }
    )
  })

const formatUltraViewerId = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

export const readUltraViewerId = async (): Promise<string> => {
  if (process.platform !== 'win32') throw new Error('UltraViewer chỉ được hỗ trợ trên Windows.')
  const { stdout } = await execFileAsync(
    'reg.exe',
    ['query', ULTRAVIEWER_REGISTRY_KEY, '/v', 'PreferID'],
    { windowsHide: true, encoding: 'utf8' }
  )
  const match = stdout.match(/PreferID\s+REG_\w+\s+([^\r\n]+)/i)
  const id = formatUltraViewerId(match?.[1] || '')
  if (!id) throw new Error('Chưa đọc được ID UltraViewer trên máy này.')
  return id
}

const normalizeCommand = (text: string): string =>
  text.trim().split(/\s+/)[0].toLowerCase().replace(/@[^\s]+$/, '')

const telegramRequest = async <T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
  signal: AbortSignal
): Promise<T> => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  })
  const data = (await response.json()) as TelegramResponse<T>
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram trả về HTTP ${response.status}.`)
  }
  return data.result as T
}

const sendUltraViewerId = async (
  token: string,
  chatId: number,
  signal: AbortSignal
): Promise<void> => {
  let text: string
  try {
    text = `ID UltraViewer: ${await readUltraViewerId()}`
  } catch (error) {
    text = error instanceof Error ? error.message : 'Không đọc được ID UltraViewer.'
  }
  await telegramRequest(
    token,
    'sendMessage',
    { chat_id: chatId, text, disable_notification: true },
    signal
  )
}

const parseAllowedChatIds = (value: string): Set<number> =>
  new Set(
    value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isSafeInteger(item))
  )

export const startTelegramUltraViewerBot = (): (() => void) => {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_ID || '')
  if (!token || !allowedChatIds.size) return () => undefined

  const controller = new AbortController()
  const { signal } = controller

  void (async () => {
    let offset = 0
    while (!signal.aborted) {
      try {
        const updates = await telegramRequest<TelegramUpdate[]>(
          token,
          'getUpdates',
          {
            offset,
            timeout: POLL_TIMEOUT_SECONDS,
            allowed_updates: ['message']
          },
          signal
        )
        for (const update of updates || []) {
          if (typeof update.update_id === 'number') offset = Math.max(offset, update.update_id + 1)
          const chatId = update.message?.chat?.id
          const command = normalizeCommand(update.message?.text || '')
          if (
            typeof chatId === 'number' &&
            allowedChatIds.has(chatId) &&
            command === TELEGRAM_COMMAND
          ) {
            await sendUltraViewerId(token, chatId, signal)
          }
        }
      } catch {
        if (!signal.aborted) await wait(RETRY_DELAY_MS, signal)
      }
    }
  })()

  return () => controller.abort()
}
