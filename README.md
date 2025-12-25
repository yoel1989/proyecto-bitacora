# Bitácora de Obra

Sistema de bitácora de construcción con múltiples usuarios y gestión de fotos.

## Configuración inicial

### 1. Crear proyecto en Supabase
1. Ve a [supabase.com](https://supabase.com)
2. Crea cuenta y nuevo proyecto
3. Copia la URL y la API Key anónima

### 2. Crear tablas en Supabase

**Tabla `profiles`:**
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  nombre TEXT,
  email TEXT,
  rol TEXT CHECK (rol IN ('admin', 'contratista', 'interventoria', 'supervision', 'ordenador_gasto')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Trigger para crear perfil automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, rol)
  VALUES (new.id, new.email, 'contratista');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Tabla `bitacora`:**
```sql
CREATE TABLE bitacora (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  fecha DATE NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  ubicacion VARCHAR(200),
  estado VARCHAR(20) CHECK (estado IN ('pendiente', 'en_progreso', 'completado')) DEFAULT 'pendiente',
  fotos TEXT[], -- Mantener para compatibilidad
  archivos JSONB DEFAULT '[]', -- Nuevo campo para archivos con metadatos
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### 3. Configurar Storage
1. En Supabase > Storage > Create bucket
2. Nombre: `archivos-obra` (nuevo bucket para todos los tipos de archivos)
3. Policy: Pública para lectura, privada para escritura

**Nota:** Si ya tienes un bucket `fotos-obra`, puedes crear uno nuevo llamado `archivos-obra` o renombrar el existente.

### 4. Políticas de Storage (ejecutar en SQL Editor)
```sql
-- Permitir subir archivos a usuarios autenticados
CREATE POLICY "Allow authenticated users to upload" ON "storage.objects"
FOR INSERT WITH CHECK (
  bucket_id = 'archivos-obra' 
  AND auth.role() = 'authenticated'
);

-- Permitir acceso público a los archivos
CREATE POLICY "Allow public access to files" ON "storage.objects"
FOR SELECT USING (
  bucket_id = 'archivos-obra'
);

-- Permitir eliminar solo archivos propios
CREATE POLICY "Allow users to delete own files" ON "storage.objects"
FOR DELETE USING (
  bucket_id = 'archivos-obra'
  AND auth.uid::text = (storage.foldername(name))[1]
);
```

### 4. Actualizar configuración
En `app.js`, reemplaza:
```javascript
const supabaseUrl = 'https://tu-proyecto.supabase.co';
const supabaseKey = 'tu-anon-key';
```

Con tus datos de Supabase.

## Instalación y ejecución

```bash
# Instalar dependencias
npm install

# Iniciar servidor local
npm start
```

## Actualización de base de datos existente

Si ya tienes una base de datos existente, ejecuta este SQL para agregar las nuevas funcionalidades:

```sql
-- 1. Actualizar el CHECK constraint para incluir nuevos roles
ALTER TABLE profiles DROP CONSTRAINT profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check 
CHECK (rol IN ('admin', 'contratista', 'interventoria', 'supervision', 'ordenador_gasto'));

-- 2. Agregar nuevo campo para archivos con metadatos
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS archivos JSONB DEFAULT '[]';

-- 3. Ejemplos de actualización de usuarios existentes:
-- UPDATE profiles SET rol = 'interventoria' WHERE email = 'interventor@ejemplo.com';
-- UPDATE profiles SET rol = 'supervision' WHERE email = 'supervisor@ejemplo.com';
-- UPDATE profiles SET rol = 'ordenador_gasto' WHERE email = 'ordenador@ejemplo.com';

-- 4. Migrar fotos existentes al nuevo formato (opcional)
-- UPDATE bitacora SET archivos = COALESCE(fotos, '{}')::jsonb WHERE fotos IS NOT NULL;
```

### Notas importantes para la actualización:
- El campo `fotos` se mantiene por compatibilidad
- Los archivos nuevos se guardarán en el campo `archivos` con metadatos (nombre, tipo, tamaño)
- Necesitas crear el bucket `archivos-obra` en Supabase Storage

## Uso

### Para el Administrador:
1. Registra usuarios manualmente en Supabase Auth
2. Cambia roles en la tabla `profiles` (admin, contratista, interventoria, supervision, ordenador_gasto)
3. Puede ver todas las entradas y editar/eliminar cualquier entrada

### Roles Disponibles:
- **admin**: Puede editar y eliminar cualquier entrada, ver todo
- **contratista**: Solo puede editar sus propias entradas, puede ver todo
- **interventoria**: Solo puede editar sus propias entradas, puede ver todo
- **supervision**: Solo puede editar sus propias entradas, puede ver todo
- **ordenador_gasto**: Solo puede editar sus propias entradas, puede ver todo

### Para todos los usuarios (excepto admin):
1. Solo pueden editar sus propias entradas
2. Pueden ver todas las entradas de bitácora
3. Pueden subir fotos y crear nuevas entradas

## Características
- ✅ Autenticación de usuarios
- ✅ Múltiples roles (admin, contratista, interventoria, supervision, ordenador_gasto)
- ✅ Subida múltiple de archivos (Imágenes, PDF, Word, Excel, PowerPoint)
- ✅ Soporte para múltiples formatos:
  - 📷 Imágenes: JPG, JPEG, PNG, GIF, WebP
  - 📄 Documentos: PDF, DOC, DOCX
  - 📊 Hojas de cálculo: XLS, XLSX
  - 📋 Presentaciones: PPT, PPTX
- ✅ Filtros por estado
- ✅ Orden por fecha
- ✅ Diseño responsive
- ✅ Permisos granulares por rol
- ✅ Vista previa de archivos antes de subir
- ✅ Iconos diferenciados por tipo de archivo