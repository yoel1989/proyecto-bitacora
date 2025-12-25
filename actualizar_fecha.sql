-- Script para actualizar la columna de fecha a timestamp
-- Ejecutar en SQL Editor de Supabase

-- 1. Agregar nueva columna temporal
ALTER TABLE bitacora ADD COLUMN fecha_timestamp TIMESTAMP WITH TIME ZONE;

-- 2. Copiar datos de la columna antigua (solo fecha actual)
UPDATE bitacora SET fecha_timestamp = fecha::timestamp with time zone;

-- 3. Borrar la columna antigua
ALTER TABLE bitacora DROP COLUMN fecha;

-- 4. Renombrar la nueva columna
ALTER TABLE bitacora RENAME COLUMN fecha_timestamp TO fecha;

-- 5. Verificar resultado
SELECT column_name, data_type, udt_name 
FROM information_schema.columns 
WHERE table_name = 'bitacora' AND column_name = 'fecha';