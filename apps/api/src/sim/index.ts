// TZ-005 sim module barrel. Public surface for server.ts wiring.
export { SIM_CONFIG } from './sim.config.js';
export type { PersonaConfig, PacingShape, TokenBias } from './sim.config.js';
export { generateIdentity } from './naming.js';
export { createSimLogger, type SimLogger, type LogActionArgs } from './log.js';
export {
  createSeedService,
  allocatePersonaCounts,
  type SeedService,
  type SeedRepo,
} from './seed.service.js';
export { createSeedRepo } from './seed.repo.js';
export {
  createWipeService,
  type WipeService,
  type WipeRepo,
  type WipeResult,
} from './wipe.service.js';
export { createWipeRepo } from './wipe.repo.js';
export {
  createRotateService,
  ROTATE_DEFAULTS,
  type RotateService,
  type RotateRepo,
  type RotateResult,
} from './rotate.service.js';
export { createRotateRepo } from './rotate.repo.js';
export { makeSimAdminRoutes } from './admin.routes.js';
export { density } from './pacing.js';
export { pickLineup, filterPoolByBias, shuffle, type PoolToken } from './lineup_picker.js';
export { joinContest } from './actions/join_contest.js';
export { login } from './actions/login.js';
export { idle } from './actions/idle.js';
export { topUp } from './actions/top_up.js';
export { inviteFriend } from './actions/invite_friend.js';
export { createTickRepo } from './tick.repo.js';
export {
  createTickService,
  type TickService,
  type TickServiceDeps,
  type TickStats,
} from './tick.service.js';
export { createSimObservability, type SimObservability } from './observability.js';
