BEGIN;

CREATE OR REPLACE FUNCTION public.record_my_break(
  p_company_id UUID,
  p_mode TEXT,
  p_minutes INTEGER DEFAULT NULL
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
  v_remaining INTEGER;
  v_elapsed_minutes INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_mode NOT IN ('start', 'end') THEN
    RAISE EXCEPTION 'Invalid mode. Use start or end.';
  END IF;

  IF p_company_id IS NULL OR p_company_id <> public.get_user_company_id(v_user_id) THEN
    RAISE EXCEPTION 'Invalid company context.';
  END IF;

  SELECT * INTO v_row
  FROM public.attendance_entries
  WHERE company_id = p_company_id
    AND user_id = v_user_id
    AND work_date = v_today
  LIMIT 1;

  IF v_row.id IS NULL OR v_row.check_in_at IS NULL THEN
    RAISE EXCEPTION 'Check-in is required before break.';
  END IF;

  IF v_row.check_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot manage break after check-out.';
  END IF;

  IF p_mode = 'start' THEN
    IF v_row.break_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Break already in progress.';
    END IF;
    IF p_minutes IS NULL OR p_minutes NOT IN (15, 30, 45, 60) THEN
      RAISE EXCEPTION 'Invalid break duration.';
    END IF;

    v_remaining := 60 - COALESCE(v_row.break_minutes, 0);
    IF p_minutes > v_remaining THEN
      RAISE EXCEPTION 'Break exceeds remaining quota.';
    END IF;

    UPDATE public.attendance_entries
    SET break_started_at = now(),
        break_selected_minutes = p_minutes,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;

    RETURN v_row;
  END IF;

  IF v_row.break_started_at IS NULL THEN
    RAISE EXCEPTION 'No active break to end.';
  END IF;

  v_elapsed_minutes := GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (now() - v_row.break_started_at)) / 60.0)::INTEGER
  );

  UPDATE public.attendance_entries
  SET break_minutes = LEAST(60, COALESCE(break_minutes, 0) + v_elapsed_minutes),
      break_started_at = NULL,
      break_selected_minutes = NULL,
      updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_my_break(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_my_break(UUID, TEXT, INTEGER) TO authenticated;

COMMIT;
