import { useSettings } from './store/useSettings'
import { Home } from './ui/pages/Home'
import { Receive } from './ui/pages/Receive'
import { useHashRoute } from './ui/useHashRoute'

export default function App() {
  const route = useHashRoute()
  const { settings, update, loaded } = useSettings()

  let page = <Home />
  if (route === '/receive') page = <Receive settings={settings} update={update} />

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
      <main>{loaded ? page : <p>Loading…</p>}</main>
      <footer className="app-footer">
        Sentences from <a href="https://tatoeba.org">Tatoeba</a> (CC BY 2.0 FR) · word frequencies from{' '}
        <a href="https://github.com/hermitdave/FrequencyWords">FrequencyWords</a> (MIT) ·{' '}
        <a href={`${import.meta.env.BASE_URL}content/SOURCES.md`}>sources</a>
      </footer>
    </div>
  )
}
