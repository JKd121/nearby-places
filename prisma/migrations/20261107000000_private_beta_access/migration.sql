-- Account disabling and mode-aware final admission; preserve existing counters and V1 functions.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION public.amap_admission_grant_v2(p jsonb, op text, resource text, version integer,
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
      WHERE s.id=p->>'sessionId' AND s."userId"=v_subject AND s."expiresAt">now_at AND u."disabledAt" IS NULL
      AND (u."emailVerified" OR p->>'accessMode' IN ('local-beta','private-beta')) FOR SHARE OF s,u;
    IF NOT FOUND THEN RETURN jsonb_build_object('code','IDENTITY_REQUIRED'); END IF;
    PERFORM 1 FROM public."UserApiCredential" c WHERE c."userId"=v_subject AND c.id=p->>'credentialId'
      AND c.version=(p->>'version')::int AND c.fingerprint=p->>'fingerprint' AND c.status<>'invalid' FOR SHARE;
    IF NOT FOUND OR version<>(p->>'version')::int OR resource<>'byok:'||(p->>'fingerprint') THEN
      RETURN jsonb_build_object('code','CREDENTIAL_INVALID'); END IF;
  ELSIF p->>'kind'='guest' THEN
    IF p->>'accessMode'='private-beta' THEN RETURN jsonb_build_object('code','IDENTITY_REQUIRED'); END IF;
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
