-- Welcome Match → Practice. Free entry, smaller seat count (10), house-funded
-- $5 pool so the contest actually rewards top finishers (Welcome Match was a
-- $0-pool placeholder). Schema-only data-migration; no shape changes.

UPDATE contests
SET name = 'Practice', max_capacity = 10, prize_pool_cents = 500
WHERE name = 'Welcome Match' AND status = 'scheduled';
