-- Script para diagnosticar y solucionar problemas con la tabla comentarios
-- Ejecuta esto en el Editor SQL de Supabase

-- 1. Verificar estructura actual de la tabla comentarios
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'comentarios' 
ORDER BY ordinal_position;

-- 2. Verificar si existe la columna parent_comment_id
SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'comentarios' 
    AND column_name = 'parent_comment_id'
) as has_parent_column;

-- 3. Agregar columna parent_comment_id si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'comentarios' 
        AND column_name = 'parent_comment_id'
    ) THEN
        ALTER TABLE comentarios 
        ADD COLUMN parent_comment_id BIGINT REFERENCES comentarios(id) ON DELETE CASCADE;
        RAISE NOTICE 'Columna parent_comment_id agregada exitosamente';
    ELSE
        RAISE NOTICE 'La columna parent_comment_id ya existe';
    END IF;
END $$;

-- 4. Crear índice para respuestas
CREATE INDEX IF NOT EXISTS idx_comentarios_parent_id ON comentarios(parent_comment_id DESC);

-- 5. Verificar estructura final
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'comentarios' 
ORDER BY ordinal_position;

-- 6. Verificar políticas de RLS
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd 
FROM pg_policies 
WHERE tablename = 'comentarios';

-- 7. Probar inserción de respuesta (cambiar los IDs según tus datos)
-- INSERT INTO comentarios (bitacora_id, user_id, comentario, parent_comment_id) 
-- VALUES (1, 'tu-user-id', 'Respuesta de prueba', 1);