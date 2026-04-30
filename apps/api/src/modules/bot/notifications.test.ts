import { describe, expect, it } from 'vitest';
import {
  formatCommissionDM,
  formatContestCancelledDM,
  formatContestFinalizedDM,
  formatReferralUnlockDM,
  type CommissionEvent,
  type ContestCancelledEvent,
  type ContestFinalizedEvent,
  type ReferralUnlockEvent,
} from './notifications.js';

const APP_URL = 'https://t.me/fantasytokenbot/fantasytoken';
const RESULT_URL = 'https://t.me/fantasytokenbot/fantasytoken?startapp=result_abc';

const e1: CommissionEvent = {
  sourceFirstName: 'Andriy',
  sourcePrizeCents: 8700,
  payoutCents: 435,
  level: 1,
  contestName: 'Bear Trap',
  currency: 'USD',
  appUrl: APP_URL,
};
const e2: CommissionEvent = {
  sourceFirstName: 'Bohdan',
  sourcePrizeCents: 5000,
  payoutCents: 50,
  level: 2,
  contestName: 'Quick Match',
  currency: 'USD',
  appUrl: APP_URL,
};

describe('formatCommissionDM', () => {
  it('single event — names friend + contest + level + cents (MarkdownV2-escaped)', () => {
    const m = formatCommissionDM([e1]);
    expect(m.text).toContain('Andriy');
    expect(m.text).toContain('Bear Trap');
    expect(m.text).toContain('L1');
    expect(m.text).toContain('5%');
    // MarkdownV2 escapes the dot in money strings.
    expect(m.text).toContain('$87\\.00');
    expect(m.text).toContain('$4\\.35');
  });

  it('attaches an "Open app" inline button pointing at appUrl', () => {
    const m = formatCommissionDM([e1]);
    const btn = m.replyMarkup.inline_keyboard[0]?.[0];
    expect(btn?.text).toContain('Open app');
    // t.me URL → url: button (no web_app envelope).
    expect(btn).toMatchObject({ url: APP_URL });
  });

  it('escapes MarkdownV2 reserved chars in names', () => {
    const tricky: CommissionEvent = { ...e1, sourceFirstName: 'A.B-C', contestName: 'Live!' };
    const m = formatCommissionDM([tricky]);
    expect(m.text).toContain('A\\.B\\-C');
    expect(m.text).toContain('Live\\!');
  });

  it('aggregates multiple events into one summary', () => {
    const m = formatCommissionDM([e1, e2]);
    expect(m.text).toContain('2 friends');
    expect(m.text).toContain('$4\\.85');
    expect(m.text).not.toContain('Andriy');
    expect(m.text).not.toContain('Bohdan');
  });

  it('falls back to "Your friend" when name is null', () => {
    const m = formatCommissionDM([{ ...e1, sourceFirstName: null }]);
    expect(m.text).toContain('Your friend');
  });

  it('renders STARS as ⭐', () => {
    const m = formatCommissionDM([
      { ...e1, currency: 'STARS', payoutCents: 30, sourcePrizeCents: 1000 },
    ]);
    expect(m.text).toContain('30 ⭐');
    expect(m.text).toContain('1000 ⭐');
  });

  it('renders TON as decimal value (escaped)', () => {
    const m = formatCommissionDM([
      { ...e1, currency: 'TON', payoutCents: 250, sourcePrizeCents: 10_000 },
    ]);
    expect(m.text).toContain('2\\.50 TON');
    expect(m.text).toContain('100\\.00 TON');
  });

  it('uses web_app button shape for direct frontend URLs', () => {
    const m = formatCommissionDM([{ ...e1, appUrl: 'https://fantasytoken.vercel.app' }]);
    const btn = m.replyMarkup.inline_keyboard[0]?.[0];
    expect(btn).toMatchObject({ web_app: { url: 'https://fantasytoken.vercel.app' } });
  });

  it('throws on empty events', () => {
    expect(() => formatCommissionDM([])).toThrow();
  });
});

const cf1: ContestFinalizedEvent = {
  entryId: '11111111-1111-1111-1111-111111111111',
  contestId: 'c-1',
  contestName: 'Bear Trap',
  finalRank: 3,
  totalEntries: 20,
  prizeCents: 1250,
  resultUrl: RESULT_URL,
};
const cf2: ContestFinalizedEvent = {
  entryId: '22222222-2222-2222-2222-222222222222',
  contestId: 'c-2',
  contestName: 'Quick Match',
  finalRank: 14,
  totalEntries: 20,
  prizeCents: 0,
  resultUrl: RESULT_URL,
};

describe('formatContestFinalizedDM', () => {
  it('single winning event — names contest, rank, prize and surfaces a "View result" button', () => {
    const m = formatContestFinalizedDM([cf1]);
    expect(m.text).toContain('Bear Trap');
    expect(m.text).toContain('\\#3 of 20');
    expect(m.text).toContain('$12\\.50');
    const btn = m.replyMarkup.inline_keyboard[0]?.[0];
    expect(btn?.text).toContain('View result');
    expect(btn).toMatchObject({ url: RESULT_URL });
  });

  it('single no-prize event still gets a friendly message + result button', () => {
    const m = formatContestFinalizedDM([cf2]);
    expect(m.text).toContain('Quick Match');
    expect(m.text).toContain('\\#14 of 20');
    expect(m.text).toContain('No prize this round');
    expect(m.text).not.toContain('to your balance');
    expect(m.replyMarkup.inline_keyboard[0]?.[0]?.text).toContain('View result');
  });

  it('escapes MarkdownV2 reserved chars in contest names', () => {
    const tricky: ContestFinalizedEvent = { ...cf1, contestName: 'Bear-Trap!' };
    const m = formatContestFinalizedDM([tricky]);
    expect(m.text).toContain('Bear\\-Trap\\!');
  });

  it('aggregates multiple events with per-contest lines + total + Open app button', () => {
    const m = formatContestFinalizedDM([cf1, cf2]);
    expect(m.text).toContain('2 contests');
    expect(m.text).toContain('Bear Trap');
    expect(m.text).toContain('Quick Match');
    expect(m.text).toContain('$12\\.50');
    expect(m.replyMarkup.inline_keyboard[0]?.[0]?.text).toContain('Open app');
  });

  it('aggregate with zero total prize omits the balance line', () => {
    const m = formatContestFinalizedDM([cf2, { ...cf2, contestId: 'c-3' }]);
    expect(m.text).toContain('2 contests');
    expect(m.text).not.toContain('to your balance');
  });

  it('throws on empty events', () => {
    expect(() => formatContestFinalizedDM([])).toThrow();
  });
});

const cc1: ContestCancelledEvent = {
  entryId: '33333333-3333-3333-3333-333333333333',
  contestId: 'c-3',
  contestName: 'Quick Match',
  refundCents: 100,
  resultUrl: RESULT_URL,
};

describe('formatContestCancelledDM', () => {
  it('single refund — friendly copy + Open app button', () => {
    const m = formatContestCancelledDM([cc1]);
    expect(m.text).toContain('Quick Match');
    expect(m.text).toContain('cancelled');
    expect(m.text).toContain('$1\\.00');
    expect(m.replyMarkup.inline_keyboard[0]?.[0]?.text).toContain('Open app');
  });

  it('zero refund (free contest) skips the refund line but still has a button', () => {
    const m = formatContestCancelledDM([{ ...cc1, refundCents: 0 }]);
    expect(m.text).toContain('Free contest');
    expect(m.replyMarkup.inline_keyboard[0]?.[0]?.text).toContain('Open app');
  });
});

const ru1: ReferralUnlockEvent = {
  bonusType: 'RECRUITER',
  amountCents: 2500,
  sourceFirstName: 'Andriy',
  appUrl: APP_URL,
};

describe('formatReferralUnlockDM', () => {
  it('RECRUITER copy names the friend and ships an Open app button', () => {
    const m = formatReferralUnlockDM([ru1]);
    expect(m.text).toContain('Andriy');
    expect(m.text).toContain('first contest');
    expect(m.text).toContain('$25\\.00');
    expect(m.replyMarkup.inline_keyboard[0]?.[0]?.text).toContain('Open app');
  });

  it('REFEREE copy uses welcome wording', () => {
    const m = formatReferralUnlockDM([{ ...ru1, bonusType: 'REFEREE', sourceFirstName: null }]);
    expect(m.text).toContain('Welcome bonus unlocked');
    expect(m.replyMarkup.inline_keyboard[0]?.[0]?.text).toContain('Open app');
  });
});
