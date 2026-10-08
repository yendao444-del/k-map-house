import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AuthGate from './AuthGate'
import TenantHome from './TenantHome'
import './styles.css'
import ContractConfirmation from './ContractConfirmation'
createRoot(document.getElementById('root')!).render(<StrictMode>{location.pathname === '/contract-confirmation' ? <ContractConfirmation /> : <AuthGate>{(profile, logout) => profile.mode === 'tenant' ? <TenantHome key={profile.userId} profile={profile} onLogout={logout} /> : <App key={profile.userId} signedIn={profile} onLogout={logout} />}</AuthGate>}</StrictMode>)
