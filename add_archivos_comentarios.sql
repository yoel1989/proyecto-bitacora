-- Script para agregar soporte de archivos a los comentarios
-- Ejecuta esto en el Editor SQL de Supabase

-- 1. Agregar columna para archivos a comentarios
ALTER TABLE comentarios 
ADD COLUMN IF NOT EXISTS archivos JSONB DEFAULT '[]';

-- 2. Verificar que la columna se agregó correctamente
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'comentarios' AND column_name = 'archivos'
ORDER BY ordinal_position;

-- 3. Actualizar comentarios existentes con array vacío si es necesario
UPDATE comentarios 
SET archivos = '[]' 
WHERE archivos IS NULL;

-- 4. Verificación final
SELECT 
    'Tabla comentarios actualizada con soporte de archivos' as status,
    NOW() as timestamp;