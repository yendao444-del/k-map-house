import { useEffect, useRef, useState } from 'react'
import { Home, FileText, Wallet, WalletCards, MoreHorizontal, Users, Building2, Package, BarChart3, Settings, X, Receipt, Coins, TrendingUp } from 'lucide-react'

export type MobileTab = 'rooms' | 'invoices' | 'finance' | 'tenants' | 'contracts' | 'assets' | 'reports' | 'settings'
type Destination = { tab: MobileTab; finance?: 'wallet' | 'investments' | 'debt'; report?: 'overview' | 'pnl' | 'deposit' | 'cashflow' | 'utility' }
export function MobileNavigation({ activeTab, onNavigate }: { activeTab: MobileTab; onNavigate: (destination: Destination) => void }): React.JSX.Element {
  const [menu, setMenu] = useState<'more' | 'finance' | null>(null)
  const menuRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!menu) return undefined
    const previous = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(null) }
      if (event.key === 'Tab') {
        const buttons = focusable(), first = buttons[0], last = buttons.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [menu])
  const moreActive = ['tenants', 'contracts', 'assets', 'reports', 'settings'].includes(activeTab)
  const select = (destination: Destination) => { setMenu(null); onNavigate(destination) }
  const items = menu === 'finance' ? [
    { label: 'Ví', icon: WalletCards, destination: { tab: 'finance', finance: 'wallet' } as Destination },
    { label: 'Đầu tư', icon: TrendingUp, destination: { tab: 'finance', finance: 'investments' } as Destination },
    { label: 'Công nợ', icon: Coins, destination: { tab: 'finance', finance: 'debt' } as Destination },
    { label: 'Giao dịch', icon: Receipt, destination: { tab: 'reports', report: 'cashflow' } as Destination }
  ] : [
    { label: 'Khách thuê', icon: Users, destination: { tab: 'tenants' } as Destination },
    { label: 'Hợp đồng', icon: Building2, destination: { tab: 'contracts' } as Destination },
    { label: 'Tài sản', icon: Package, destination: { tab: 'assets' } as Destination },
    { label: 'Tổng quan', icon: BarChart3, destination: { tab: 'reports', report: 'overview' } as Destination },
    { label: 'Kết quả kinh doanh', icon: BarChart3, destination: { tab: 'reports', report: 'pnl' } as Destination },
    { label: 'Quản lý cọc', icon: Coins, destination: { tab: 'reports', report: 'deposit' } as Destination },
    { label: 'Điện / Nước', icon: Receipt, destination: { tab: 'reports', report: 'utility' } as Destination },
    { label: 'Cài đặt', icon: Settings, destination: { tab: 'settings' } as Destination }
  ]
  return <>
    {menu && <div className="pwa-mobile-menu-backdrop" onClick={() => setMenu(null)}>
      <section ref={menuRef} className="pwa-mobile-menu" role="dialog" aria-modal="true" aria-label={menu === 'finance' ? 'Tài chính' : 'Chức năng khác'} onClick={event => event.stopPropagation()}>
        <div className="pwa-mobile-menu-title"><h2>{menu === 'finance' ? 'Tài chính' : 'Chức năng khác'}</h2><button type="button" aria-label="Đóng menu" onClick={() => setMenu(null)}><X size={20} /></button></div>
        <div className="pwa-mobile-menu-grid">{items.map(({ label, icon: Icon, destination }) => <button type="button" key={label} onClick={() => select(destination)}><Icon size={22} /><span>{label}</span></button>)}</div>
      </section>
    </div>}
    <nav className="pwa-bottom-nav" aria-label="Điều hướng chính">
      <button type="button" aria-current={activeTab === 'rooms' ? 'page' : undefined} onClick={() => select({ tab: 'rooms' })}>{activeTab === 'rooms' ? <i className="fa-solid fa-house pwa-nav-house" aria-hidden="true" /> : <Home />}<span>Phòng</span></button>
      <button type="button" aria-current={activeTab === 'invoices' ? 'page' : undefined} onClick={() => select({ tab: 'invoices' })}><FileText /><span>Hóa đơn</span></button>
      <button type="button" aria-current={activeTab === 'finance' ? 'page' : undefined} onClick={() => setMenu(menu === 'finance' ? null : 'finance')} aria-expanded={menu === 'finance'}><Wallet /><span>Tài chính</span></button>
      <button type="button" aria-current={moreActive ? 'page' : undefined} onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-expanded={menu === 'more'}><MoreHorizontal /><span>Thêm</span></button>
    </nav>
  </>
}
