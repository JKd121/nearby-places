-- Align reservations with the final grant barrier after removing category sleeps.
-- Compatible with existing tickets and callers; counters and policy are preserved.
CREATE OR REPLACE FUNCTION public.amap_admission_reserve_v1(p_credential text, p_operation text, p_remaining_ms integer)
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
  scheduled_ms := greatest(now_ms, (extract(epoch FROM r."nextReservationAt") * 1000)::bigint,
    (extract(epoch FROM r."nextGrantAt") * 1000)::bigint);
  expires_ms := least(now_ms + least(r."waitMs", remaining_ms), scheduled_ms + r."graceMs");
  IF scheduled_ms >= expires_ms THEN RETURN jsonb_build_object('code', 'ADMISSION_WAIT_EXCEEDED'); END IF;
  UPDATE public."AmapResource" SET "nextReservationAt" = to_timestamp((scheduled_ms + r."intervalMs")::double precision / 1000)
    WHERE id = r.id;
  RETURN jsonb_build_object('code', 'OK', 'resourceId', r.id, 'version', r."policyVersion",
    'scheduledAtMs', scheduled_ms, 'expiresAtMs', expires_ms,
    'delayMs', scheduled_ms - now_ms, 'validForMs', expires_ms - now_ms);
END;
$$;
