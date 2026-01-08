-- Crear tabla para tracking de comentarios leídos
CREATE TABLE IF NOT EXISTS bitacora_read (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    bitacora_id BIGINT NOT NULL REFERENCES bitacora(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(bitacora_id, user_id)
);

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_bitacora_read_user_bitacora ON bitacora_read(user_id, bitacora_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_read_bitacora ON bitacora_read(bitacora_id);

-- Políticas de seguridad (RLS)
ALTER TABLE bitacora_read ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios pueden ver sus propios registros de lectura
CREATE POLICY "Users can view their own read records"
    ON bitacora_read FOR SELECT
    USING (auth.uid() = user_id);

-- Política: Usuarios pueden insertar/actualizar sus propios registros de lectura  
CREATE POLICY "Users can manage their own read records"
    ON bitacora_read FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);