import { useEffect, useState, type ReactElement } from 'react'
import PortfolioApp from './PortfolioApp'
import './portfolio-scoped.css'

/** Embedded version of the personal portfolio app, isolated from the rental UI. */
export function PortfolioWalletView(): ReactElement {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'))

  useEffect(() => {
    document.body.classList.add('portfolio-module-mounted')
    const observer = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('theme-light'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      document.body.classList.remove('portfolio-module-mounted')
    }
  }, [])

  return (
    <div className={`investment-portfolio-scope h-full min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-[#090b11]${isLight ? ' theme-light' : ''}`}>
      <PortfolioApp />
    </div>
  )
}
