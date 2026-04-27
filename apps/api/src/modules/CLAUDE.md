# Backend Module Convention

Each domain lives in its own folder under `src/modules/`. **Adding a feature = creating one new folder; existing files don't move.** This is what keeps the codebase rare-refactor.

## Module shape

```
modules/<domain>/
├── <domain>.routes.ts        # Fastify plugin. Thin HTTP adapter — NO business logic.
├── <domain>.service.ts       # Pure-ish business logic. No Fastify, no SQL.
├── <domain>.repo.ts          # DB access via Drizzle. Returns domain types, not raw rows.
├── <domain>.types.ts         # Internal types. Re-export shared schemas where possible.
└── <domain>.service.test.ts  # Tests for service. Repo can be faked / in-memory.
```

Health module is intentionally minimal (route-only) — use it as the smallest reference, then look at any real domain once one exists.

## Rules

1. **Routes are thin.** Validate input via shared zod schema → call service → map result. Zero DB calls in routes.
2. **Services are pure-ish.** Receive `repo` and external clients via parameters. Trivial to fake in tests.
3. **Repos own SQL.** No Drizzle queries inside services. If you find one, extract.
4. **Drizzle tables live in `src/db/schema/<domain>.ts`,** not in module folders. drizzle-kit needs them centralized for migrations.
5. **No cross-module internal imports.** Module A talks to module B only via B's exported `service.ts`. Imports across `module/<x>/<file>` boundaries are a smell.
6. **Validation at the boundary.** Every HTTP input validated via zod from `@fantasytoken/shared`. Don't redefine schemas locally.
7. **Errors via `lib/errors.ts`.** Throw `AppError` with a code; the global handler maps to HTTP.
8. **`catch` always logs (INV-7).** `req.log.warn` minimum. Silent fail is forbidden.

## Maintenance triggers

- Add a new domain → create folder using the shape above, register routes in `server.ts`, add Drizzle schema, run `pnpm db:generate`.
- Cross-cutting helper used by ≥2 modules → promote to `src/lib/`.
- Module file > 300 lines → split (per CLAUDE rule 2).
