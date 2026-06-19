BEGIN;

ALTER TABLE public.attendance_entries
ADD COLUMN IF NOT EXISTS clock_in_ip TEXT,
ADD COLUMN IF NOT EXISTS allowed_clock_in_ip_at_clock_in TEXT;

CREATE OR REPLACE FUNCTION public.resolve_shift_end_checkout_at(
  p_user_id UUID,
  p_check_in_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_shift_end TIME;
  v_shift_end_at TIMESTAMPTZ;
BEGIN
  IF p_check_in_at IS NULL THEN
    RETURN now();
  END IF;

  SELECT ep.shift_end
  INTO v_shift_end
  FROM public.employee_profiles ep
  WHERE ep.user_id = p_user_id
  ORDER BY ep.created_at DESC
  LIMIT 1;

  IF v_shift_end IS NULL THEN
    RETURN now();
  END IF;

  v_shift_end_at := date_trunc('day', p_check_in_at) + v_shift_end;

  IF v_shift_end_at < p_check_in_at THEN
    v_shift_end_at := v_shift_end_at + interval '1 day';
  END IF;

  RETURN LEAST(now(), v_shift_end_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_my_open_attendance(
  p_company_id UUID
)
RETURNS public.attendance_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row public.attendance_entries;
  v_checkout_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_company_id IS NULL OR p_company_id <> public.get_user_company_id(v_user_id) THEN
    RAISE EXCEPTION 'Invalid company context.';
  END IF;

  SELECT *
  INTO v_row
  FROM public.attendance_entries
  WHERE company_id = p_company_id
    AND user_id = v_user_id
    AND check_in_at IS NOT NULL
    AND check_out_at IS NULL
  ORDER BY check_in_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Check-in is required before check-out.';
  END IF;

  v_checkout_at := public.resolve_shift_end_checkout_at(v_user_id, v_row.check_in_at);

  UPDATE public.attendance_entries
  SET check_out_at = v_checkout_at,
      updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_my_attendance(
  p_company_id UUID,
  p_mode TEXT
)
RETURNS public.attendance_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_row public.attendance_entries;
  v_restrict_clock_in_ip BOOLEAN := false;
  v_allowed_clock_in_ip TEXT := NULL;
  v_headers JSONB := NULL;
  v_forwarded_for TEXT := NULL;
  v_client_ip TEXT := NULL;
  v_checkout_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_mode NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Invalid mode. Use in or out.';
  END IF;

  IF p_company_id IS NULL OR p_company_id <> public.get_user_company_id(v_user_id) THEN
    RAISE EXCEPTION 'Invalid company context.';
  END IF;

  IF p_mode = 'in' THEN
    BEGIN
      v_headers := NULLIF(current_setting('request.headers', true), '')::JSONB;
    EXCEPTION WHEN OTHERS THEN
      v_headers := NULL;
    END;

    v_forwarded_for := COALESCE(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', '');
    v_client_ip := NULLIF(BTRIM(SPLIT_PART(v_forwarded_for, ',', 1)), '');

    SELECT
      COALESCE(ep.restrict_clock_in_ip, false),
      NULLIF(BTRIM(ep.allowed_clock_in_ip), '')
    INTO
      v_restrict_clock_in_ip,
      v_allowed_clock_in_ip
    FROM public.employee_profiles ep
    WHERE ep.user_id = v_user_id
    ORDER BY ep.created_at DESC
    LIMIT 1;

    IF COALESCE(v_restrict_clock_in_ip, false) THEN
      IF v_allowed_clock_in_ip IS NULL THEN
        RAISE EXCEPTION 'Clock-in IP restriction is enabled but no allowed IP is configured for your profile.';
      END IF;

      IF v_client_ip IS NULL THEN
        RAISE EXCEPTION 'Unable to verify your network IP for clock-in.';
      END IF;

      IF v_client_ip <> v_allowed_clock_in_ip THEN
        RAISE EXCEPTION 'Clock-in blocked from this IP address. Allowed IP: %', v_allowed_clock_in_ip;
      END IF;
    END IF;

    INSERT INTO public.attendance_entries (
      company_id,
      user_id,
      work_date,
      check_in_at,
      clock_in_ip,
      allowed_clock_in_ip_at_clock_in
    )
    VALUES (
      p_company_id,
      v_user_id,
      v_today,
      now(),
      v_client_ip,
      v_allowed_clock_in_ip
    )
    ON CONFLICT (company_id, user_id, work_date)
    DO UPDATE SET
      check_in_at = COALESCE(public.attendance_entries.check_in_at, EXCLUDED.check_in_at),
      clock_in_ip = COALESCE(public.attendance_entries.clock_in_ip, EXCLUDED.clock_in_ip),
      allowed_clock_in_ip_at_clock_in = COALESCE(public.attendance_entries.allowed_clock_in_ip_at_clock_in, EXCLUDED.allowed_clock_in_ip_at_clock_in),
      updated_at = now()
    RETURNING * INTO v_row;

    RETURN v_row;
  END IF;

  SELECT * INTO v_row
  FROM public.attendance_entries
  WHERE company_id = p_company_id
    AND user_id = v_user_id
    AND check_in_at IS NOT NULL
    AND check_out_at IS NULL
  ORDER BY check_in_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Check-in is required before check-out.';
  END IF;

  v_checkout_at := public.resolve_shift_end_checkout_at(v_user_id, v_row.check_in_at);

  UPDATE public.attendance_entries
  SET check_out_at = COALESCE(check_out_at, v_checkout_at),
      updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_shift_end_checkout_at(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_shift_end_checkout_at(UUID, TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.close_my_open_attendance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_my_open_attendance(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.record_my_attendance(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_my_attendance(UUID, TEXT) TO authenticated;

COMMIT;
