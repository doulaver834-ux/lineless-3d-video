import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {WORDS} from './timeline';

// Universal Historical / Narrative Editorial Typography:
// - Clean documentary location datelines (NO classroom header, NO marble bust teacher, NO "F" grade!)
// - Sparse diegetic editorial callouts synchronized to spoken turning points
// - Semantic phrase captions with active word highlight

interface PhraseDef {
  t0: number;
  t1: number;
  words: {text: string; start: number; end: number; accent?: boolean}[];
}

const PHRASES: PhraseDef[] = [
  {
    t0: 0.08,
    t1: 2.52,
    words: [
      {text: 'Then,', start: 0.10, end: 0.58},
      {text: 'Custer', start: 0.86, end: 0.98, accent: true},
      {text: 'made', start: 0.98, end: 1.16},
      {text: 'accusations', start: 1.16, end: 1.62, accent: true},
      {text: 'in', start: 1.62, end: 1.88},
      {text: 'Congress', start: 1.88, end: 2.20},
    ],
  },
  {
    t0: 2.52,
    t1: 4.82,
    words: [
      {text: 'against', start: 2.20, end: 2.54},
      {text: 'President', start: 2.54, end: 2.96},
      {text: "Grant's", start: 2.96, end: 3.34},
      {text: 'brother', start: 3.34, end: 3.58},
      {text: 'that', start: 3.58, end: 3.84},
      {text: 'he', start: 3.84, end: 4.02},
      {text: "couldn't", start: 4.02, end: 4.36, accent: true},
      {text: 'prove.', start: 4.36, end: 4.64, accent: true},
    ],
  },
  {
    t0: 5.04,
    t1: 6.55,
    words: [
      {text: 'Grant', start: 5.10, end: 5.54, accent: true},
      {text: 'took', start: 5.54, end: 5.70},
      {text: 'away', start: 5.70, end: 5.88},
      {text: 'his', start: 5.88, end: 6.02},
      {text: 'command.', start: 6.02, end: 6.24, accent: true},
    ],
  },
  {
    t0: 6.74,
    t1: 8.52,
    words: [
      {text: 'According', start: 6.78, end: 7.30},
      {text: 'to', start: 7.30, end: 7.48},
      {text: 'General', start: 7.48, end: 7.70},
      {text: 'Alfred', start: 7.70, end: 8.04, accent: true},
      {text: 'Terry,', start: 8.04, end: 8.30, accent: true},
    ],
  },
  {
    t0: 8.64,
    t1: 10.82,
    words: [
      {text: 'Custer', start: 8.70, end: 8.92},
      {text: 'begged', start: 8.92, end: 9.24, accent: true},
      {text: 'him', start: 9.24, end: 9.36},
      {text: 'for', start: 9.36, end: 9.48},
      {text: 'help', start: 9.48, end: 9.66},
      {text: 'with', start: 9.66, end: 9.80},
      {text: 'tears', start: 9.80, end: 10.18, accent: true},
      {text: 'in', start: 10.18, end: 10.36},
      {text: 'his', start: 10.36, end: 10.48},
      {text: 'eyes.', start: 10.48, end: 10.70},
    ],
  },
  {
    t0: 10.86,
    t1: 14.12,
    words: [
      {text: 'He', start: 10.90, end: 11.36},
      {text: 'got', start: 11.36, end: 11.50},
      {text: 'to', start: 11.50, end: 11.60},
      {text: 'go.', start: 11.60, end: 11.78},
      {text: 'On', start: 12.04, end: 12.40},
      {text: 'probation.', start: 12.40, end: 12.76, accent: true},
      {text: 'Under', start: 12.76, end: 13.50},
      {text: 'Terry.', start: 13.50, end: 13.78, accent: true},
    ],
  },
  {
    t0: 14.48,
    t1: 16.88,
    words: [
      {text: 'So', start: 14.54, end: 14.58},
      {text: "here's", start: 14.58, end: 14.82},
      {text: 'a', start: 14.82, end: 14.90},
      {text: 'commander', start: 14.90, end: 15.14},
      {text: 'who', start: 15.14, end: 15.36},
      {text: 'badly', start: 15.36, end: 15.78, accent: true},
      {text: 'needs', start: 15.78, end: 16.10},
      {text: 'a', start: 16.10, end: 16.20},
      {text: 'win', start: 16.20, end: 16.32, accent: true},
      {text: 'of', start: 16.32, end: 16.44},
      {text: 'his', start: 16.44, end: 16.58},
      {text: 'own,', start: 16.58, end: 16.74},
    ],
  },
  {
    t0: 16.92,
    t1: 19.68,
    words: [
      {text: 'riding', start: 16.98, end: 17.34},
      {text: 'into', start: 17.34, end: 17.56},
      {text: 'Montana', start: 17.56, end: 17.92, accent: true},
      {text: 'with', start: 17.92, end: 18.20},
      {text: 'an', start: 18.20, end: 18.34},
      {text: '8-year-old', start: 18.34, end: 19.08, accent: true},
      {text: 'playbook.', start: 19.08, end: 19.50, accent: true},
    ],
  },
];

interface DatelineSpec {
  t0: number;
  t1: number;
  place: string;
  sub: string;
}

const DATELINES: DatelineSpec[] = [
  {t0: 0.16, t1: 2.35, place: 'WASHINGTON, D.C.', sub: 'HOUSE CLYMER COMMITTEE · MARCH 1876'},
  {t0: 6.82, t1: 9.25, place: 'FORT ABRAHAM LINCOLN', sub: 'DAKOTA TERRITORY · MAY 1876'},
  {t0: 17.02, t1: 19.55, place: 'SOUTHERN MONTANA', sub: '7TH U.S. CAVALRY · JUNE 1876'},
];

interface EditorialBadgeSpec {
  t0: number;
  t1: number;
  label: string;
  sub: string;
  color: string;
  align: 'left' | 'right';
}

const BADGES: EditorialBadgeSpec[] = [
  {
    t0: 4.02,
    t1: 4.86,
    label: 'ZERO EVIDENCE',
    sub: 'HEARSAY TESTIMONY',
    color: '#b84234',
    align: 'right',
  },
  {
    t0: 5.58,
    t1: 6.62,
    label: 'COMMAND REVOKED',
    sub: 'EXECUTIVE ORDER · PRES. GRANT',
    color: '#a62c24',
    align: 'left',
  },
  {
    t0: 12.36,
    t1: 14.15,
    label: 'ON PROBATION',
    sub: 'SUBORDINATE TO GEN. TERRY',
    color: '#2b456b',
    align: 'left',
  },
  {
    t0: 18.32,
    t1: 19.65,
    label: '1868 WASHITA PLAYBOOK',
    sub: '8 YEARS OUT OF DATE',
    color: '#8c352b',
    align: 'right',
  },
];

export const EditorialGraphics: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  // Suppress unused import check while keeping WORDS linked for verification
  void WORDS;

  const activeDateline = DATELINES.find((d) => t >= d.t0 && t <= d.t1);
  const activeBadge = BADGES.find((b) => t >= b.t0 && t <= b.t1);
  const activePhrase = PHRASES.find((p) => t >= p.t0 && t <= p.t1);

  return (
    <AbsoluteFill style={{pointerEvents: 'none', fontFamily: '"Georgia", "Times New Roman", serif'}}>
      {/* Documentary Location Dateline Plate (top-left) */}
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
        const vis = enter * exit;
        return (
          <div
            style={{
              position: 'absolute',
              top: 54,
              left: 68,
              opacity: vis,
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
              <div
                style={{
                  fontSize: 25,
                  fontWeight: 700,
                  letterSpacing: '0.09em',
                  color: '#fbf6ea',
                  lineHeight: 1.15,
                }}
              >
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

      {/* Sparse Historical Turning-Point Stamp / Callout */}
      {activeBadge && (() => {
        const localFrame = Math.max(0, Math.round((t - activeBadge.t0) * fps));
        const pop = spring({
          frame: localFrame,
          fps,
          config: {damping: 14, stiffness: 240, mass: 0.6},
        });
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
              ...(activeBadge.align === 'left' ? {left: 68} : {right: 68}),
              opacity: Math.min(1, pop * 1.25) * fadeOut,
              transform: `scale(${scale}) rotate(${activeBadge.align === 'left' ? -1.8 : 1.8}deg)`,
              background: '#fbf5e6',
              border: `3px solid ${activeBadge.color}`,
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
                color: activeBadge.color,
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

      {/* Clean Documentary Phrase Captions (bottom center) */}
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
                      transition: 'transform 60ms linear',
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
