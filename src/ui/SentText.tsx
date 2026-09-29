import { tokenize } from '../morse/table'

/** Text as Morse tokens; the one being played is highlighted. */
export function SentText({ text, activeToken }: { text: string; activeToken: number | null }) {
  return (
    <>
      {tokenize(text).map((t, i) => (
        <span key={i} className={i === activeToken ? 'now-playing' : undefined} aria-current={i === activeToken ? 'true' : undefined}>
          {t}
        </span>
      ))}
    </>
  )
}
