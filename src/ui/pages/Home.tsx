export function Home() {
  return (
    <div className="home">
      <h1>Learn Morse code for amateur radio</h1>
      <p className="lead">
        Practise copying CW by ear at your own speed. Pick a difficulty level, listen, type what you hear, and
        see exactly which characters you missed.
      </p>
      <div className="cards">
        <a className="card" href="#/receive">
          <h2>Receive practice</h2>
          <p>Listen to Morse and type what you hear. Adjustable speed and difficulty.</p>
        </a>
      </div>
    </div>
  )
}
