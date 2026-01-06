-- Crear tabla de comentarios para las entradas de bitácora
-- Esta tabla permitirá que los usuarios comenten sobre las entradas existentes

-- 1. Crear tabla de comentarios
CREATE TABLE IF NOT EXISTS comentarios (
    id BIGSERIAL PRIMARY KEY,
    bitacora_id BIGINT NOT NULL REFERENCES bitacora(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    comentario TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_comentarios_bitacora_id ON comentarios(bitacora_id DESC);
CREATE INDEX IF NOT EXISTS idx_comentarios_user_id ON comentarios(user_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_created_at ON comentarios(created_at DESC);

-- 3. Habilitar Row Level Security
ALTER TABLE comentarios ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS para comentarios
-- Permitir a todos los usuarios autenticados ver todos los comentarios
CREATE POLICY "Allow authenticated users to view comentarios" ON comentarios
    FOR SELECT USING (auth.role() = 'authenticated');

-- Permitir a usuarios autenticados insertar comentarios
CREATE POLICY "Allow authenticated users to insert comentarios" ON comentarios
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Permitir a usuarios actualizar solo sus propios comentarios (excepto admin)
CREATE POLICY "Allow users to update own comentarios" ON comentarios
    FOR UPDATE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- Permitir a admin eliminar cualquier comentario, usuarios solo los suyos
CREATE POLICY "Allow users to delete own comentarios" ON comentarios
    FOR DELETE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- 5. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_comentarios_updated_at 
    BEFORE UPDATE ON comentarios 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Verificación final
SELECT 
    'Tabla comentarios creada exitosamente' as status,
    NOW() as timestamp,
    'Estructura completa con RLS y triggers' as resultado;

-- 7. Opcional: Insertar un comentario de prueba (descomentar si es necesario)
-- INSERT INTO comentarios (bitacora_id, user_id, comentario) 
-- VALUES (1, 'user-id-de-ejemplo', 'Este es un comentario de prueba');