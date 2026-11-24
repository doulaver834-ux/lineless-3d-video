import wordsRaw from '../public/words.json';

export const FPS = 30;
export const DURATION_SEC = 19.8;
export const TOTAL_FRAMES = Math.round(DURATION_SEC * FPS); // 594 frames

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  orig_start?: number;
  orig_end?: number;
}

export const WORDS: WordTiming[] = wordsRaw as WordTiming[];

// Format expected by style2Rig.js speechOpen(): [[start, end, syllables], ...]
export const STYLE2_WORDS: [number, number, number][] = WORDS.map((w) => {
  const clean = w.word.toLowerCase().replace(/[^a-z]/g, '');
  const vowelGroups = clean.match(/[aeiouy]+/g);
  const syllables = Math.max(1, vowelGroups ? vowelGroups.length : 1);
  return [w.start, w.end, syllables];
});

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const spanProgress = (t: number, t0: number, t1: number) =>
  clamp((t - t0) / Math.max(1e-5, t1 - t0), 0, 1);
export const ease = (x: number) => {
  const u = clamp(x, 0, 1);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
export const smoother = (x: number) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (6 * u - 15) + 10);
};
