-- Reviewed initial policy for a FRESH database migration, not an automatic migration.
-- The user chose half of each limit as initially used. Verify the real account has
-- not already consumed more before applying. This refuses to overwrite existing state.
BEGIN;
WITH shanghai AS MATERIALIZED (
  SELECT clock_timestamp() AT TIME ZONE 'Asia/Shanghai' AS now
)
INSERT INTO "AmapResource" (
  id, enabled, "dailyLimit", "monthlyLimit", "intervalMs", "waitMs", "graceMs", "permitTtlMs",
  day, month, "dayUsed", "monthUsed"
)
SELECT 'amap-search', true, 400, 5000, 800, 2000, 800, 400,
       to_char(now, 'YYYY-MM-DD'), to_char(now, 'YYYY-MM'), 200, 2500 FROM shanghai
UNION ALL
SELECT 'amap-lbs', true, 1000, 150000, 800, 2000, 800, 400,
       to_char(now, 'YYYY-MM-DD'), to_char(now, 'YYYY-MM'), 500, 75000 FROM shanghai;

INSERT INTO "AmapOperationBinding" ("credentialId", operation, "resourceId") VALUES
  ('primary', 'poi-text', 'amap-search'),
  ('primary', 'nearby', 'amap-search'),
  ('primary', 'geocode', 'amap-lbs');
COMMIT;
