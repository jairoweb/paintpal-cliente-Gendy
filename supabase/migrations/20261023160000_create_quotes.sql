-- Presupuestos editables asociados a cada cliente
CREATE TABLE public.quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Presupuesto',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select" ON public.quotes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX quotes_client_id_idx ON public.quotes(client_id);
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
