# CW Trainer

Morse code (CW) practice for amateur radio — receive and send training with
realistic band conditions. Runs entirely in the browser.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run test:e2e   # browser tests (first: npx playwright install chromium)
npm run lint && npm run typecheck
```

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Repository → Settings → Pages → Source: **GitHub Actions**.
3. Every push to `main` runs the checks, deploys the site to
   `https://<user>.github.io/<repo>/`, pushes the built site to the `gh-pages`
   branch, and attaches `dist` as a downloadable workflow artifact.

Design: `docs/superpowers/specs/2026-09-29-morse-trainer-design.md`.

## Credits

- Live decoding: [ggmorse](https://github.com/ggerganov/ggmorse) by Georgi Gerganov (MIT),
  vendored in `vendor/ggmorse/`, and the [DeepCW](https://github.com/e04/deepcw-engine)
  neural model by e04 (AGPL-3.0), in `public/models/deepcw/`, run with
  [onnxruntime-web](https://github.com/microsoft/onnxruntime) (MIT).
- Practice content: sentences from [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR), word
  frequencies from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (MIT) —
  see `public/content/SOURCES.md`.

## License

[GNU AGPL-3.0-only](LICENSE). Bundled third-party code, models and content keep their
own licenses (listed above).
