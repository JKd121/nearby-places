-- No credentials or production policy are seeded. Missing bindings fail closed.
CREATE TABLE "AmapResource" (
  id TEXT PRIMARY KEY,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  "dailyLimit" INTEGER NOT NULL CHECK ("dailyLimit" > 0),
  "monthlyLimit" INTEGER NOT NULL CHECK ("monthlyLimit" > 0),
  "intervalMs" INTEGER NOT NULL DEFAULT 500 CHECK ("intervalMs" BETWEEN 1 AND 60000),
  "waitMs" INTEGER NOT NULL DEFAULT 2000 CHECK ("waitMs" BETWEEN 1 AND 2000),
  "graceMs" INTEGER NOT NULL DEFAULT 300 CHECK ("graceMs" BETWEEN 1 AND 2000),
  "permitTtlMs" INTEGER NOT NULL DEFAULT 200 CHECK ("permitTtlMs" BETWEEN 1 AND 2000),
  day TEXT NOT NULL DEFAULT '', month TEXT NOT NULL DEFAULT '',
  "dayUsed" INTEGER NOT NULL DEFAULT 0 CHECK ("dayUsed" >= 0),
  "monthUsed" INTEGER NOT NULL DEFAULT 0 CHECK ("monthUsed" >= 0),
  "nextReservationAt" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01 UTC',
  "consumedReservationAt" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01 UTC',
  "nextGrantAt" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01 UTC'
);
CREATE TABLE "AmapOperationBinding" (
  "credentialId" TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('geocode', 'poi-text', 'nearby')),
  "resourceId" TEXT NOT NULL REFERENCES "AmapResource"(id) ON DELETE RESTRICT,
  PRIMARY KEY ("credentialId", operation)
);
CREATE INDEX "AmapOperationBinding_resourceId_idx" ON "AmapOperationBinding"("resourceId");

-- Policy edits invalidate outstanding tickets and preserve a conservative rate barrier.
CREATE FUNCTION amap_admission_policy_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.enabled, NEW."dailyLimit", NEW."monthlyLimit", NEW."intervalMs", NEW."waitMs", NEW."graceMs", NEW."permitTtlMs")
     IS DISTINCT FROM ROW(OLD.enabled, OLD."dailyLimit", OLD."monthlyLimit", OLD."intervalMs", OLD."waitMs", OLD."graceMs", OLD."permitTtlMs") THEN
    NEW."policyVersion" := OLD."policyVersion" + 1;
    NEW."nextGrantAt" := GREATEST(OLD."nextGrantAt", clock_timestamp() + NEW."intervalMs" * interval '1 millisecond');
    NEW."nextReservationAt" := GREATEST(OLD."nextReservationAt", NEW."nextGrantAt");
  ELSIF NEW."policyVersion" <> OLD."policyVersion" THEN
    RAISE EXCEPTION 'policyVersion is managed by the admission policy trigger';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER amap_admission_policy_change BEFORE UPDATE ON "AmapResource"
FOR EACH ROW EXECUTE FUNCTION amap_admission_policy_change();
