-- ADR-0003: $-first UX layer for the team-builder redesign.
-- Per-contest virtual budget; backend score / payout flow continues to
-- operate in pure % space, this column is display-only.
-- Default $100,000 (10_000_000 cents) matches the legacy fixed-budget concept.

ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS virtual_budget_cents bigint NOT NULL DEFAULT 10000000;
