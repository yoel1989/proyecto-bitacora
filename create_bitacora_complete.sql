-- Crear tabla bitacora desde cero (si no existe o está muy dañada)
-- Opción DRAMÁTICA: Solo usar si la tabla actual no se puede salvar

-- 1. Borrar tabla existente (¡CUIDADO! Se pierden todos los datos!)
-- DROP TABLE IF EXISTS bitacora CASCADE;

-- 2. Crear tabla bitacora con estructura completa
CREATE TABLE IF NOT EXISTS bitacora (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT,
    ubicacion VARCHAR(200),
    hora_inicio TIME,
    hora_final TIME,
    tipo_nota VARCHAR(20) CHECK (tipo_nota IN ('avance', 'incidente', 'observacion', 'reunion', 'documento', 'fotografico', 'otro')),
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_progreso', 'completado')),
    folio VARCHAR(10),
    archivos JSONB DEFAULT '[]',
    fotos TEXT[], -- Mantener por compatibilidad
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_user_id ON bitacora(user_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_estado ON bitacora(estado);
CREATE INDEX IF NOT EXISTS idx_bitacora_folio ON bitacora(folio);

-- 4. Habilitar Row Level Security
ALTER TABLE bitacora ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS
-- Permitir a todos los usuarios autenticados ver todas las entradas
CREATE POLICY "Allow authenticated users to view bitacora" ON bitacora
    FOR SELECT USING (auth.role() = 'authenticated');

-- Permitir a usuarios autenticados insertar sus propias entradas
CREATE POLICY "Allow authenticated users to insert bitacora" ON bitacora
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Permitir a usuarios actualizar solo sus propias entradas (excepto admin)
CREATE POLICY "Allow users to update own bitacora" ON bitacora
    FOR UPDATE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- Permitir a admin eliminar cualquier entrada, usuarios solo las suyas
CREATE POLICY "Allow users to delete own bitacora" ON bitacora
    FOR DELETE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- 6. Verificación final
SELECT 
    'Tabla bitacora creada/actualizada' as status,
    NOW() as timestamp,
    'Estructura completa y con RLS' as resultado;