-- Quick Match graduates from R1 → R2 so a fresh user spends one cycle in
-- Practice (free, R1) before the first cash contest unlocks. Idempotent
-- update of any still-scheduled rows; future replenishes use the new value
-- from REPLENISH_TEMPLATES.

UPDATE contests
SET min_rank = 2
WHERE name = 'Quick Match' AND status = 'scheduled' AND min_rank = 1;
