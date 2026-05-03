import { Capacitor } from '@capacitor/core';
import { mercoDigitalInk } from '@/plugins/mercoDigitalInk';

export const HANDWRITING_MLKIT_RECOGNITION_DEBOUNCE_MS = 80;
export const HANDWRITING_NETWORK_RECOGNITION_DEBOUNCE_MS = 400;
export const HANDWRITING_RECOGNITION_DEBOUNCE_MS = HANDWRITING_NETWORK_RECOGNITION_DEBOUNCE_MS;
export const DEFAULT_HANDWRITING_LANGUAGE_TAG = 'en-IN';

export type HandwritingStroke = { xs: number[]; ys: number[]; ts: number[] };

const HANDWRITING_URL =
  'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';

const isAndroidNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const getHandwritingRecognitionDebounceMs = () =>
  isAndroidNative() ? HANDWRITING_MLKIT_RECOGNITION_DEBOUNCE_MS : HANDWRITING_NETWORK_RECOGNITION_DEBOUNCE_MS;

if (isAndroidNative()) {
  void mercoDigitalInk.prepare({ languageTag: DEFAULT_HANDWRITING_LANGUAGE_TAG }).catch((err) => {
    console.info('ML Kit digital ink prepare unavailable; Google Input Tools fallback remains active.', err);
  });
}

export async function recognizeHandwriting(
  strokes: HandwritingStroke[],
  canvasWidth: number,
  canvasHeight: number,
  signal?: AbortSignal
): Promise<string[]> {
  if (strokes.length === 0) return [];
  if (isAndroidNative()) {
    try {
      const result = await mercoDigitalInk.recognize({
        strokes,
        canvasWidth,
        canvasHeight,
        languageTag: DEFAULT_HANDWRITING_LANGUAGE_TAG,
        maxResults: 5,
      });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      console.debug('Handwriting recognition source:', result.source, {
        durationMs: result.durationMs,
        languageTag: result.languageTag,
        ready: result.ready,
      });
      if (result.ready && result.candidates.length > 0) {
        return result.candidates;
      }
    } catch (err) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      console.info('ML Kit digital ink unavailable; falling back to Google Input Tools.', err);
    }
  }

  const ink = strokes.map(s => [s.xs, s.ys, s.ts]);
  const payload = {
    options: 'enable_pre_space',
    requests: [
      {
        writing_guide: { writing_area_width: canvasWidth, writing_area_height: canvasHeight },
        ink,
        language: 'en',
      },
    ],
  };
  const response = await fetch(HANDWRITING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error('Recognition request failed');
  const data = await response.json();
  if (data[0] === 'SUCCESS' && data[1]?.[0]?.[1]) return data[1][0][1] as string[];
  return [];
}
