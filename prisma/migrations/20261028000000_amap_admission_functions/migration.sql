-- Additive only: existing policies, bindings, counters and policy trigger are retained.
CREATE FUNCTION public.amap_admission_reserve_v1(p_credential text, p_operation text, p_remaining_ms integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER PARALLEL UNSAFE
SET search_path = pg_catalog, public AS $$
DECLARE
  r public."AmapResource"%ROWTYPE;
  binding_id text;
  started timestamptz := clock_timestamp();
  now_ms bigint;
  scheduled_ms bigint;
  expires_ms bigint;
  remaining_ms integer;
BEGIN
  IF p_remaining_ms IS NULL OR p_remaining_ms < 1 THEN
    RETURN jsonb_build_object('code', 'ADMISSION_WAIT_EXCEEDED');
  END IF;
  SELECT resource.* INTO r FROM public."AmapResource" resource
    WHERE resource.id = (SELECT "resourceId" FROM public."AmapOperationBinding"
      WHERE "credentialId" = p_credential AND operation = p_operation)
    FOR UPDATE OF resource;
  IF NOT FOUND OR NOT r.enabled OR r."waitMs" > 2000 THEN
    RETURN jsonb_build_object('code', 'ADMISSION_UNAVAILABLE');
  END IF;
  SELECT "resourceId" INTO binding_id FROM public."AmapOperationBinding"
    WHERE "credentialId" = p_credential AND operation = p_operation FOR SHARE;
  IF NOT FOUND OR binding_id <> r.id THEN
    RETURN jsonb_build_object('code', 'ADMISSION_UNAVAILABLE');
  END IF;
  now_ms := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  remaining_ms := least(2000, p_remaining_ms) - ceil(extract(epoch FROM (clock_timestamp() - started)) * 1000)::integer;
  IF remaining_ms < 1 THEN RETURN jsonb_build_object('code', 'ADMISSION_WAIT_EXCEEDED'); END IF;
  scheduled_ms := greatest(now_ms, (extract(epoch FROM r."nextReservationAt") * 1000)::bigint);
  expires_ms := least(now_ms + least(r."waitMs", remaining_ms), scheduled_ms + r."graceMs");
  IF scheduled_ms >= expires_ms THEN RETURN jsonb_build_object('code', 'ADMISSION_WAIT_EXCEEDED'); END IF;
  UPDATE public."AmapResource" SET "nextReservationAt" = to_timestamp((scheduled_ms + r."intervalMs")::double precision / 1000)
    WHERE id = r.id;
  RETURN jsonb_build_object('code', 'OK', 'resourceId', r.id, 'version', r."policyVersion",
    'scheduledAtMs', scheduled_ms, 'expiresAtMs', expires_ms,
    'delayMs', scheduled_ms - now_ms, 'validForMs', expires_ms - now_ms);
END;
$$;

CREATE FUNCTION public.amap_admission_grant_v1(p_credential text, p_operation text, p_resource text,
  p_version integer, p_scheduled_ms bigint, p_expires_ms bigint, p_remaining_ms integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER PARALLEL UNSAFE
SET search_path = pg_catalog, public AS $$
DECLARE
  r public."AmapResource"%ROWTYPE;
  binding_id text;
  started timestamptz := clock_timestamp();
  now_ms bigint;
  remaining_ms integer;
  delay_ms bigint;
  now_at timestamptz;
  calendar timestamp;
  budget_day text;
  budget_month text;
  day_used integer;
  month_used integer;
BEGIN
  IF p_remaining_ms IS NULL OR p_remaining_ms < 1 THEN
    RETURN jsonb_build_object('code', 'ADMISSION_WAIT_EXCEEDED');
  END IF;
  SELECT resource.* INTO r FROM public."AmapResource" resource
    WHERE resource.id = (SELECT "resourceId" FROM public."AmapOperationBinding"
      WHERE "credentialId" = p_credential AND operation = p_operation)
    FOR UPDATE OF resource;
  IF NOT FOUND OR NOT r.enabled OR r."waitMs" > 2000 OR r.id IS DISTINCT FROM p_resource THEN
    RETURN jsonb_build_object('code', 'ADMISSION_UNAVAILABLE');
  END IF;
  SELECT "resourceId" INTO binding_id FROM public."AmapOperationBinding"
    WHERE "credentialId" = p_credential AND operation = p_operation FOR SHARE;
  IF NOT FOUND OR binding_id <> r.id OR r."policyVersion" IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('code', 'ADMISSION_UNAVAILABLE');
  END IF;
  now_ms := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  remaining_ms := least(2000, p_remaining_ms) - ceil(extract(epoch FROM (clock_timestamp() - started)) * 1000)::integer;
  IF remaining_ms < 1 OR p_scheduled_ms IS NULL OR p_expires_ms IS NULL
    OR now_ms < p_scheduled_ms OR now_ms >= p_expires_ms OR p_scheduled_ms >= p_expires_ms
    OR p_scheduled_ms <= (extract(epoch FROM r."consumedReservationAt") * 1000)::bigint THEN
    RETURN jsonb_build_object('code', 'ADMISSION_WAIT_EXCEEDED');
  END IF;
  delay_ms := (extract(epoch FROM r."nextGrantAt") * 1000)::bigint - now_ms;
  IF delay_ms > 0 THEN
    IF delay_ms >= least(remaining_ms, p_expires_ms - now_ms) THEN
      RETURN jsonb_build_object('code', 'ADMISSION_WAIT_EXCEEDED');
    END IF;
    RETURN jsonb_build_object('code', 'WAIT', 'delayMs', delay_ms);
  END IF;
  now_at := to_timestamp(now_ms::double precision / 1000);
  calendar := now_at AT TIME ZONE 'Asia/Shanghai';
  budget_day := to_char(calendar, 'YYYY-MM-DD');
  budget_month := to_char(calendar, 'YYYY-MM');
  day_used := CASE WHEN r.day = budget_day THEN r."dayUsed" ELSE 0 END;
  month_used := CASE WHEN r.month = budget_month THEN r."monthUsed" ELSE 0 END;
  IF month_used >= r."monthlyLimit" THEN
    RETURN jsonb_build_object('code', 'MONTHLY_BUDGET_EXHAUSTED', 'retryAt',
      to_char(((date_trunc('month', calendar) + interval '1 month') AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  END IF;
  IF day_used >= r."dailyLimit" THEN
    RETURN jsonb_build_object('code', 'DAILY_BUDGET_EXHAUSTED', 'retryAt',
      to_char(((calendar::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  END IF;
  UPDATE public."AmapResource" SET day = budget_day, month = budget_month,
    "dayUsed" = day_used + 1, "monthUsed" = month_used + 1,
    "consumedReservationAt" = to_timestamp(p_scheduled_ms::double precision / 1000),
    "nextGrantAt" = to_timestamp((now_ms + r."intervalMs")::double precision / 1000)
    WHERE id = r.id;
  RETURN jsonb_build_object('code', 'OK', 'validForMs', least(r."permitTtlMs", p_expires_ms - now_ms, remaining_ms));
END;
$$;
