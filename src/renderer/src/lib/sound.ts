/** Payment receipt chime and voice announcements. Routine UI actions stay silent. */
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
let paymentAudioUnlockInstalled = false
let paymentAnnouncementQueue: Promise<void> = Promise.resolve()

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

// A user gesture unlocks the receipt chime without playing a UI sound.
export function installPaymentAudioUnlock(root: Document = document): () => void {
  if (paymentAudioUnlockInstalled) return () => undefined
  paymentAudioUnlockInstalled = true

  const unlock = () => {
    void getCtx()?.resume()
  }
  root.addEventListener('pointerdown', unlock, { capture: true })
  root.addEventListener('keydown', unlock, { capture: true })

  return () => {
    root.removeEventListener('pointerdown', unlock, { capture: true })
    root.removeEventListener('keydown', unlock, { capture: true })
    paymentAudioUnlockInstalled = false
  }
}

function playPayment() {
  playTone(
    [
      { freq: 988, duration: 0.045, gain: 0.14 },
      { freq: 1319, duration: 0.06, gain: 0.16 },
      { freq: 1568, duration: 0.13, gain: 0.18 }
    ],
    'triangle'
  )
}

export function announcePaymentAmount(amount: number): Promise<void> {
  const roundedAmount = Math.round(Number(amount))
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) return Promise.resolve()

  const announce = async () => {
    playPayment()

    try {
      const result = await window.api.tts.synthesizePayment(roundedAmount)
      if (!result.ok || !result.audioBase64) {
        throw new Error(result.error || 'Không nhận được dữ liệu giọng đọc.')
      }

      const audio = new Audio('data:audio/mpeg;base64,' + result.audioBase64)
      audio.volume = 1
      await audio.play()
      await new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(resolve, 20_000)
        const finish = () => {
          window.clearTimeout(timeoutId)
          resolve()
        }
        audio.addEventListener('ended', finish, { once: true })
        audio.addEventListener('error', finish, { once: true })
      })
    } catch (error) {
      console.warn('Không thể đọc thông báo tiền vào, đã phát chuông dự phòng:', error)
    }
  }

  paymentAnnouncementQueue = paymentAnnouncementQueue.catch(() => undefined).then(announce)
  return paymentAnnouncementQueue
}
