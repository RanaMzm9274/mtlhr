
-- Add new columns to employee_profiles
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS gender text DEFAULT '';
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS position text DEFAULT '';
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS id_passport text DEFAULT '';
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS license text DEFAULT '';

-- Add position and name to invitations
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS name text DEFAULT '';
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS position text DEFAULT '';
