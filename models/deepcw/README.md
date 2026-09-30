# DeepCW model

From https://github.com/e04/deepcw-engine — commit `8e264d243bbd4467bd19f3f28292219405b47e0e`,
licensed AGPL-3.0-only (see `LICENSE`). Files are unmodified.

- `model.onnx` — SHA-256 `ef120799457bca042d4690944f0faf93268eb4654e7f50f28784ad63bdc1fe02`
- `model.onnx.json` — preprocessing and vocabulary metadata

Loaded by `src/decoder/deepcw/worker.ts` only when the DeepCW engine is selected.
