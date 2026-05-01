/**
 * TZ-005 §5 — synthetic handle generation.
 *
 * Pure, deterministic, dependency-free. Same seed → same handle, regardless
 * of process / locale. Word pools come from crypto/internet vernacular so
 * synthetics blend with real TG users; explicitly NO `bot_/fake_/test_`
 * prefixes (TZ §5).
 */

const ADJECTIVES = [
  'neon',
  'crypto',
  'degen',
  'whale',
  'shadow',
  'apex',
  'cyber',
  'meme',
  'lunar',
  'solar',
  'hyper',
  'turbo',
  'silent',
  'rogue',
  'frost',
  'nova',
  'pixel',
  'phantom',
  'velvet',
  'vortex',
  'omega',
  'alpha',
  'sigma',
  'gamma',
  'midnight',
  'dawn',
  'gilded',
  'iron',
  'ember',
  'echo',
  'glitch',
  'pulse',
  'static',
  'orbit',
  'comet',
  'eclipse',
  'mirage',
  'tidal',
  'arctic',
  'sandy',
  'vapor',
  'crimson',
  'emerald',
  'ivory',
  'onyx',
  'azure',
  'cobalt',
  'amber',
  'hollow',
  'plasma',
  'quantum',
  'feral',
  'savage',
  'gentle',
  'stoic',
  'wild',
];

const NOUNS = [
  'bat',
  'fox',
  'shark',
  'wolf',
  'phoenix',
  'dragon',
  'samurai',
  'ninja',
  'rider',
  'ghost',
  'witch',
  'monk',
  'voyager',
  'oracle',
  'panther',
  'hawk',
  'falcon',
  'tiger',
  'lion',
  'bear',
  'cobra',
  'viper',
  'crow',
  'owl',
  'koi',
  'orca',
  'kraken',
  'griffin',
  'wyrm',
  'titan',
  'nomad',
  'pilgrim',
  'wanderer',
  'hunter',
  'sleuth',
  'sage',
  'punk',
  'jester',
  'knight',
  'duke',
  'echo',
  'spark',
  'shard',
  'rune',
  'sigil',
  'token',
  'nexus',
  'vector',
  'pylon',
  'beacon',
  'relic',
  'totem',
  'glyph',
  'crest',
  'forge',
  'anvil',
];

const SUFFIXES = ['', '', '', '_42', 'x', '420', '69', '_', '_pro', '_eth', '7', '01', '_xyz'];

/**
 * Mulberry32 — small fast deterministic 32-bit PRNG. Public domain. Seeded
 * by the synthetic_seed integer; same seed → same stream.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

export interface SyntheticIdentity {
  /** Used as `users.username`. ~5–20 chars, lowercase, optional digits/underscore. */
  handle: string;
  /** Used as `users.first_name`. Capitalised adjective. */
  firstName: string;
}

/**
 * Generate a TG-style identity from a deterministic seed.
 *
 * Collision behaviour: caller is responsible for retry-on-unique-violation.
 * In practice with N=1000 synthetics over a pool of ~57×56×13 ≈ 41K combos
 * the birthday-paradox collision rate is ~2% per insert; pick a fresh seed
 * if the DB rejects.
 */
export function generateIdentity(seed: number): SyntheticIdentity {
  const rand = mulberry32(seed);
  const adj = pick(ADJECTIVES, rand);
  const noun = pick(NOUNS, rand);
  const suffix = pick(SUFFIXES, rand);
  return {
    handle: `${adj}${noun}${suffix}`,
    firstName: adj.charAt(0).toUpperCase() + adj.slice(1),
  };
}
