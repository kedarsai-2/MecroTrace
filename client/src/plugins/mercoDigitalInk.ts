import { registerPlugin } from '@capacitor/core';
import type { HandwritingStroke } from '@/lib/handwritingRecognition';

export type MercoDigitalInkPrepareOptions = {
  languageTag?: string;
};

export type MercoDigitalInkRecognizeOptions = {
  strokes: HandwritingStroke[];
  canvasWidth: number;
  canvasHeight: number;
  languageTag?: string;
  maxResults?: number;
};

export type MercoDigitalInkReadyResult = {
  ready: boolean;
  downloaded: boolean;
  languageTag: string;
};

export type MercoDigitalInkRecognitionResult = MercoDigitalInkReadyResult & {
  candidates: string[];
  durationMs: number;
  source: 'mlkit';
};

export type MercoDigitalInkPlugin = {
  prepare(options?: MercoDigitalInkPrepareOptions): Promise<MercoDigitalInkReadyResult>;
  isReady(options?: MercoDigitalInkPrepareOptions): Promise<MercoDigitalInkReadyResult>;
  recognize(options: MercoDigitalInkRecognizeOptions): Promise<MercoDigitalInkRecognitionResult>;
};

const g = globalThis as unknown as { __mercoDigitalInkPlugin?: MercoDigitalInkPlugin };

export const mercoDigitalInk: MercoDigitalInkPlugin =
  g.__mercoDigitalInkPlugin ??
  (g.__mercoDigitalInkPlugin = registerPlugin<MercoDigitalInkPlugin>('MercoDigitalInk'));
