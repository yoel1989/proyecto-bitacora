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
  rol TEXT CHECK (rol IN ('admin', 'contratista')),
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
  fotos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### 3. Configurar Storage
1. En Supabase > Storage > Create bucket
2. Nombre: `fotos-obra`
3. Policy: Pública para lectura, privada para escritura

### 4. Políticas de Storage (ejecutar en SQL Editor)
```sql
-- Permitir subir archivos a usuarios autenticados
CREATE POLICY "Allow authenticated users to upload" ON "storage.objects"
FOR INSERT WITH CHECK (
  bucket_id = 'fotos-obra' 
  AND auth.role() = 'authenticated'
);

-- Permitir acceso público a las imágenes
CREATE POLICY "Allow public access to images" ON "storage.objects"
FOR SELECT USING (
  bucket_id = 'fotos-obra'
);

-- Permitir eliminar solo archivos propios
CREATE POLICY "Allow users to delete own files" ON "storage.objects"
FOR DELETE USING (
  bucket_id = 'fotos-obra'
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

## Uso

### Para el Administrador:
1. Registra usuarios manualmente en Supabase Auth
2. Cambia roles en la tabla `profiles` (admin/contratista)
3. Puede ver todas las entradas

### Para Contratistas:
1. Solo ven sus propias entradas
2. Pueden subir fotos y crear entradas

## Características
- ✅ Autenticación de usuarios
- ✅ Roles (admin/contratista)
- ✅ Subida de fotos
- ✅ Filtros por estado
- ✅ Orden por fecha
- ✅ Diseño responsive