
-- Tabla de clientes
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  job_address TEXT,
  quote DECIMAL(10,2),
  agreed_price DECIMAL(10,2),
  payment_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (payment_status IN ('pendiente', 'parcial', 'cobrado')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "clients_insert" ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clients_update" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "clients_delete" ON public.clients FOR DELETE USING (auth.uid() = user_id);

-- Tabla de eventos
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'otros' CHECK (type IN ('presupuesto', 'inicio_obra', 'fin_obra', 'cobro', 'otros')),
  event_date DATE NOT NULL,
  event_time TIME,
  description TEXT,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select" ON public.events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "events_insert" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "events_update" ON public.events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "events_delete" ON public.events FOR DELETE USING (auth.uid() = user_id);

-- Tabla de fotos
CREATE TABLE public.photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  photo_type TEXT NOT NULL DEFAULT 'antes' CHECK (photo_type IN ('antes', 'despues')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photos_select" ON public.photos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "photos_insert" ON public.photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "photos_update" ON public.photos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "photos_delete" ON public.photos FOR DELETE USING (auth.uid() = user_id);

-- Storage para fotos de trabajos
INSERT INTO storage.buckets (id, name, public) VALUES ('work-photos', 'work-photos', false);

CREATE POLICY "photos_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'work-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "photos_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'work-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "photos_storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'work-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
