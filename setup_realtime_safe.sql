-- Configuración Segura para Notificaciones en Tiempo Real
-- Ejecutar en Supabase SQL Editor

-- 1. Eliminar políticas existentes si existen (seguro)
DROP POLICY IF EXISTS "Enable realtime for authenticated users" ON "bitacora";

-- 2. Habilitar Realtime en la tabla bitacora
ALTER TABLE bitacora REPLICA IDENTITY FULL;

-- 3. Verificar si la publicación existe, si no crearla
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'bitacora'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE bitacora;
        RAISE NOTICE 'Tabla bitacora agregada a publicación supabase_realtime';
    ELSE
        RAISE NOTICE 'Tabla bitacora ya está en publicación supabase_realtime';
    END IF;
END $$;

-- 4. Crear política para Realtime (versión mejorada)
CREATE POLICY "Enable realtime for authenticated users" ON "bitacora"
FOR SELECT USING (auth.role() = 'authenticated');

-- 5. Verificar configuración actual
SELECT 
    'Realtime Configuration' as config_type,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND tablename = 'bitacora'
        ) THEN '✅ Habilitado'
        ELSE '❌ No habilitado'
    END as realtime_status,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'bitacora' 
            AND policyname = 'Enable realtime for authenticated users'
        ) THEN '✅ Política creada'
        ELSE '❌ Sin política'
    END as policy_status;

-- 6. Opcional: Tabla de logs para notificaciones (solo si no existe)
CREATE TABLE IF NOT EXISTS notification_logs (
    id BIGSERIAL PRIMARY KEY,
    entry_id BIGINT REFERENCES bitacora(id),
    user_id UUID REFERENCES auth.users(id),
    action_type VARCHAR(20) CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

-- 7. Opcional: Función para logging (solo si no existe)
CREATE OR REPLACE FUNCTION log_bitacora_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notification_logs (entry_id, user_id, action_type, metadata)
    VALUES (
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.user_id, OLD.user_id),
        TG_OP,
        json_build_object(
            'old_data', OLD,
            'new_data', NEW,
            'timestamp', NOW()
        )
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 8. Crear triggers solo si no existen (para logging opcional)
DROP TRIGGER IF EXISTS bitacora_realtime_insert_trigger ON bitacora;
CREATE TRIGGER bitacora_realtime_insert_trigger
    AFTER INSERT ON bitacora
    FOR EACH ROW EXECUTE FUNCTION log_bitacora_changes();

DROP TRIGGER IF EXISTS bitacora_realtime_update_trigger ON bitacora;
CREATE TRIGGER bitacora_realtime_update_trigger
    AFTER UPDATE ON bitacora
    FOR EACH ROW EXECUTE FUNCTION log_bitacora_changes();

DROP TRIGGER IF EXISTS bitacora_realtime_delete_trigger ON bitacora;
CREATE TRIGGER bitacora_realtime_delete_trigger
    AFTER DELETE ON bitacora
    FOR EACH ROW EXECUTE FUNCTION log_bitacora_changes();

-- 9. Verificación final
SELECT 
    'Setup Completo' as status,
    'Realtime habilitado para bitacora' as resultado,
    NOW() as configuracion_timestamp;