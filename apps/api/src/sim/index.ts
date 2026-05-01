// TZ-005 sim module barrel. Public surface for server.ts wiring.
export { SIM_CONFIG } from './sim.config.js';
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
export { makeSimAdminRoutes } from './admin.routes.js';
