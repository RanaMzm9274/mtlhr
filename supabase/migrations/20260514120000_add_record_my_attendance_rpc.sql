BEGIN;

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
    INSERT INTO public.attendance_entries (company_id, user_id, work_date, check_in_at)
    VALUES (p_company_id, v_user_id, v_today, now())
    ON CONFLICT (company_id, user_id, work_date)
    DO UPDATE SET
      check_in_at = COALESCE(public.attendance_entries.check_in_at, EXCLUDED.check_in_at),
      updated_at = now()
    RETURNING * INTO v_row;

    RETURN v_row;
  END IF;

  SELECT * INTO v_row
  FROM public.attendance_entries
  WHERE company_id = p_company_id
    AND user_id = v_user_id
    AND work_date = v_today
  LIMIT 1;

  IF v_row.id IS NULL OR v_row.check_in_at IS NULL THEN
    RAISE EXCEPTION 'Check-in is required before check-out.';
  END IF;

  UPDATE public.attendance_entries
  SET check_out_at = COALESCE(check_out_at, now()),
      updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_my_attendance(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_my_attendance(UUID, TEXT) TO authenticated;

COMMIT;
