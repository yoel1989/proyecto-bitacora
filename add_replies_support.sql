-- Script para agregar soporte de respuestas a comentarios
-- Ejecuta esto en el Editor SQL de Supabase

-- 1. Agregar columna para respuestas anidadas
ALTER TABLE comentarios 
ADD COLUMN IF NOT EXISTS parent_comment_id BIGINT REFERENCES comentarios(id) ON DELETE CASCADE;

-- 2. Crear índice para mejor rendimiento de respuestas
CREATE INDEX IF NOT EXISTS idx_comentarios_parent_id ON comentarios(parent_comment_id DESC);

-- 3. Verificar que la columna se agregó correctamente
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'comentarios' 
ORDER BY ordinal_position;