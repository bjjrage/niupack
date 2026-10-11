-- Licitaciones: descartar licitaciones del tablero sin perderlas.
-- Es un borrado lógico a propósito: el escaneo diario vuelve a encontrar la misma licitación en DNCP y,
-- si se borrara la fila, reaparecería. Con dismissed_at el escáner actualiza los datos pero respeta el descarte.
ALTER TABLE public.licitaciones_tenders ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS licitaciones_tenders_org_visible_idx
    ON public.licitaciones_tenders (organization_id, source_updated_at DESC)
    WHERE dismissed_at IS NULL;
