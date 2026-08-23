import { useEffect, useRef, useState } from 'react'
import { getHanoiWeather, type WeatherKind, type WeatherSnapshot } from '../lib/weather'

const WEATHER_REFRESH_MS = 20 * 60 * 1000
const WEATHER_MODE_STORAGE_KEY = 'an-khang-home:weather-scene:v1'

export interface WeatherSceneStyle {
  imageOpacity: number
  shadeOpacity: number
}

const weatherSceneStyle: Record<WeatherKind, WeatherSceneStyle> = {
  clear: { imageOpacity: 1, shadeOpacity: 0.72 },
  'partly-cloudy': { imageOpacity: 0.9, shadeOpacity: 0.82 },
  cloudy: { imageOpacity: 0.76, shadeOpacity: 0.88 },
  fog: { imageOpacity: 0.62, shadeOpacity: 0.68 },
  drizzle: { imageOpacity: 0.8, shadeOpacity: 0.84 },
  rain: { imageOpacity: 0.72, shadeOpacity: 0.9 },
  storm: { imageOpacity: 0.64, shadeOpacity: 0.94 },
  snow: { imageOpacity: 0.82, shadeOpacity: 0.76 }
}

const weatherIcon: Record<WeatherKind, string> = {
  clear: 'fa-sun',
  'partly-cloudy': 'fa-cloud-sun',
  cloudy: 'fa-cloud',
  fog: 'fa-smog',
  drizzle: 'fa-cloud-rain',
  rain: 'fa-cloud-showers-heavy',
  storm: 'fa-cloud-bolt',
  snow: 'fa-snowflake'
}

const weatherSceneOptions: Array<{
  kind: WeatherKind | null
  label: string
  description: string
  icon: string
}> = [
  {
    kind: null,
    label: 'Theo Hà Nội',
    description: 'Tự động cập nhật',
    icon: 'fa-location-crosshairs'
  },
  { kind: 'clear', label: 'Nắng', description: 'Tia nắng nhẹ', icon: 'fa-sun' },
  { kind: 'partly-cloudy', label: 'Mây nhẹ', description: 'Mây trôi', icon: 'fa-cloud-sun' },
  { kind: 'cloudy', label: 'Nhiều mây', description: 'Trời âm u', icon: 'fa-cloud' },
  { kind: 'fog', label: 'Sương mù', description: 'Lớp sương mỏng', icon: 'fa-smog' },
  { kind: 'drizzle', label: 'Mưa phùn', description: 'Mưa rất nhẹ', icon: 'fa-cloud-rain' },
  { kind: 'rain', label: 'Mưa', description: 'Mưa nhiều lớp', icon: 'fa-cloud-showers-heavy' },
  { kind: 'storm', label: 'Dông', description: 'Mưa và chớp mây', icon: 'fa-cloud-bolt' },
  { kind: 'snow', label: 'Tuyết', description: 'Hạt tuyết rơi', icon: 'fa-snowflake' }
]

function PrecipitationCanvas({ kind }: { kind: WeatherKind }): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!['drizzle', 'rain', 'storm', 'snow'].includes(kind)) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const context = canvas.getContext('2d')
    if (!context) return undefined

    let frameId = 0
    let lastFrame = 0
    let width = 0
    let height = 0
    let particles: Array<{
      x: number
      y: number
      speed: number
      length: number
      opacity: number
      drift: number
      lineWidth: number
    }> = []
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      const density = kind === 'storm' ? 0.000105 : kind === 'rain' ? 0.00009 : 0.000055
      const count = Math.min(
        kind === 'storm' ? 125 : 110,
        Math.max(kind === 'storm' ? 58 : 32, Math.round(width * height * density))
      )
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      particles = Array.from({ length: count }, () => {
        const depth = 0.15 + Math.random() * 0.85
        const stormFactor = kind === 'storm' ? 1.12 : 1
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          speed: kind === 'snow' ? 0.45 + depth * 0.9 : (3.5 + depth * 7.5) * stormFactor,
          length: kind === 'snow' ? 1 + depth * 2.2 : (8 + depth * 22) * stormFactor,
          opacity: kind === 'snow' ? 0.12 + depth * 0.34 : 0.08 + depth * 0.34,
          drift:
            kind === 'snow' ? -0.28 + Math.random() * 0.56 : (-1.15 - depth * 1.55) * stormFactor,
          lineWidth: 0.35 + depth * 0.72
        }
      }).sort((first, second) => first.lineWidth - second.lineWidth)
    }

    const draw = (time: number) => {
      frameId = window.requestAnimationFrame(draw)
      if (document.hidden || time - lastFrame < 33) return
      lastFrame = time
      context.clearRect(0, 0, width, height)

      for (const particle of particles) {
        particle.y += particle.speed
        particle.x += particle.drift
        if (particle.y > height + particle.length || particle.x < -particle.length) {
          particle.y = -particle.length
          particle.x = Math.random() * (width + 80)
        }

        context.beginPath()
        context.globalAlpha = particle.opacity
        if (kind === 'snow') {
          context.fillStyle = '#effffb'
          context.arc(particle.x, particle.y, particle.length, 0, Math.PI * 2)
          context.fill()
        } else {
          context.strokeStyle = kind === 'storm' ? '#cce3e8' : '#b9d4d9'
          context.lineWidth = kind === 'drizzle' ? particle.lineWidth * 0.7 : particle.lineWidth
          context.moveTo(particle.x, particle.y)
          context.lineTo(particle.x + particle.drift * 1.7, particle.y + particle.length)
          context.stroke()
        }
      }
      context.globalAlpha = 1
    }

    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    frameId = window.requestAnimationFrame(draw)
    return () => {
      resizeObserver.disconnect()
      window.cancelAnimationFrame(frameId)
    }
  }, [kind])

  if (!['drizzle', 'rain', 'storm', 'snow'].includes(kind)) return null
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
}

function AtmosphericEffect({ weather }: { weather: WeatherSnapshot }): React.JSX.Element {
  const showClouds = ['partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'storm'].includes(
    weather.kind
  )
  const showSun = weather.kind === 'clear' && weather.isDay
  const showStars = weather.kind === 'clear' && !weather.isDay
  const cloudOpacity =
    weather.kind === 'fog' || weather.kind === 'cloudy'
      ? 0.58
      : weather.kind === 'partly-cloudy'
        ? 0.34
        : 0.43

  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes weather-cloud-drift { from { transform: translate3d(-10%, 0, 0); } to { transform: translate3d(12%, 0, 0); } }
        @keyframes weather-cloud-bank { 0% { transform: translate3d(-7%, 0, 0) scale(1); } 50% { transform: translate3d(1%, -2%, 0) scale(1.04); } 100% { transform: translate3d(8%, 1%, 0) scale(1.01); } }
        @keyframes weather-fog-flow { 0% { transform: translate3d(-12%, 0, 0) scaleX(1.05); } 50% { transform: translate3d(1%, -4px, 0) scaleX(1.1); } 100% { transform: translate3d(13%, 2px, 0) scaleX(1.04); } }
        @keyframes weather-fog-flow-reverse { 0% { transform: translate3d(10%, 2px, 0) scaleX(1.08); } 100% { transform: translate3d(-12%, -3px, 0) scaleX(1.02); } }
        @keyframes weather-sun-breathe { 0%, 100% { opacity: .45; transform: scale(.96) rotate(0deg); } 50% { opacity: .72; transform: scale(1.04) rotate(4deg); } }
        @keyframes weather-star-twinkle { 0%, 100% { opacity: .18; } 50% { opacity: .65; } }
        @keyframes weather-storm-pulse { 0%, 100% { opacity: .025; transform: scale(.98); } 50% { opacity: .09; transform: scale(1.035); } }
        @keyframes weather-lightning { 0%, 70%, 72%, 77%, 100% { opacity: 0; } 71% { opacity: .16; } 73% { opacity: .05; } 74% { opacity: .13; } 76% { opacity: .035; } }
      `}</style>

      {showSun && (
        <div
          className="weather-motion absolute -right-28 -top-36 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(255,244,178,0.48)_0%,rgba(255,202,88,0.22)_25%,rgba(255,190,64,0.06)_52%,transparent_70%)] mix-blend-screen blur-[2px]"
          style={{ animation: 'weather-sun-breathe 8s ease-in-out infinite' }}
        />
      )}

      {showStars && (
        <div
          className="weather-motion absolute inset-0 opacity-55"
          style={{
            animation: 'weather-star-twinkle 5s ease-in-out infinite',
            backgroundImage:
              'radial-gradient(circle at 12% 18%, white 0 1px, transparent 1.5px), radial-gradient(circle at 32% 11%, white 0 1px, transparent 1.5px), radial-gradient(circle at 70% 15%, white 0 1px, transparent 1.5px), radial-gradient(circle at 87% 27%, white 0 1px, transparent 1.5px)'
          }}
        />
      )}

      {showClouds && (
        <>
          <div
            className="weather-motion absolute -left-[18%] top-[2%] h-[38%] w-[142%] blur-2xl"
            style={{
              animation: 'weather-cloud-bank 32s ease-in-out infinite alternate',
              opacity: cloudOpacity,
              backgroundImage:
                'radial-gradient(ellipse at 8% 58%, rgba(190,207,207,.3) 0%, rgba(147,169,171,.2) 20%, transparent 43%), radial-gradient(ellipse at 34% 38%, rgba(205,218,216,.27) 0%, rgba(130,153,157,.15) 24%, transparent 48%), radial-gradient(ellipse at 66% 62%, rgba(171,192,194,.28) 0%, rgba(112,138,143,.15) 23%, transparent 47%), radial-gradient(ellipse at 94% 36%, rgba(190,206,205,.25) 0%, transparent 43%)'
            }}
          />
          <div
            className="weather-motion absolute -left-[12%] top-[24%] h-[34%] w-[128%] blur-3xl"
            style={{
              animation: 'weather-cloud-drift 42s ease-in-out infinite alternate-reverse',
              opacity: cloudOpacity * 0.66,
              backgroundImage:
                'radial-gradient(ellipse at 18% 52%, rgba(131,158,161,.28), transparent 43%), radial-gradient(ellipse at 53% 45%, rgba(153,175,176,.24), transparent 46%), radial-gradient(ellipse at 84% 58%, rgba(117,145,149,.26), transparent 42%)'
            }}
          />
        </>
      )}

      {weather.kind === 'fog' && (
        <>
          <div className="absolute inset-0 bg-[#d7e1de]/[0.055]" />
          <div
            className="weather-motion absolute -left-[22%] top-[24%] h-[18%] w-[145%] blur-xl"
            style={{
              animation: 'weather-fog-flow 18s ease-in-out infinite alternate',
              backgroundImage:
                'linear-gradient(90deg, transparent 0%, rgba(220,232,229,.06) 8%, rgba(218,232,229,.28) 30%, rgba(230,239,236,.2) 57%, rgba(205,221,218,.25) 76%, transparent 100%)'
            }}
          />
          <div
            className="weather-motion absolute -left-[18%] top-[48%] h-[20%] w-[138%] blur-2xl"
            style={{
              animation: 'weather-fog-flow-reverse 24s ease-in-out infinite alternate',
              backgroundImage:
                'linear-gradient(90deg, transparent 0%, rgba(213,227,224,.2) 18%, rgba(235,242,240,.32) 43%, rgba(202,220,217,.13) 70%, rgba(225,235,232,.22) 88%, transparent 100%)'
            }}
          />
          <div
            className="weather-motion absolute -left-[26%] bottom-[5%] h-[24%] w-[152%] blur-2xl"
            style={{
              animation: 'weather-fog-flow 30s ease-in-out infinite alternate-reverse',
              backgroundImage:
                'linear-gradient(90deg, transparent 2%, rgba(194,215,212,.15) 16%, rgba(229,237,234,.3) 38%, rgba(206,224,220,.2) 64%, rgba(230,239,236,.26) 82%, transparent 100%)'
            }}
          />
        </>
      )}
      {weather.kind === 'storm' && (
        <>
          <div
            className="weather-motion absolute -left-[8%] -top-[20%] h-[80%] w-[65%] rounded-full bg-[radial-gradient(circle,rgba(128,188,207,0.24)_0%,rgba(67,116,130,0.09)_42%,transparent_70%)] blur-3xl"
            style={{ animation: 'weather-storm-pulse 7s ease-in-out infinite' }}
          />
          <div
            className="weather-motion absolute inset-0 bg-[radial-gradient(circle_at_22%_8%,rgba(220,241,247,0.72)_0%,rgba(150,196,209,0.25)_28%,transparent_66%)] opacity-0 mix-blend-screen"
            style={{ animation: 'weather-lightning 9.5s ease-out infinite' }}
          />
          <div className="absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(180deg,transparent,rgba(95,146,153,0.055))]" />
        </>
      )}
      <PrecipitationCanvas kind={weather.kind} />
    </div>
  )
}

export function WeatherBackdrop({
  onSceneStyleChange
}: {
  onSceneStyleChange?: (style: WeatherSceneStyle) => void
}): React.JSX.Element {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [manualKind, setManualKind] = useState<WeatherKind | null>(() => {
    try {
      const savedKind = window.localStorage.getItem(WEATHER_MODE_STORAGE_KEY)
      return weatherSceneOptions.some((option) => option.kind === savedKind)
        ? (savedKind as WeatherKind)
        : null
    } catch {
      return null
    }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let activeController: AbortController | null = null

    const refresh = () => {
      activeController?.abort()
      activeController = new AbortController()
      void getHanoiWeather(activeController.signal)
        .then(setWeather)
        .catch(() => undefined)
    }

    refresh()
    const intervalId = window.setInterval(refresh, WEATHER_REFRESH_MS)
    return () => {
      window.clearInterval(intervalId)
      activeController?.abort()
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const visualKind = manualKind ?? weather?.kind

  useEffect(() => {
    if (!visualKind) return
    onSceneStyleChange?.(weatherSceneStyle[visualKind])
  }, [onSceneStyleChange, visualKind])

  if (!weather) return <></>

  const activeScene = weatherSceneOptions.find((option) => option.kind === manualKind)
  const displayedWeather: WeatherSnapshot = manualKind
    ? {
        ...weather,
        kind: manualKind,
        description: activeScene?.label ?? weather.description,
        isDay: manualKind === 'clear' ? true : weather.isDay,
        fromCache: false
      }
    : weather

  return (
    <>
      <AtmosphericEffect weather={displayedWeather} />
      <div ref={menuRef} className="app-no-drag absolute bottom-6 left-6 z-20 hidden sm:block">
        {menuOpen && (
          <section className="absolute bottom-[calc(100%+10px)] left-0 w-[294px] overflow-hidden rounded-2xl border border-white/15 bg-[#071512]/90 p-2.5 text-white shadow-[0_24px_60px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <header className="flex items-center justify-between px-2 pb-2 pt-1">
              <span>
                <strong className="block text-[12px] font-bold">Không gian thời tiết</strong>
                <small className="mt-0.5 block text-[9px] font-medium text-white/45">
                  Chọn bầu không khí bạn thích
                </small>
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-300/10 text-[11px] text-emerald-200">
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
              </span>
            </header>

            <div className="grid grid-cols-2 gap-1.5">
              {weatherSceneOptions.map((option) => {
                const active = option.kind === manualKind
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => {
                      setManualKind(option.kind)
                      try {
                        if (option.kind) {
                          window.localStorage.setItem(WEATHER_MODE_STORAGE_KEY, option.kind)
                        } else {
                          window.localStorage.removeItem(WEATHER_MODE_STORAGE_KEY)
                        }
                      } catch {
                        // The choice still applies to the current session when storage is unavailable.
                      }
                      setMenuOpen(false)
                    }}
                    className={`flex min-h-[54px] items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                      active
                        ? 'border-emerald-300/35 bg-emerald-300/15 text-white'
                        : 'border-transparent bg-white/[0.035] text-white/75 hover:border-white/10 hover:bg-white/[0.075] hover:text-white'
                    } ${option.kind === null ? 'col-span-2' : ''}`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-emerald-300/15 text-emerald-200' : 'bg-white/[0.06] text-white/55'}`}
                    >
                      <i className={`fa-solid ${option.icon} text-[13px]`} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <strong className="block text-[10px] font-bold">{option.label}</strong>
                      <small className="mt-0.5 block truncate text-[8px] font-medium text-white/40">
                        {option.description}
                      </small>
                    </span>
                    {active && (
                      <i
                        className="fa-solid fa-check ml-auto text-[9px] text-emerald-200"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-left text-white shadow-lg shadow-black/20 backdrop-blur-md transition hover:border-white/20 hover:bg-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Đổi không gian thời tiết"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[17px] text-emerald-200">
            <i className={`fa-solid ${weatherIcon[displayedWeather.kind]}`} aria-hidden="true" />
          </span>
          <span className="leading-tight">
            <span className="block text-[12px] font-bold">Hà Nội · {weather.temperature}°C</span>
            <span className="mt-1 block text-[10px] font-medium text-white/60">
              {displayedWeather.description}
              {manualKind ? ' · bạn chọn' : weather.fromCache ? ' · dữ liệu gần nhất' : ''} ·
              Open-Meteo
            </span>
          </span>
          <i
            className={`fa-solid fa-chevron-up ml-1 text-[8px] text-white/35 transition ${menuOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
    </>
  )
}
