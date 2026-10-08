import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getEmailDeliveryAvailability, getUsers, sendEmailNotification, type Invoice, type Room } from './db'
import {
  buildSepayEmail,
  evaluateSepayNotificationTransaction,
  getNewSepayPaymentEmails,
  sepayEmailKey,
  type SepayEmailEvent
} from './sepay-email'
import { createInvoiceTransferIndex, normalizeTransferText } from './invoiceTransfer'
import { emailDeliveryDecision } from './notification-email'

type Transaction = {
  id: string
  reference_number?: string
  amount_in: string | number
  transaction_content?: string
  transaction_date?: string
}

export function useSepayEmailNotifications({
  enabled,
  userId,
  invoices,
  rooms,
  transactions,
  transactionsReady
}: {
  enabled: boolean
  userId?: string
  invoices: Invoice[]
  rooms: Room[]
  transactions: Transaction[]
  transactionsReady: boolean
}): void {
  const client = useQueryClient()
  const since = useRef(Date.now())
  const known = useRef<Set<string> | null>(null)
  const pending = useRef(new Map<string, SepayEmailEvent>())
  const completed = useRef(new Set<string>())
  const busy = useRef(false)
  const { data: gmail } = useQuery({
    queryKey: ['gmail-availability'],
    queryFn: getEmailDeliveryAvailability,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 10_000
  })
  useEffect(() => {
    since.current = Date.now()
    known.current = null
    pending.current.clear()
    completed.current.clear()
  }, [userId])

  useEffect(() => {
    if (!enabled) return
    const roomMap = new Map(rooms.map((room) => [room.id, room.name]))
    const index = createInvoiceTransferIndex(invoices, (id) => roomMap.get(id))
    const incoming = transactions.filter((tx) => Number(tx.amount_in) > 0)
    if (transactionsReady) {
      if (known.current === null) {
        known.current = new Set(
          incoming.map((tx) => normalizeTransferText(tx.reference_number || tx.id))
        )
      } else {
        for (const tx of incoming) {
          const key = normalizeTransferText(tx.reference_number || tx.id)
          if (!key || known.current.has(key)) continue
          known.current.add(key)
          const decision = evaluateSepayNotificationTransaction(tx, invoices, index)
          if (decision.event) pending.current.set(`sepay_unmatched:${key}`, decision.event)
        }
      }
    }
    for (const event of getNewSepayPaymentEmails(invoices, since.current, (id) =>
      roomMap.get(id)
    )) {
      pending.current.set(`sepay_matched:${normalizeTransferText(event.transactionKey)}`, event)
      // If a pending receipt is matched before an email can be sent, avoid a stale alert.
      pending.current.delete(`sepay_unmatched:${normalizeTransferText(event.transactionKey)}`)
    }
    // Once the server worker is enabled it owns SePay email dispatch. The Electron
    // observer must stay silent to avoid duplicate receipts while the app is open.
    if (gmail?.server) return
    if (!gmail?.available || !gmail.authenticated) return
    let disposed = false
    const dispatch = async (): Promise<void> => {
      if (busy.current || pending.current.size === 0 || disposed) return
      busy.current = true
      try {
        const recipients = await getUsers()
        for (const [key, event] of pending.current) {
          if (disposed) break
          let done = true
          for (const recipient of recipients) {
            const dedupeKey = sepayEmailKey(event, recipient.id)
            if (
              emailDeliveryDecision(recipient, event.type, dedupeKey, completed.current, gmail)
                .status !== 'ready'
            )
              continue
            const mail = buildSepayEmail({ ...event, recipientName: recipient.full_name })
            const result = await sendEmailNotification({
              recipientUserId: recipient.id,
              eventType: event.type,
              ...mail,
              dedupeKey,
              payload: { ...event }
            })
            void client.invalidateQueries({ queryKey: ['email-deliveries', recipient.id] })
            if (result.ok) completed.current.add(dedupeKey)
            else {
              done = false
              console.error('Không gửi được thông báo SePay:', result.error)
            }
          }
          if (done) pending.current.delete(key)
        }
      } catch (error) {
        console.error('Không gửi được thông báo SePay:', error)
      } finally {
        busy.current = false
      }
    }
    void dispatch()
    const timer = setInterval(() => {
      void dispatch()
    }, 60_000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [enabled, gmail, invoices, rooms, transactions, transactionsReady, client])
}
