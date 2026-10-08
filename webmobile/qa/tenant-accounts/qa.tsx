import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsTab } from '../../../src/renderer/src/components/SettingsTab'
import { staff } from './db-mock'
import '../../../src/renderer/src/assets/main.css'
import '../../../src/renderer/src/assets/font-awesome.css'
const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
window.api = { gmail: {getAvailability: async () => ({available:false,authenticated:false})} } as Window['api']
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><div className="flex min-h-screen flex-col bg-slate-50"><p className="p-3 text-xs text-slate-500">Kiểm thử độc lập · Không ghi vào Supabase</p><SettingsTab initialTab="users" currentUser={staff} /></div></QueryClientProvider>)
