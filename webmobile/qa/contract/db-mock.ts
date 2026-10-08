import { room, occupiedRoom, tenants, contracts, settings, assets } from './fixtures'
export const getRooms = async () => [room,occupiedRoom]
export const getTenants = async () => tenants
export const getContracts = async () => contracts
export const getRoomAssets = async () => assets
export const getAppSettings = async () => settings
export const getInvoices = async () => []
export const getCollectedDepositAmount = () => 0
export const updateContract = async () => { throw new Error('QA không sửa hợp đồng thật.') }
