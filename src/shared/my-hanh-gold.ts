export type MyHanhProduct = {
  code: string
  name: string
  metal: 'gold' | 'silver'
  buyPerChi: number
  sellPerChi: number
}

export type MyHanhGoldPrices = {
  success: boolean
  products: MyHanhProduct[]
  source: 'Ước tính theo nhẫn PNJ Hà Nội'
  sourceUrl: 'https://www.vang.today/'
  unit: 'VND/chi'
  quotedAt?: string
  fetchedAt?: string
  stale: boolean
  error?: string
}

export type MyHanhHistoryPoint = {
  date: string
  code: string
  buyPerChi: number
  sellPerChi: number
  quotedAt?: string
}

export type MyHanhGoldHistory = {
  success: boolean
  points: MyHanhHistoryPoint[]
  origin: 'provider' | 'recorded' | 'mixed'
  providerState: 'available' | 'empty' | 'error'
  storageAvailable: boolean
}
