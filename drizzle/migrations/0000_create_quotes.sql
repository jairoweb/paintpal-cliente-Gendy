CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Presupuesto',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_select ON public.quotes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = quotes.client_id AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = quotes.client_id AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY quotes_delete ON public.quotes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX quotes_user_id_idx ON public.quotes(user_id);
CREATE INDEX quotes_client_id_idx ON public.quotes(client_id);

CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();