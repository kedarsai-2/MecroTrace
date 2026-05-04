# ML Kit Digital Ink Recognition

The Android APK uses Google ML Kit Digital Ink Recognition for handwriting in scribble pads. The React canvas/UI stays unchanged and still records strokes as `{ xs, ys, ts }`.

## Native Android Path

- Capacitor plugin: `MercoDigitalInk`
- Default language tag: `en-IN`
- Dependency: `com.google.mlkit:digital-ink-recognition:19.0.0`
- Android requirement: `minSdkVersion >= 23`

Public plugin methods:

- `prepare({ languageTag?: string }) -> { ready, downloaded, languageTag }`
- `isReady({ languageTag?: string }) -> { ready, downloaded, languageTag }`
- `recognize({ strokes, canvasWidth, canvasHeight, languageTag?: string, maxResults?: number }) -> { candidates, durationMs, ready, source: "mlkit" }`

`prepare` is called in the background when the handwriting module is loaded so the `en-IN` model can be downloaded before auction use. The first download needs network access and roughly one language model of device storage; after that recognition runs offline.

## Fallback

`client/src/lib/handwritingRecognition.ts` remains the only app-facing recognition API. It uses ML Kit only on native Android through Capacitor. Web, iOS, missing models, native errors, or unavailable plugins fall back to the existing Google Input Tools request.

Debounce targets:

- Android ML Kit: `80 ms`
- Network fallback: `400 ms`

Recognition candidates are normalized in existing component code: uppercase, spaces removed, non-`A-Z0-9` stripped, and existing max-length behavior preserved.
