import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {WORDS, WordTiming} from './timeline';
import platesRaw from '../production/editorial-plates.json';

// Universal Documentary Typography Layer:
// - Automatically groups `public/words.json` into readable 6-9 word phrase captions with active word highlight
// - Renders optional location datelines and turning-point badges from `production/editorial-plates.json`

export interface DatelineSpec {
  t0: number;
  t1: number;
  place: string;
  sub: string;
}

export interface EditorialBadgeSpec {
  t0: number;
  t1: number;
  label: string;
  sub: string;
  color?: string;
  align?: 'left' | 'right';
}

interface PhraseDef {
  t0: number;
  t1: number;
  words: {text: string; start: number; end: number; accent?: boolean}[];
}

function buildAutoPhrases(words: WordTiming[]): PhraseDef[] {
  const phrases: PhraseDef[] = [];
  let bucket: WordTiming[] = [];

  const flush = () => {
    if (!bucket.length) return;
    const t0 = Math.max(0, bucket[0].start - 0.06);
    const t1 = bucket[bucket.length - 1].end + 0.18;
    phrases.push({
      t0,
      t1,
      words: bucket.map((w) => ({
        text: w.word,
        start: w.start,
        end: w.end,
        accent: /[0-9]|[!?.]$/.test(w.word),
      })),
    });
    bucket = [];
  };

  for (let i = 0; i < words.length; i++) {
    const cur = words[i];
    const prev = bucket[bucket.length - 1];
    if (prev && cur.start - prev.end > 0.42) {
      flush();
    }
    bucket.push(cur);
    const endsSentence = /[.!?;:]$/.test(cur.word);
    if (bucket.length >= 9 || (endsSentence && bucket.length >= 4)) {
      flush();
    }
  }
  flush();
  return phrases;
}

export const EditorialGraphics: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const phrases = useMemo(() => buildAutoPhrases(WORDS), []);
  const datelines = ((platesRaw as {datelines?: DatelineSpec[]}).datelines ?? []);
  const badges = ((platesRaw as {badges?: EditorialBadgeSpec[]}).badges ?? []);

  const activeDateline = datelines.find((d) => t >= d.t0 && t <= d.t1);
  const activeBadge = badges.find((b) => t >= b.t0 && t <= b.t1);
  const activePhrase = phrases.find((p) => t >= p.t0 && t <= p.t1);

  return (
    <AbsoluteFill style={{pointerEvents: 'none', fontFamily: '"Georgia", "Times New Roman", serif'}}>
      {activeDateline && (() => {
        const enter = spring({
          frame: Math.max(0, Math.round((t - activeDateline.t0) * fps)),
          fps,
          config: {damping: 18, stiffness: 170, mass: 0.7},
        });
        const exit = interpolate(t, [activeDateline.t1 - 0.25, activeDateline.t1], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            style={{
              position: 'absolute',
              top: 54,
              left: 68,
              opacity: enter * exit,
              transform: `translateY(${(1 - enter) * -14}px)`,
              display: 'flex',
              alignItems: 'stretch',
              background: 'rgba(26, 21, 24, 0.78)',
              backdropFilter: 'blur(6px)',
              borderRadius: 6,
              overflow: 'hidden',
              boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
              border: '1px solid rgba(235, 220, 190, 0.22)',
            }}
          >
            <div style={{width: 6, background: '#d4a646'}} />
            <div style={{padding: '12px 22px 12px 18px'}}>
              <div style={{fontSize: 25, fontWeight: 700, letterSpacing: '0.09em', color: '#fbf6ea', lineHeight: 1.15}}>
                {activeDateline.place}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  color: '#d9c59a',
                  marginTop: 4,
                }}
              >
                {activeDateline.sub}
              </div>
            </div>
          </div>
        );
      })()}

      {activeBadge && (() => {
        const col = activeBadge.color ?? '#a62c24';
        const align = activeBadge.align ?? 'right';
        const localFrame = Math.max(0, Math.round((t - activeBadge.t0) * fps));
        const pop = spring({frame: localFrame, fps, config: {damping: 14, stiffness: 240, mass: 0.6}});
        const fadeOut = interpolate(t, [activeBadge.t1 - 0.22, activeBadge.t1], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const scale = interpolate(pop, [0, 1], [1.18, 1]);
        return (
          <div
            style={{
              position: 'absolute',
              top: 64,
              ...(align === 'left' ? {left: 68} : {right: 68}),
              opacity: Math.min(1, pop * 1.25) * fadeOut,
              transform: `scale(${scale}) rotate(${align === 'left' ? -1.8 : 1.8}deg)`,
              background: '#fbf5e6',
              border: `3px solid ${col}`,
              borderRadius: 6,
              padding: '10px 20px 11px',
              boxShadow: '0 12px 28px rgba(18, 12, 16, 0.34)',
            }}
          >
            <div
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: 800,
                fontSize: 26,
                letterSpacing: '0.08em',
                color: col,
                lineHeight: 1.1,
              }}
            >
              {activeBadge.label}
            </div>
            <div
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: 700,
                fontSize: 13.5,
                letterSpacing: '0.13em',
                color: '#4a4039',
                marginTop: 4,
              }}
            >
              {activeBadge.sub}
            </div>
          </div>
        );
      })()}

      {activePhrase && (() => {
        const fadeIn = interpolate(t, [activePhrase.t0, activePhrase.t0 + 0.12], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const fadeOut = interpolate(t, [activePhrase.t1 - 0.14, activePhrase.t1], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 52,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              opacity: fadeIn * fadeOut,
            }}
          >
            <div
              style={{
                background: 'rgba(22, 18, 22, 0.78)',
                backdropFilter: 'blur(6px)',
                padding: '11px 26px 13px',
                borderRadius: 10,
                border: '1px solid rgba(250, 242, 225, 0.16)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.32)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0 10px',
                maxWidth: 1320,
                justifyContent: 'center',
              }}
            >
              {activePhrase.words.map((w, idx) => {
                const spoken = t >= w.start - 0.03;
                const current = t >= w.start - 0.03 && t <= w.end + 0.08;
                const color = current
                  ? w.accent
                    ? '#f5c453'
                    : '#ffffff'
                  : spoken
                    ? w.accent
                      ? '#ebd08d'
                      : '#f2ece1'
                    : 'rgba(235, 228, 214, 0.62)';
                return (
                  <span
                    key={idx}
                    style={{
                      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                      fontSize: 32,
                      fontWeight: w.accent ? 800 : 650,
                      color,
                      letterSpacing: '0.01em',
                      transform: current ? 'translateY(-1.5px)' : 'none',
                      textShadow: '0 2px 6px rgba(0,0,0,0.45)',
                    }}
                  >
                    {w.text}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};
