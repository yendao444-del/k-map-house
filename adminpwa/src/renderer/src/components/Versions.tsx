import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState({ pwa: import.meta.env.VITE_APP_VERSION, browser: navigator.userAgent })

  return (
    <ul className="versions">
      <li>PWA v{versions.pwa}</li>
      <li>{versions.browser}</li>
    </ul>
  )
}

export default Versions
