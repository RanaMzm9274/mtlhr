BEGIN;

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

  UPDATE public.attendance_entries
  SET check_out_at = now(),
      updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.close_my_open_attendance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_my_open_attendance(UUID) TO authenticated;

COMMIT;
