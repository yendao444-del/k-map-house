export type WeatherKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'storm'
  | 'snow'

export interface WeatherSnapshot {
  kind: WeatherKind
  temperature: number
  weatherCode: number
  isDay: boolean
  description: string
  observedAt: string
  fromCache: boolean
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number
    weather_code?: number
    is_day?: number
    time?: string
  }
}

const HANOI_WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=21.0285&longitude=105.8542&current=temperature_2m,weather_code,is_day&timezone=Asia%2FBangkok'
const CACHE_KEY = 'an-khang-home:hanoi-weather:v1'
const CACHE_MAX_AGE_MS = 20 * 60 * 1000

const describeWeather = (code: number): Pick<WeatherSnapshot, 'kind' | 'description'> => {
  if (code === 0) return { kind: 'clear', description: 'Trời quang' }
  if (code === 1 || code === 2) return { kind: 'partly-cloudy', description: 'Có mây nhẹ' }
  if (code === 3) return { kind: 'cloudy', description: 'Nhiều mây' }
  if (code === 45 || code === 48) return { kind: 'fog', description: 'Có sương mù' }
  if (code >= 51 && code <= 57) return { kind: 'drizzle', description: 'Mưa phùn' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return {
      kind: 'rain',
      description: code === 65 || code === 67 || code === 82 ? 'Mưa lớn' : 'Có mưa'
    }
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { kind: 'snow', description: 'Có tuyết' }
  }
  if (code >= 95 && code <= 99) return { kind: 'storm', description: 'Có dông' }
  return { kind: 'cloudy', description: 'Thời tiết thay đổi' }
}

const readCache = (): (WeatherSnapshot & { cachedAt: number }) | null => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WeatherSnapshot & { cachedAt?: number }
    if (typeof parsed.cachedAt !== 'number' || typeof parsed.temperature !== 'number') return null
    return { ...parsed, cachedAt: parsed.cachedAt }
  } catch {
    return null
  }
}

export async function getHanoiWeather(signal?: AbortSignal): Promise<WeatherSnapshot> {
  const cached = readCache()
  if (cached && Date.now() - cached.cachedAt < CACHE_MAX_AGE_MS) {
    return { ...cached, fromCache: true }
  }

  try {
    const response = await fetch(HANOI_WEATHER_URL, { signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`Weather request failed: ${response.status}`)

    const payload = (await response.json()) as OpenMeteoResponse
    const current = payload.current
    if (
      typeof current?.temperature_2m !== 'number' ||
      typeof current.weather_code !== 'number' ||
      typeof current.is_day !== 'number'
    ) {
      throw new Error('Weather response is incomplete')
    }

    const mapped = describeWeather(current.weather_code)
    const snapshot: WeatherSnapshot = {
      ...mapped,
      temperature: Math.round(current.temperature_2m),
      weatherCode: current.weather_code,
      isDay: current.is_day === 1,
      observedAt: current.time ?? new Date().toISOString(),
      fromCache: false
    }

    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...snapshot, cachedAt: Date.now() }))
    return snapshot
  } catch (error) {
    if (signal?.aborted) throw error
    if (cached) return { ...cached, fromCache: true }
    throw error
  }
}
