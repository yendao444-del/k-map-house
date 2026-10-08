export type MeterContext = { previousReading: number | null; purpose?: 'handover'; elapsedDays?: number; maxDailyUsage?: number; recentDailyUsage?: number[]; spikeMultiplier?: number; minimumSpikeDailyUsage?: number }
export type ReadingAssessment = { status: 'pass' | 'retake' | 'review'; reason: string; usage: number | null }
export const demoMeterContexts: Record<string, Record<'electric' | 'water', MeterContext>>
export function assessReading(reading: number, meter: 'electric' | 'water', context?: MeterContext): ReadingAssessment
