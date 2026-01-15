-- ============================================
-- Script SQL para crear tabla customers
-- en Supabase para FrecuenciaCompra
-- ============================================

-- 1. Crear la tabla customers
CREATE TABLE IF NOT EXISTS public.customers (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    city TEXT,
    identity TEXT,
    orders JSONB DEFAULT '[]'::jsonb
);

-- 2. Crear índice en customer_id para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON public.customers(customer_id);

-- 3. Crear índice en email para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email) WHERE email IS NOT NULL;

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 5. Crear política para lectura pública (SELECT)
CREATE POLICY "Allow public read access"
ON public.customers
FOR SELECT
TO public
USING (true);

-- 6. Crear política para inserción pública (INSERT)
CREATE POLICY "Allow public insert access"
ON public.customers
FOR INSERT
TO public
WITH CHECK (true);

-- 7. Crear política para actualización pública (UPDATE)
CREATE POLICY "Allow public update access"
ON public.customers
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- 8. Crear política para eliminación pública (DELETE)
CREATE POLICY "Allow public delete access"
ON public.customers
FOR DELETE
TO public
USING (true);

-- ============================================
-- Script completado
-- ============================================
