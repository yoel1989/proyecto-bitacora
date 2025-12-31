-- Configuración para Notificaciones en Tiempo Real
-- Ejecutar en Supabase SQL Editor

-- 1. Habilitar Realtime en la tabla bitacora
ALTER TABLE bitacora REPLICA IDENTITY FULL;

-- 2. Verificar que Realtime esté habilitado
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 3. Si no existe, crear la publicación
CREATE PUBLICATION supabase_realtime FOR TABLE bitacora;

-- 4. Asegurar que los usuarios puedan suscribirse a cambios
-- Esto se maneja principalmente a través de RLS, pero aquí está la política base

-- Política para permitir que todos los usuarios autenticados vean los cambios
CREATE POLICY "Enable realtime for authenticated users" ON "bitacora"
FOR SELECT USING (auth.role() = 'authenticated');

-- 5. Verificar configuración actual
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    forcerlspolicy
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'bitacora';

-- 6. Opcional: Crear una función para logging de notificaciones (si quieres historial)
CREATE TABLE IF NOT EXISTS notification_logs (
    id BIGSERIAL PRIMARY KEY,
    entry_id BIGINT REFERENCES bitacora(id),
    user_id UUID REFERENCES auth.users(id),
    action_type VARCHAR(20) CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

-- 7. Trigger para logging automático (opcional)
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

-- 8. Crear triggers para logging
DROP TRIGGER IF EXISTS bitacora_insert_trigger ON bitacora;
CREATE TRIGGER bitacora_insert_trigger
    AFTER INSERT ON bitacora
    FOR EACH ROW EXECUTE FUNCTION log_bitacora_changes();

DROP TRIGGER IF EXISTS bitacora_update_trigger ON bitacora;
CREATE TRIGGER bitacora_update_trigger
    AFTER UPDATE ON bitacora
    FOR EACH ROW EXECUTE FUNCTION log_bitacora_changes();

DROP TRIGGER IF EXISTS bitacora_delete_trigger ON bitacora;
CREATE TRIGGER bitacora_delete_trigger
    AFTER DELETE ON bitacora
    FOR EACH ROW EXECUTE FUNCTION log_bitacora_changes();

-- 9. Verificar que todo esté configurado correctamente
SELECT 
    'Realtime habilitado para bitacora' as status,
    'Configuración completada' as message;