import { KeyboardInput, MobileScroll } from './mobile'
import TenantApp from './app/App'
import './app/styles.css'
export default function Prototype() {
  return <TenantApp framed ScrollContainer={MobileScroll} ReadingInput={KeyboardInput} />
}
