-- Diagnóstico y Corrección de Estructura de Tabla Bitácora
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar estructura actual de la tabla bitacora
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'bitacora' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Verificar si la tabla existe
SELECT 
    EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'bitacora' 
        AND table_schema = 'public'
    ) as tabla_existe;

-- 3. Contar registros para ver si hay datos
SELECT COUNT(*) as total_registros FROM bitacora;

-- 4. Verificar una muestra de datos (si hay)
SELECT * FROM bitacora LIMIT 3;

-- 5. Agregar campos faltantes si no existen
DO $$
BEGIN
    -- Agregar user_id si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bitacora' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE bitacora ADD COLUMN user_id UUID REFERENCES auth.users(id);
        RAISE NOTICE '✅ Campo user_id agregado';
    ELSE
        RAISE NOTICE 'ℹ️ Campo user_id ya existe';
    END IF;

    -- Agregar fecha si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bitacora' 
        AND column_name = 'fecha'
    ) THEN
        ALTER TABLE bitacora ADD COLUMN fecha TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
        RAISE NOTICE '✅ Campo fecha agregado';
    ELSE
        RAISE NOTICE 'ℹ️ Campo fecha ya existe';
    END IF;

    -- Agregar titulo si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bitacora' 
        AND column_name = 'titulo'
    ) THEN
        ALTER TABLE bitacora ADD COLUMN titulo VARCHAR(200) NOT NULL DEFAULT 'Sin título';
        RAISE NOTICE '✅ Campo titulo agregado';
    ELSE
        RAISE NOTICE 'ℹ️ Campo titulo ya existe';
    END IF;

    -- Agregar otros campos importantes si no existen
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bitacora' 
        AND column_name = 'descripcion'
    ) THEN
        ALTER TABLE bitacora ADD COLUMN descripcion TEXT;
        RAISE NOTICE '✅ Campo descripcion agregado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bitacora' 
        AND column_name = 'estado'
    ) THEN
        ALTER TABLE bitacora ADD COLUMN estado VARCHAR(20) DEFAULT 'pendiente' 
        CHECK (estado IN ('pendiente', 'en_progreso', 'completado'));
        RAISE NOTICE '✅ Campo estado agregado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bitacora' 
        AND column_name = 'folio'
    ) THEN
        ALTER TABLE bitacora ADD COLUMN folio VARCHAR(10);
        RAISE NOTICE '✅ Campo folio agregado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bitacora' 
        AND column_name = 'archivos'
    ) THEN
        ALTER TABLE bitacora ADD COLUMN archivos JSONB DEFAULT '[]';
        RAISE NOTICE '✅ Campo archivos agregado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bitacora' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE bitacora ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE '✅ Campo created_at agregado';
    END IF;
END $$;

-- 6. Verificar estructura final
SELECT 
    'Estructura Final' as status,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'bitacora' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 7. Verificar que los campos críticos existan
SELECT 
    'Campos Críticos' as verification,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bitacora' AND column_name = 'user_id') THEN '✅ user_id'
        ELSE '❌ user_id'
    END as user_id_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bitacora' AND column_name = 'fecha') THEN '✅ fecha'
        ELSE '❌ fecha'
    END as fecha_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bitacora' AND column_name = 'titulo') THEN '✅ titulo'
        ELSE '❌ titulo'
    END as titulo_status;