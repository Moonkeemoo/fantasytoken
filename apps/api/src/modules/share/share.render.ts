import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import satori, { type SatoriOptions } from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { ShareCardData } from './share.service.js';

// Resolve assets relative to this source file so it works equally in dev (tsx)
// and dist build (compiled .js sits in dist/modules/share/).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS = path.resolve(__dirname, '../../assets');

const interBold = readFileSync(path.join(ASSETS, 'Inter-Bold.ttf'));
const interRegular = readFileSync(path.join(ASSETS, 'Inter-Regular.ttf'));

const FONTS: SatoriOptions['fonts'] = [
  { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
  { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
];

const W = 1200;
const H = 630;

const PAPER = '#f6f1e8';
const INK = '#1a1814';
const ACCENT_BULL = '#facc15'; // yellow-400 (matches wireframe)
const ACCENT_BEAR = '#f87171'; // red-400
const GREEN = '#16a34a';
const RED = '#dc2626';
const MUTED = '#65615b';

// Light typed helper around the dom-like vnode literal satori expects.
type Style = Record<string, string | number>;
type VNode = { type: string; props: { style?: Style; children?: unknown } } & Record<
  string,
  unknown
>;
function el(type: string, style: Style, children?: unknown): VNode {
  return { type, props: { style, children } };
}

function formatPnl(cents: number): string {
  if (cents === 0) return '$0.00';
  const sign = cents > 0 ? '+' : '-';
  const abs = Math.abs(cents) / 100;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase();
}

function buildCard(data: ShareCardData): VNode {
  const accent = data.contestType === 'bear' ? ACCENT_BEAR : ACCENT_BULL;
  const pnlColor = data.netPnlCents >= 0 ? GREEN : RED;
  const refUrl = `t.me/fantasytokenbot/fantasytoken?startapp=ref_${data.user.telegramId}`;

  return el(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: PAPER,
      fontFamily: 'Inter',
      padding: '60px',
      boxSizing: 'border-box',
    },
    [
      // Header line: app + contest name
      el(
        'div',
        {
          display: 'flex',
          fontSize: '22px',
          color: MUTED,
          textTransform: 'uppercase',
          letterSpacing: '4px',
          fontWeight: 700,
        },
        `Fantasy Token  ·  ${data.contestType === 'bear' ? '↓ Bear' : '↑ Bull'}`,
      ),
      // Yellow card body
      el(
        'div',
        {
          marginTop: '36px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: accent,
          border: `4px solid ${INK}`,
          borderRadius: '20px',
          padding: '50px 56px',
          boxShadow: `8px 8px 0 ${INK}`,
        },
        [
          el(
            'div',
            {
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            },
            [
              el('div', { display: 'flex', flexDirection: 'column' }, [
                el(
                  'div',
                  { fontSize: '24px', fontWeight: 700, color: INK, letterSpacing: '2px' },
                  data.contestName.toUpperCase(),
                ),
                el(
                  'div',
                  {
                    fontSize: '160px',
                    fontWeight: 700,
                    color: INK,
                    lineHeight: 1,
                    marginTop: '12px',
                  },
                  `#${data.finalRank ?? '—'}`,
                ),
                el(
                  'div',
                  {
                    fontSize: '28px',
                    fontWeight: 700,
                    color: INK,
                    letterSpacing: '2px',
                    marginTop: '8px',
                  },
                  `OF ${data.totalEntries} PLAYERS`,
                ),
              ]),
              el(
                'div',
                {
                  fontSize: '120px',
                  lineHeight: 1,
                },
                data.finalRank === 1 ? '🏆' : data.prizeCents > 0 ? '★' : '·',
              ),
            ],
          ),
          el(
            'div',
            {
              marginTop: '40px',
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: `2px dashed ${INK}`,
              paddingTop: '28px',
            },
            [
              el('div', { display: 'flex', flexDirection: 'column' }, [
                el('div', { fontSize: '20px', color: INK, opacity: 0.7 }, 'P&L'),
                el(
                  'div',
                  {
                    fontSize: '64px',
                    fontWeight: 700,
                    color: pnlColor,
                    marginTop: '4px',
                  },
                  formatPnl(data.netPnlCents),
                ),
              ]),
              el('div', { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }, [
                el('div', { fontSize: '20px', color: INK, opacity: 0.7 }, 'WON'),
                el(
                  'div',
                  {
                    fontSize: '64px',
                    fontWeight: 700,
                    color: INK,
                    marginTop: '4px',
                  },
                  formatCents(data.prizeCents),
                ),
              ]),
            ],
          ),
        ],
      ),
      // Footer: handle + invite link
      el(
        'div',
        {
          marginTop: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '22px',
          color: INK,
          fontWeight: 700,
        },
        [
          el('div', { display: 'flex', flexDirection: 'column', gap: '4px' }, [
            el(
              'div',
              { display: 'flex' },
              `${data.user.username ? '@' + data.user.username : data.user.displayName}  ·  ${shortDate(data.finishedAt)}`,
            ),
            data.recruiter
              ? el(
                  'div',
                  { display: 'flex', color: MUTED, fontSize: '14px', fontWeight: 500 },
                  `via ${data.recruiter.username ? '@' + data.recruiter.username : data.recruiter.displayName}`,
                )
              : el('div', { display: 'flex' }, ''),
          ]),
          el('div', { display: 'flex', color: MUTED }, refUrl),
        ],
      ),
    ],
  );
}

export async function renderShareCardPng(data: ShareCardData): Promise<Buffer> {
  // satori's input is typed as ReactNode but accepts our plain vnode object literal at
  // runtime. Cast through never to avoid pulling React types into a backend that doesn't use React.
  const svg = await satori(buildCard(data) as never, {
    width: W,
    height: H,
    fonts: FONTS,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
  return Buffer.from(resvg.render().asPng());
}
