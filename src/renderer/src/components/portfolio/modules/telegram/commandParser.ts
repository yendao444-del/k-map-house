import type { InboxSource, TelegramInboxParsedPayload, TransactionType } from '../../services/portfolioApi'

const PARSER_VERSION = 'telegram-v2'

const CRYPTO_SYMBOLS = new Set([
  'BTC',
  'ETH',
  'BNB',
  'SOL',
  'ADA',
  'XRP',
  'DOGE',
  'DOT',
  'AVAX',
  'LINK',
  'LTC',
  'UNI',
  'SHIB',
  'MATIC',
  'USDT',
])

type ParseSuccess = {
  source: InboxSource
  rawText: string
  parserVersion: string
  parseError?: string
  draftTransaction: TelegramInboxParsedPayload
}

type ParseFailure = {
  source: InboxSource
  rawText: string
  parserVersion: string
  parseError: string
  draftTransaction?: undefined
}

export type ParsedTelegramInboxInput = ParseSuccess | ParseFailure

function parseNumber(value: string): number {
  return Number(value.replace(/,/g, ''))
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function currentTimestamp(): string {
  return new Date().toISOString()
}

function inferAsset(symbol: string) {
  const normalized = symbol.toUpperCase()

  if (normalized === 'GOLD' || normalized === 'VANG' || normalized === 'SJC') {
    return { assetSymbol: 'VMIENG', unit: 'luong', isCrypto: false, label: 'Vang mieng' }
  }

  if (CRYPTO_SYMBOLS.has(normalized)) {
    return { assetSymbol: normalized, unit: 'coin', isCrypto: true, label: normalized }
  }

  return { assetSymbol: normalized, unit: 'don vi', isCrypto: false, label: normalized }
}

function buildParsedPayload(
  transactionType: TransactionType,
  assetToken: string,
  quantityRaw: string | undefined,
  priceRaw: string | undefined,
): { draftTransaction: TelegramInboxParsedPayload; parseError?: string } | string {
  if (!assetToken || !quantityRaw) {
    return 'Lenh hop le: /mua HPG 100 hoac /ban ADA 100'
  }

  const quantity = parseNumber(quantityRaw)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 'So luong khong hop le.'
  }
  const asset = inferAsset(assetToken)
  const actionLabel = transactionType === 'buy' ? 'Mua' : 'Ban'

  if (!priceRaw) {
    return {
      parseError: 'Da nhan lenh mua/ban, nhung ban chua nhap gia. Hay bo sung gia trong app truoc khi duyet.',
      draftTransaction: {
        date: currentDate(),
        occurredAt: currentTimestamp(),
        transactionType,
        assetSymbol: asset.assetSymbol,
        amountVnd: 0,
        note: `[telegram] ${actionLabel} ${quantity} ${asset.label} (thieu gia)`,
        quantity,
        unit: asset.unit,
        capitalAmountVnd: 0,
        feeVnd: 0,
        walletImpactVnd: 0,
        linkedAssetSymbol: asset.assetSymbol,
        fundingSource: 'wallet',
        parserVersion: PARSER_VERSION,
        summary: `${actionLabel} ${quantity} ${asset.label} (cho bo sung gia)`,
      },
    }
  }

  const unitPriceInput = parseNumber(priceRaw)
  if (!Number.isFinite(unitPriceInput) || unitPriceInput <= 0) {
    return 'Gia khong hop le.'
  }

  const unitPriceVnd = Math.round(unitPriceInput)
  const amountVnd = Math.round(quantity * unitPriceVnd)
  const priceLabel = `${unitPriceInput.toLocaleString('vi-VN')} VND`
  const summary = `${actionLabel} ${quantity} ${asset.label} @ ${priceLabel}`

  return {
    draftTransaction: {
      date: currentDate(),
      occurredAt: currentTimestamp(),
      transactionType,
      assetSymbol: asset.assetSymbol,
      amountVnd,
      note: `[telegram] ${summary}`,
      quantity,
      unit: asset.unit,
      unitPriceVnd,
      capitalAmountVnd: amountVnd,
      feeVnd: 0,
      walletImpactVnd: transactionType === 'buy' ? -amountVnd : amountVnd,
      linkedAssetSymbol: asset.assetSymbol,
      fundingSource: 'wallet',
      parserVersion: PARSER_VERSION,
      summary,
    },
  }
}

export function parseTelegramCommand(rawText: string): ParsedTelegramInboxInput {
  const normalized = rawText.trim().replace(/\s+/g, ' ')

  if (!normalized) {
    return {
      source: 'telegram',
      rawText,
      parserVersion: PARSER_VERSION,
      parseError: 'Noi dung lenh trong.',
    }
  }

  const [actionRaw, assetToken, quantityRaw, priceRaw] = normalized.split(' ')
  const action = actionRaw.toLowerCase().replace(/^\//, '')

  const actionMap: Record<string, TransactionType> = {
    mua: 'buy',
    ban: 'sell',
  }

  if (action === 'ping') {
    return {
      source: 'telegram',
      rawText: normalized,
      parserVersion: PARSER_VERSION,
      parseError: 'Hệ thống phản hồi: Pong! Bot và phần mềm của bạn đang hoạt động bình thường.',
    }
  }

  const transactionType = actionMap[action]
  if (!transactionType) {
    return {
      source: 'telegram',
      rawText: normalized,
      parserVersion: PARSER_VERSION,
      parseError: 'Lenh chua duoc ho tro. Dung /mua hoac /ban hoặc /ping.',
    }
  }

  const parsed = buildParsedPayload(transactionType, assetToken || '', quantityRaw, priceRaw)
  if (typeof parsed === 'string') {
    return {
      source: 'telegram',
      rawText: normalized,
      parserVersion: PARSER_VERSION,
      parseError: parsed,
    }
  }

  return {
    source: 'telegram',
    rawText: normalized,
    parserVersion: PARSER_VERSION,
    parseError: parsed.parseError,
    draftTransaction: parsed.draftTransaction,
  }
}
