-- Backfill final_rank for finalized entries that pre-date the column (added in 0005).
-- Compute rank within each contest by final_score, with direction depending on
-- contest.type (bull = DESC, bear = ASC). Tie-break by submittedAt ASC.
WITH ranked AS (
  SELECT
    e.id,
    ROW_NUMBER() OVER (
      PARTITION BY e.contest_id
      ORDER BY
        CASE WHEN c.type = 'bear' THEN e.final_score END ASC NULLS LAST,
        CASE WHEN c.type = 'bear' THEN NULL ELSE e.final_score END DESC NULLS LAST,
        e.submitted_at ASC
    )::integer AS r
  FROM entries e
  JOIN contests c ON c.id = e.contest_id
  WHERE e.status = 'finalized' AND e.final_rank IS NULL
)
UPDATE entries SET final_rank = ranked.r
FROM ranked
WHERE entries.id = ranked.id;
