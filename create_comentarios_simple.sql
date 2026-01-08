-- PASO 1: Verificar si la tabla bitacora existe
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'bitacora';

-- Si la tabla bitacora no existe, primero debes crearla con este script:
-- (Esto es el contenido de create_bitacora_complete.sql que ya deberías tener)

-- PASO 2: Crear tabla comentarios (solo después de verificar que bitacora existe)
CREATE TABLE comentarios (
    id BIGSERIAL PRIMARY KEY,
    bitacora_id BIGINT NOT NULL REFERENCES bitacora(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    comentario TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 3: Crear índices
CREATE INDEX idx_comentarios_bitacora_id ON comentarios(bitacora_id DESC);
CREATE INDEX idx_comentarios_user_id ON comentarios(user_id);
CREATE INDEX idx_comentarios_created_at ON comentarios(created_at DESC);

-- PASO 4: Habilitar RLS
ALTER TABLE comentarios ENABLE ROW LEVEL SECURITY;

-- PASO 5: Políticas de seguridad
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

-- PASO 6: Trigger para updated_at
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

-- PASO 7: Verificación final
SELECT 
    'Tabla comentarios creada exitosamente' as status,
    NOW() as timestamp;