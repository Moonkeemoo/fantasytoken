# Web Feature Convention

A **feature** is a user-visible vertical (contests list, portfolio builder, leaderboard, profile) — not a technical layer. Adding a screen = adding a feature folder. Existing folders don't move.

## Feature shape

```
features/<feature>/
├── <Feature>Page.tsx     # Top-level route component.
├── components/           # Feature-local components.
├── hooks/                # Feature-local hooks (useContests, etc.).
├── api.ts                # API calls — `apiFetch` + shared zod schemas.
└── store.ts              # zustand slice if the feature has client state.
```

## Rules

1. **No cross-feature internals.** Feature A imports from feature B only via top-level export — and usually doesn't need to.
2. **Shared UI primitives** (Button, Card, Input) live in `src/components/ui/`, NOT inside features. Promote a component here once a second feature needs it.
3. **API calls go through `lib/api-client.ts`** with a zod schema from `@fantasytoken/shared`. **Never** raw `fetch` + `as Type`.
4. **Server state** via TanStack Query. **Client UI state** via local `useState` or zustand slice.
5. **One route per page** registered in `src/App.tsx`.
6. **No outcome logic.** Anything that decides scores, eligibility, allocation rules → goes to `@fantasytoken/shared/scoring` so the same code runs on the backend (INV-3, INV-4 closed by construction).
7. **Copy:** "pick / select / add to team / compete". **Never** "buy / invest / trade" (INV-6).

## Maintenance triggers

- New top-level page → new feature folder + route in `App.tsx`.
- Component used by ≥2 features → promote to `src/components/ui/`.
- Feature folder grows past ~5 files in `components/` → consider sub-grouping.
