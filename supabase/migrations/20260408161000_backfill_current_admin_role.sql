INSERT INTO public.user_roles (user_id, role)
VALUES ('968a8808-8f23-4b45-86a0-07650c7103ab'::uuid, 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
