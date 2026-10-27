import type { Room, ActiveContractListItem } from './db'
export type RoomFilters = { occupied: boolean; vacant: boolean; ending: boolean; expiring: boolean }
export function isRoomExpired(room: Room, contract: ActiveContractListItem | undefined, now = new Date()): boolean {
  if (room.status === 'vacant' || room.status === 'maintenance') return false
  const expiration = contract?.expiration_date || room.contract_expiration
  if (!expiration || !/^\d{4}-\d{2}-\d{2}/.test(expiration)) return false
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return expiration.slice(0, 10) <= today
}
export function matchesRoomFilter(room: Room, filters: RoomFilters, query: string, expired: boolean): boolean {
  if (!room.name.toLocaleLowerCase('vi-VN').includes(query.trim().toLocaleLowerCase('vi-VN'))) return false
  if (!Object.values(filters).some(Boolean)) return true
  return (filters.occupied && room.status === 'occupied') || (filters.vacant && room.status === 'vacant') || (filters.ending && room.status === 'ending') || (filters.expiring && expired)
}
