import type { AppUser, Tenant } from '../../../src/renderer/src/lib/db'
export const staff: AppUser = {id:'qa-admin',username:'admin',email:'admin@example.invalid',full_name:'Quản trị viên kiểm thử',role:'admin',status:'active',created_at:'2026-10-01'}
export const tenants: Tenant[] = [
  {id:'qa-tenant',full_name:'Nguyễn Minh Anh',email:'minhanh@example.invalid',phone:'0900000000',is_active:true,created_at:'2026-10-01',updated_at:'2026-10-01'},
  {id:'qa-new',full_name:'Trần Hoài Nam',email:'hoainam@example.invalid',is_active:true,created_at:'2026-10-01',updated_at:'2026-10-01'}
]
export const getTenants = async () => tenants
export const getRooms = async () => [{id:'qa-room',name:'101',floor:1,area:22,status:'occupied',base_rent:3000000}]
export const getContracts = async () => [{id:'qa-contract',room_id:'qa-room',tenant_id:'qa-tenant',tenant_name:tenants[0].full_name,status:'active',move_in_date:'2026-10-01',created_at:'2026-10-01',deposit_amount:3000000,base_rent:3000000}]
export const getInvoices = async () => []
export const getMoveInReceiptsByTenant = async () => []
export const getCollectedDepositAmount = () => 3000000
export const getCurrentSessionUser = async () => ({role:'admin',status:'active'})
export const getCurrentAccessToken = async () => { throw new Error('Không có token thật trong QA') }
const forbid = async () => {throw new Error('Không sửa hồ sơ trong QA')}
export const createTenant = forbid, updateTenant = forbid, deleteTenant = forbid, markTenantLeft = forbid
export const getUsers = async () => [staff, {...staff,id:'qa-employee',username:'employee',full_name:'Nhân viên kiểm thử',email:'employee@example.invalid',role:'user'}]
export const getAppSettings = async () => ({})
export const getSepayTokenStatus = async () => ({configured:false})
export const getServiceZones = async () => []
export const getEmailNotificationDeliveries = async () => []
export const createServiceZone = forbid, createUser = forbid, createUserViaAdmin = forbid,
  deleteServiceZone = forbid, deleteUser = forbid, setSepayToken = forbid,
  resetUserPassword = forbid, changeOwnPassword = forbid, updateAppSettings = forbid,
  updateServiceZone = forbid, updateUserProfile = forbid, updateUserRole = forbid,
  updateUserStatus = forbid, sendEmailNotification = forbid
