export const supabase = {from:()=>{throw new Error('QA không nối Supabase')},functions:{invoke:()=>{throw new Error('QA không gọi backend thật')}}}
export const safeQuery = () => {throw new Error('QA không gọi backend thật')}
