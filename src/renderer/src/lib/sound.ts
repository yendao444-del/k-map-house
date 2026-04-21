/**
 * Lightweight UI sound system using Web Audio API.
 * No external audio files are needed, so Electron builds stay simple.
 */
type SoundName =
  | 'click'
  | 'nav'
  | 'focus'
  | 'select'
  | 'open'
  | 'close'
  | 'confirm'
  | 'success'
  | 'create'
  | 'notification'
  | 'payment'
  | 'delete'
  | 'error'

type Note = {
  freq: number
  duration: number
  gain?: number
  type?: OscillatorType
}

const MASTER_GAIN_MULTIPLIER = 1.8
const MAX_GAIN = 0.75
const MIN_GAP_MS = 45

let audioCtx: AudioContext | null = null
let lastSoundAt = 0
let globalEffectsInstalled = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null

  try {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtor) return null
      audioCtx = new AudioCtor()
    }

    if (audioCtx.state === 'suspended') {
      void audioCtx.resume()
    }

    return audioCtx
  } catch {
    return null
  }
}

function playTone(notes: Note[], fallbackType: OscillatorType = 'sine') {
  const nowMs = performance.now()
  if (nowMs - lastSoundAt < MIN_GAP_MS) return
  lastSoundAt = nowMs

  const ctx = getCtx()
  if (!ctx) return

  let startTime = ctx.currentTime
  notes.forEach(({ freq, duration, gain = 0.18, type }) => {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    const noteGain = Math.min(gain * MASTER_GAIN_MULTIPLIER, MAX_GAIN)

    osc.type = type || fallbackType
    osc.frequency.setValueAtTime(freq, startTime)
    osc.connect(gainNode)
    gainNode.connect(ctx.destination)

    gainNode.gain.setValueAtTime(0.0001, startTime)
    gainNode.gain.linearRampToValueAtTime(noteGain, startTime + 0.008)
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

    osc.start(startTime)
    osc.stop(startTime + duration + 0.01)
    startTime += duration * 0.82
  })
}

function textOf(el: Element): string {
  return (el.textContent || '').trim().toLocaleLowerCase('vi-VN')
}

function hasAnyClass(el: Element, values: string[]): boolean {
  const className = el.getAttribute('class') || ''
  return values.some((value) => className.includes(value))
}

function inferButtonSound(el: HTMLElement): SoundName {
  const explicit = el.dataset.sound as SoundName | 'off' | undefined
  if (explicit && explicit !== 'off') return explicit

  const label = textOf(el)
  const icon = el.querySelector('i')?.getAttribute('class') || ''
  const aria = (el.getAttribute('aria-label') || '').toLocaleLowerCase('vi-VN')
  const combined = `${label} ${aria} ${icon}`

  if (
    /trash|xoa|xoá|huy|hủy|delete|remove|red-|bg-red/.test(combined) ||
    hasAnyClass(el, ['text-red', 'bg-red'])
  ) {
    return 'delete'
  }

  if (/dong|đóng|huy|hủy|xmark|close|back|arrow-left/.test(combined)) {
    return 'close'
  }

  if (/thu tien|thu tiền|thanh toan|thanh toán|payment|money|cash|bank/.test(combined)) {
    return 'payment'
  }

  if (/tao|tạo|them|thêm|lap|lập|add|plus|file-invoice/.test(combined)) {
    return 'open'
  }

  if (
    /luu|lưu|xac nhan|xác nhận|check|save|submit/.test(combined) ||
    el.getAttribute('type') === 'submit'
  ) {
    return 'confirm'
  }

  if (/tab|menu|chevron|filter|settings|gear/.test(combined)) {
    return 'nav'
  }

  return 'click'
}

function isInteractive(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  return Boolean(
    el.closest(
      'button, a, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], select'
    )
  )
}

function nearestInteractive(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  return target.closest(
    'button, a, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], select'
  )
}

function playInferredClick(target: EventTarget | null) {
  const el = nearestInteractive(target)
  if (!el || !isInteractive(el)) return
  if (el.dataset.sound === 'off') return
  if ('disabled' in el && (el as HTMLButtonElement).disabled) return
  if (el.getAttribute('aria-disabled') === 'true') return

  const tag = el.tagName.toLowerCase()
  const input = el instanceof HTMLInputElement ? el : null

  if (tag === 'select') {
    playSelect()
    return
  }

  if (input?.type === 'checkbox' || input?.type === 'radio') {
    playSelect()
    return
  }

  playUi(inferButtonSound(el))
}

function playFocusFor(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return
  if (!target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select')) return
  if ((target as HTMLInputElement).readOnly || (target as HTMLInputElement).disabled) return
  playFocus()
}

export function installGlobalSoundEffects(root: Document = document): () => void {
  if (globalEffectsInstalled) return () => undefined
  globalEffectsInstalled = true

  const onPointerDown = () => {
    void getCtx()?.resume()
  }
  const onClick = (event: MouseEvent) => playInferredClick(event.target)
  const onFocusIn = (event: FocusEvent) => playFocusFor(event.target)
  const onInvalid = () => playError()

  root.addEventListener('pointerdown', onPointerDown, { capture: true })
  root.addEventListener('click', onClick, { capture: true })
  root.addEventListener('focusin', onFocusIn, { capture: true })
  root.addEventListener('invalid', onInvalid, { capture: true })

  return () => {
    root.removeEventListener('pointerdown', onPointerDown, { capture: true })
    root.removeEventListener('click', onClick, { capture: true })
    root.removeEventListener('focusin', onFocusIn, { capture: true })
    root.removeEventListener('invalid', onInvalid, { capture: true })
    globalEffectsInstalled = false
  }
}

export function playUi(name: SoundName) {
  switch (name) {
    case 'nav':
      return playNav()
    case 'focus':
      return playFocus()
    case 'select':
      return playSelect()
    case 'open':
      return playOpen()
    case 'close':
      return playClose()
    case 'confirm':
      return playConfirm()
    case 'success':
      return playSuccess()
    case 'create':
      return playCreate()
    case 'notification':
      return playNotification()
    case 'payment':
      return playPayment()
    case 'delete':
      return playDelete()
    case 'error':
      return playError()
    default:
      return playClick()
  }
}

export function playClick() {
  playTone([{ freq: 620, duration: 0.045, gain: 0.12 }], 'sine')
}

export function playNav() {
  playTone([{ freq: 480, duration: 0.055, gain: 0.14 }], 'triangle')
}

export function playFocus() {
  playTone([{ freq: 760, duration: 0.035, gain: 0.08 }], 'sine')
}

export function playSelect() {
  playTone(
    [
      { freq: 540, duration: 0.045, gain: 0.12 },
      { freq: 680, duration: 0.055, gain: 0.1 }
    ],
    'triangle'
  )
}

export function playOpen() {
  playTone(
    [
      { freq: 392, duration: 0.055, gain: 0.13 },
      { freq: 523, duration: 0.075, gain: 0.14 }
    ],
    'sine'
  )
}

export function playClose() {
  playTone(
    [
      { freq: 520, duration: 0.045, gain: 0.11 },
      { freq: 360, duration: 0.065, gain: 0.1 }
    ],
    'triangle'
  )
}

export function playConfirm() {
  playTone(
    [
      { freq: 660, duration: 0.05, gain: 0.13 },
      { freq: 880, duration: 0.075, gain: 0.14 }
    ],
    'triangle'
  )
}

export function playSuccess() {
  playTone(
    [
      { freq: 523, duration: 0.09, gain: 0.16 },
      { freq: 784, duration: 0.15, gain: 0.18 }
    ],
    'sine'
  )
}

export function playPayment() {
  playTone(
    [
      { freq: 988, duration: 0.045, gain: 0.14 },
      { freq: 1319, duration: 0.06, gain: 0.16 },
      { freq: 1568, duration: 0.13, gain: 0.18 }
    ],
    'triangle'
  )
}

export function playCreate() {
  playTone(
    [
      { freq: 440, duration: 0.07, gain: 0.14 },
      { freq: 554, duration: 0.07, gain: 0.14 },
      { freq: 659, duration: 0.08, gain: 0.15 },
      { freq: 880, duration: 0.13, gain: 0.17 }
    ],
    'sine'
  )
}

export function playNotification() {
  playTone(
    [
      { freq: 740, duration: 0.06, gain: 0.13 },
      { freq: 988, duration: 0.075, gain: 0.14 },
      { freq: 880, duration: 0.11, gain: 0.12 }
    ],
    'triangle'
  )
}

export function playDelete() {
  playTone(
    [
      { freq: 440, duration: 0.075, gain: 0.14 },
      { freq: 330, duration: 0.12, gain: 0.14 }
    ],
    'square'
  )
}

export function playError() {
  playTone(
    [
      { freq: 300, duration: 0.11, gain: 0.14 },
      { freq: 250, duration: 0.16, gain: 0.14 }
    ],
    'sawtooth'
  )
}
