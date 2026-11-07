-- AlterTable
ALTER TABLE "SearchHistory" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "visitorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "encryptionVersion" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestIdentity" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestDailyUsage" (
    "guestId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuestDailyUsage_pkey" PRIMARY KEY ("guestId","day")
);

-- CreateTable
CREATE TABLE "RequestCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetsAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RequestCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RequestRate" (
    "key" TEXT NOT NULL,
    "nextAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RequestRate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RequestLease" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RequestLease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiCredential_userId_key" ON "UserApiCredential"("userId");

-- CreateIndex
CREATE INDEX "GuestSession_guestId_idx" ON "GuestSession"("guestId");

-- CreateIndex
CREATE INDEX "RequestLease_expiresAt_idx" ON "RequestLease"("expiresAt");

-- CreateIndex
CREATE INDEX "SearchHistory_userId_searchedAt_idx" ON "SearchHistory"("userId", "searchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SearchHistory_userId_dedupeKey_key" ON "SearchHistory"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiCredential" ADD CONSTRAINT "UserApiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "GuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestDailyUsage" ADD CONSTRAINT "GuestDailyUsage_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "GuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Appended to the incremental migration. V1 remains available for existing CLI callers.
CREATE FUNCTION public.amap_admission_reserve_v2(p jsonb, op text, remaining integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE now_ms bigint; scheduled bigint; expires bigint; scope text; next_at timestamptz;
BEGIN
  IF p->>'kind' = 'guest' THEN
    RETURN public.amap_admission_reserve_v1(p->>'publicCredential',op,remaining);
  END IF;
  IF remaining < 1 THEN RETURN jsonb_build_object('code','ADMISSION_WAIT_EXCEEDED'); END IF;
  now_ms := floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  scope := 'reserve:'||(p->>'fingerprint');
  INSERT INTO public."RequestRate" (key,"nextAt") VALUES(scope,to_timestamp(0)) ON CONFLICT DO NOTHING;
  SELECT "nextAt" INTO next_at FROM public."RequestRate" WHERE key=scope FOR UPDATE;
  scheduled := greatest(now_ms,floor(extract(epoch FROM next_at)*1000)::bigint);
  expires := least(now_ms+least(2000,remaining),scheduled+300);
  IF scheduled >= expires THEN RETURN jsonb_build_object('code','ADMISSION_WAIT_EXCEEDED'); END IF;
  UPDATE public."RequestRate" SET "nextAt"=to_timestamp((scheduled+(p->>'intervalMs')::int)/1000.0) WHERE key=scope;
  RETURN jsonb_build_object('code','OK','resourceId','byok:'||(p->>'fingerprint'),'version',(p->>'version')::int,
    'scheduledAtMs',scheduled,'expiresAtMs',expires,'delayMs',scheduled-now_ms,'validForMs',expires-now_ms);
END; $$;

CREATE FUNCTION public.amap_admission_grant_v2(p jsonb, op text, resource text, version integer,
  scheduled bigint, expires bigint, remaining integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE now_at timestamptz; now_ms bigint; v_subject text; used integer; day_key text;
  next_at timestamptz; delay_ms integer; answer jsonb; lease_id text; consumed_ms bigint;
BEGIN
  -- A single short transaction serializes the shared infrastructure capacity check.
  PERFORM pg_advisory_xact_lock(674827103);
  now_at := clock_timestamp(); now_ms := floor(extract(epoch FROM now_at)*1000)::bigint;
  v_subject := p->>'subject'; lease_id := p->>'leaseId';
  IF remaining < 1 OR now_ms < scheduled OR now_ms >= expires THEN
    RETURN jsonb_build_object('code','ADMISSION_WAIT_EXCEEDED'); END IF;
  IF p->>'kind'='account' THEN
    PERFORM 1 FROM public."Session" s JOIN public."User" u ON u.id=s."userId"
      WHERE s.id=p->>'sessionId' AND s."userId"=v_subject AND s."expiresAt">now_at AND u."emailVerified" FOR SHARE OF s,u;
    IF NOT FOUND THEN RETURN jsonb_build_object('code','IDENTITY_REQUIRED'); END IF;
    PERFORM 1 FROM public."UserApiCredential" c WHERE c."userId"=v_subject AND c.id=p->>'credentialId'
      AND c.version=(p->>'version')::int AND c.fingerprint=p->>'fingerprint' AND c.status<>'invalid' FOR SHARE;
    IF NOT FOUND OR version<>(p->>'version')::int OR resource<>'byok:'||(p->>'fingerprint') THEN
      RETURN jsonb_build_object('code','CREDENTIAL_INVALID'); END IF;
  ELSIF p->>'kind'='guest' THEN
    PERFORM 1 FROM public."GuestSession" s JOIN public."GuestIdentity" g ON g.id=s."guestId"
      WHERE s.id=p->>'sessionId' AND g.id=v_subject AND s."expiresAt">now_at AND g."expiresAt">now_at FOR SHARE OF s,g;
    IF NOT FOUND THEN RETURN jsonb_build_object('code','IDENTITY_REQUIRED'); END IF;
    day_key := to_char(now_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD');
    INSERT INTO public."GuestDailyUsage" ("guestId",day,used) VALUES(v_subject,day_key,0) ON CONFLICT DO NOTHING;
    SELECT g.used INTO used FROM public."GuestDailyUsage" g WHERE g."guestId"=v_subject AND g.day=day_key FOR UPDATE;
    IF used >= (p->>'dailyLimit')::int THEN RETURN jsonb_build_object('code','GUEST_DAILY_EXHAUSTED'); END IF;
  ELSE RETURN jsonb_build_object('code','IDENTITY_REQUIRED'); END IF;

  DELETE FROM public."RequestLease" WHERE "expiresAt"<=now_at;
  IF EXISTS(SELECT 1 FROM public."RequestLease" WHERE id=lease_id) THEN RETURN jsonb_build_object('code','ADMISSION_WAIT_EXCEEDED'); END IF;
  IF (SELECT count(*) FROM public."RequestLease") >= (p->>'maxConcurrent')::int
    OR (SELECT count(*) FROM public."RequestLease" WHERE "RequestLease".subject=(p->>'kind')||':'||v_subject)>=2 THEN
    RETURN jsonb_build_object('code','ADMISSION_WAIT_EXCEEDED'); END IF;

  INSERT INTO public."RequestRate" (key,"nextAt") VALUES('subject:'||(p->>'kind')||':'||v_subject,to_timestamp(0)),
    ('key:'||(p->>'fingerprint'),to_timestamp(0)),('consumed:'||v_subject||':'||(p->>'fingerprint'),to_timestamp(0)) ON CONFLICT DO NOTHING;
  SELECT greatest(0,ceil(extract(epoch FROM (max("nextAt")-now_at))*1000))::int INTO delay_ms
    FROM public."RequestRate" WHERE key IN ('subject:'||(p->>'kind')||':'||v_subject,'key:'||(p->>'fingerprint'));
  IF delay_ms>0 THEN
    IF delay_ms>=least(remaining,expires-now_ms) THEN RETURN jsonb_build_object('code','ADMISSION_WAIT_EXCEEDED'); END IF;
    RETURN jsonb_build_object('code','WAIT','delayMs',delay_ms);
  END IF;
  IF p->>'kind'='guest' THEN
    answer := public.amap_admission_grant_v1(p->>'publicCredential',op,resource,version,scheduled,expires,remaining);
    IF answer->>'code'<>'OK' THEN RETURN answer; END IF;
    UPDATE public."GuestDailyUsage" g SET used=g.used+1 WHERE "guestId"=v_subject AND day=day_key;
  ELSE
    SELECT floor(extract(epoch FROM "nextAt")*1000)::bigint INTO consumed_ms FROM public."RequestRate"
      WHERE key='consumed:'||v_subject||':'||(p->>'fingerprint');
    IF scheduled<=consumed_ms THEN RETURN jsonb_build_object('code','ADMISSION_WAIT_EXCEEDED'); END IF;
    UPDATE public."RequestRate" SET "nextAt"=to_timestamp(scheduled/1000.0) WHERE key='consumed:'||v_subject||':'||(p->>'fingerprint');
    answer := jsonb_build_object('code','OK','validForMs',least(200,expires-now_ms));
  END IF;
  UPDATE public."RequestRate" SET "nextAt"=now_at+(p->>'intervalMs')::int*interval '1 millisecond'
    WHERE key IN ('subject:'||(p->>'kind')||':'||v_subject,'key:'||(p->>'fingerprint'));
  INSERT INTO public."RequestLease" (id,subject,"expiresAt") VALUES(lease_id,(p->>'kind')||':'||v_subject,now_at+(p->>'leaseMs')::int*interval '1 millisecond');
  RETURN answer;
END; $$;
