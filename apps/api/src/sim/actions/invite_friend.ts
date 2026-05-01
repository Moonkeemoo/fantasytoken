import type { PersonaKind } from '@fantasytoken/shared';
import { generateIdentity } from '../naming.js';
import type { CurrencyService } from '../../modules/currency/currency.service.js';
import type { SimLogger } from '../log.js';
import type { SeedRepo } from '../seed.service.js';
import { SIM_CONFIG } from '../sim.config.js';

/**
 * sim/actions/invite_friend.ts — referral cascade (M4).
 *
 * One inviter → one new "child" synthetic. The child:
 *   • inherits a persona from the inviter's "child distribution" (we
 *     bias toward similar personas, with a 25% mutation rate so trees
 *     don't degenerate into mono-persona blobs).
 *   • has `referrer_user_id` set on insert (bypasses the 60s/0-entries
 *     guards on `users.setReferrerIfEligible` — synthetics own their
 *     own attribution).
 *   • has the two locked signup-bonus rows pre-created in
 *     `referral_signup_bonuses` so the existing finalize-hook unlock
 *     flow runs end-to-end on their first finalized contest.
 *   • gets the same starting coins as their persona's seed default
 *     (DEV_GRANT). Without this they'd land at 0 and fail their first
 *     join — defeating the purpose of cascading the cohort.
 */

export interface InviteFriendArgs {
  inviter: { id: string; personaKind: PersonaKind };
  /** Random 32-bit integer for handle/seed derivation. Tests pass a
   * fixed value to make the action deterministic. */
  childSeed: number;
}

export interface InviteFriendDeps {
  seedRepo: SeedRepo;
  currency: CurrencyService;
  signupBonuses: {
    /** Mirrors referrals.repo.preCreateSignupBonuses (idempotent). */
    preCreateSignupBonuses(args: { refereeUserId: string; recruiterUserId: string }): Promise<void>;
  };
  log: SimLogger;
  /** Override SIM_CONFIG.personas (testing hook). */
  config?: typeof SIM_CONFIG;
  /** Optional source of randomness (testing hook for persona inheritance). */
  random?: () => number;
}

export type InviteFriendOutcome =
  | { kind: 'success'; childUserId: string; childPersona: PersonaKind }
  | { kind: 'error'; errorCode: string; message: string };

/**
 * Persona inheritance: 75% of children share their parent's kind
 * (familial vibe), 25% mutate to a uniformly random kind. Tunable
 * later if cascade trees come out lopsided.
 */
function inheritPersona(parent: PersonaKind, rand: () => number): PersonaKind {
  const KINDS: PersonaKind[] = [
    'whale',
    'casual',
    'meme_chaser',
    'newbie',
    'streaker',
    'inviter',
    'lurker',
  ];
  if (rand() < 0.75) return parent;
  return KINDS[Math.floor(rand() * KINDS.length)] as PersonaKind;
}

export async function inviteFriend(
  deps: InviteFriendDeps,
  args: InviteFriendArgs,
): Promise<InviteFriendOutcome> {
  const config = deps.config ?? SIM_CONFIG;
  const rand = deps.random ?? Math.random;
  const childPersona = inheritPersona(args.inviter.personaKind, rand);
  const identity = generateIdentity(args.childSeed);

  try {
    const child = await deps.seedRepo.createSynthetic({
      personaKind: childPersona,
      syntheticSeed: args.childSeed,
      handle: identity.handle,
      firstName: identity.firstName,
      referrerUserId: args.inviter.id,
    });

    // Mutual signup-bonus rows (locked); will unlock the moment the child
    // hits REQUIRED_CONTESTS_FOR_BONUS finalized contests via the existing
    // finalize-hook in referrals.service.maybeUnlockSignupBonuses.
    await deps.signupBonuses.preCreateSignupBonuses({
      refereeUserId: child.id,
      recruiterUserId: args.inviter.id,
    });

    // Welcome bonus — same flat amount real users get on first auth (20).
    // The +25 referral bonus arrives separately via the existing
    // referrals.maybeUnlockSignupBonuses hook on first finalized contest.
    const startingCoins = config.personas[childPersona].startingCoins;
    if (startingCoins > 0) {
      await deps.currency.transact({
        userId: child.id,
        deltaCents: BigInt(startingCoins),
        type: 'DEV_GRANT',
      });
    }

    await deps.log.log({
      userId: args.inviter.id,
      action: 'invite_friend',
      outcome: 'success',
      payload: {
        childUserId: child.id,
        childPersona,
        startingCoins,
      },
    });

    return { kind: 'success', childUserId: child.id, childPersona };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    await deps.log.log({
      userId: args.inviter.id,
      action: 'invite_friend',
      outcome: 'error',
      errorCode: 'INTERNAL',
      payload: { message, childSeed: args.childSeed },
    });
    return { kind: 'error', errorCode: 'INTERNAL', message };
  }
}
