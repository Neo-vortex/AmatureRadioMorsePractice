import { useSettings } from './store/useSettings'
import { Home } from './ui/pages/Home'
import { useHashRoute } from './ui/useHashRoute'

export default function App() {
  const route = useHashRoute()
  const { loaded } = useSettings()

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#/">
          <span aria-hidden="true">·−</span> CW Trainer
        </a>
        <nav>
          <a href="#/receive" aria-current={route === '/receive' ? 'page' : undefined}>
            Receive
          </a>
        </nav>
      </header>
      <main>{loaded ? <Home /> : <p>Loading…</p>}</main>
    </div>
  )
}
