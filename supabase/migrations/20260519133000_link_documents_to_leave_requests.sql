ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS leave_request_id UUID REFERENCES public.leave_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_leave_request_id_idx ON public.documents(leave_request_id);
