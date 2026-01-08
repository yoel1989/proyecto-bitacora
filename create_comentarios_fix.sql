-- Versión simplificada y corregida para crear la tabla comentarios
-- Copia y ejecuta este script completo en el Editor SQL de Supabase

-- 1. Crear tabla comentarios
CREATE TABLE comentarios (
    id BIGSERIAL PRIMARY KEY,
    bitacora_id BIGINT NOT NULL REFERENCES bitacora(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    comentario TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Crear índices
CREATE INDEX idx_comentarios_bitacora_id ON comentarios(bitacora_id DESC);
CREATE INDEX idx_comentarios_user_id ON comentarios(user_id);
CREATE INDEX idx_comentarios_created_at ON comentarios(created_at DESC);

-- 3. Habilitar RLS
ALTER TABLE comentarios ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de seguridad
CREATE POLICY "Allow authenticated users to view comentarios" ON comentarios
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to insert comentarios" ON comentarios
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow users to update own comentarios" ON comentarios
    FOR UPDATE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

CREATE POLICY "Allow users to delete own comentarios" ON comentarios
    FOR DELETE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- 5. Verificación final
SELECT 
    'Tabla comentarios creada exitosamente' as status,
    NOW() as timestamp;