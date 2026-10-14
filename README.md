# Bitácora de Obra

Sistema de bitácora de construcción con gestión de múltiples usuarios, comentarios en tiempo real, sistema de invitaciones por código y control de permisos por roles.

## 🌟 Características

### 📝 Gestión de Entradas
- ✅ Crear, editar y eliminar entradas de bitácora
- ✅ Campos obligatorios con validaciones robustas
- ✅ Sistema de folio consecutivo automático
- ✅ Subida múltiple de archivos (imágenes, PDF, Word, Excel, PowerPoint, ZIP, AutoCAD)
- ✅ Vista previa de archivos antes de subir
- ✅ Iconos diferenciados por tipo de archivo
- ✅ Lazy loading de imágenes para mejor rendimiento
- ✅ Filtros por tipo de nota, ubicación y rango de fechas
- ✅ Búsqueda en tiempo real con índice optimizado
- ✅ Paginación infinita con carga diferida
- ✅ Exportación a PDF de las entradas filtradas

### 👥 Sistema de Usuarios
- ✅ Autenticación con Supabase
- ✅ 5 roles diferentes: admin, contratista, interventoria, supervision, ordenador_gasto
- ✅ Sistema de códigos de invitación con vigencia configurable
- ✅ Registro con código de invitación
- ✅ Permisos granulares por rol
- ✅ Gestión de usuarios solo visible para admin

### 💬 Sistema de Comentarios
- ✅ Comentarios en tiempo real con Supabase Realtime
- ✅ Respuestas anidadas (threading)
- ✅ Archivos adjuntos en comentarios
- ✅ Contador de comentarios por entrada
- ✅ Marcador de comentarios leídos
- ✅ Notificaciones de nuevos comentarios

### 🔔 Sistema de Notificaciones
- ✅ Notificaciones en tiempo real
- ✅ Sistema de logging de notificaciones
- ✅ Contador de notificaciones no leídas
- ✅ Dropdown de notificaciones con acciones
- ✅ Marcar todas como leídas

### 📁 Soporte de Archivos
- 📷 **Imágenes**: JPG, JPEG, PNG, GIF, WebP
- 📄 **Documentos**: PDF, DOC, DOCX
- 📊 **Hojas de cálculo**: XLS, XLSX
- 📋 **Presentaciones**: PPT, PPTX
- 🗜️ **Comprimidos**: ZIP, RAR, 7Z, TAR, GZ
- 📐 **AutoCAD**: DWG, DXF, DWF

### 🎨 Interfaz
- ✅ Diseño responsive (móvil y escritorio)
- ✅ Tablas con encabezados fijos en escritorio
- ✅ Cards optimizadas para móvil
- ✅ Sistema de carga con indicadores visuales
- ✅ Manejo de errores con notificaciones
- ✅ Tema consistente con gradientes

## 🚀 Instalación

### Requisitos Previos
- Node.js y npm
- Cuenta de Supabase con proyecto configurado
- Bucket de storage llamado `archivos-obra`

### 1. Configurar Supabase

1. Crear las tablas necesarias:
   - `profiles` - Perfiles de usuarios con roles
   - `bitacora` - Entradas de bitácora
   - `bitacora_read` - Registro de lectura de entradas
   - `comentarios` - Comentarios de las entradas
   - `notification_logs` - Logs de notificaciones
   - `invitation_codes` - Códigos de invitación

2. Configurar Row Level Security (RLS) en todas las tablas

3. Crear las funciones RPC:
   - `delete_bitacora_entry` - Eliminar entrada con cascada
   - `generate_folio` - Generar folio consecutivo

4. Habilitar Realtime en las tablas `bitacora`, `comentarios`, `profiles`

5. Crear políticas RLS para cada tabla

### 2. Instalar Dependencias

```bash
cd "C:\Users\yoooe\OneDrive\Desktop\PROYECTO BITACORA"
npm install
```

### 3. Configurar Variables de Entorno

Crear un archivo `.env` basándote en `.env.example`:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Configurar Storage

1. Crear bucket `archivos-obra` con acceso público
2. Configurar políticas de storage para permitir:
   - Subida a usuarios autenticados
   - Descarga pública de archivos

### 5. Ejecutar la Aplicación

```bash
# Para desarrollo
npm run dev

# O abrir directamente en el navegador
# Abre index.html en tu navegador
```

## 📊 Estructura de la Base de Datos

### Tabla `profiles`
```sql
- id: UUID (PRIMARY KEY, referencia a auth.users)
- email: TEXT
- rol: TEXT (admin, contratista, interventoria, supervision, ordenador_gasto)
- created_at: TIMESTAMP
```

### Tabla `bitacora`
```sql
- id: BIGINT (PRIMARY KEY, auto-incremental)
- folio: VARCHAR(10) (único)
- user_id: UUID (referencia a auth.users)
- fecha: TIMESTAMP WITH TIME ZONE
- titulo: VARCHAR(200) (mínimo 5 caracteres)
- descripcion: TEXT (mínimo 10 caracteres)
- hora_inicio: TIME
- hora_final: TIME
- tipo_nota: TEXT (avance, incidente, observacion, reunion, documento, fotografico, otro)
- ubicacion: TEXT (mínimo 3 caracteres)
- archivos: JSONB (array de objetos con url, name, type, size)
- created_at: TIMESTAMP WITH TIME ZONE
```

### Tabla `comentarios`
```sql
- id: BIGINT (PRIMARY KEY, auto-incremental)
- bitacora_id: BIGINT (referencia a bitacora)
- user_id: UUID (referencia a auth.users)
- contenido: TEXT
- archivos: JSONB (array de objetos con url, name, type, size)
- parent_comment_id: BIGINT (referencia a comentarios, opcional)
- created_at: TIMESTAMP WITH TIME ZONE
- updated_at: TIMESTAMP WITH TIME ZONE
```

### Tabla `bitacora_read`
```sql
- id: BIGINT (PRIMARY KEY, auto-incremental)
- bitacora_id: BIGINT (referencia a bitacora)
- user_id: UUID (referencia a auth.users)
- read_at: TIMESTAMP WITH TIME ZONE
```

### Tabla `notification_logs`
```sql
- id: BIGINT (PRIMARY KEY, auto-incremental)
- entry_id: BIGINT (referencia a bitacora)
- notification_type: TEXT
- sent_to: JSONB (array de emails)
- sent_at: TIMESTAMP WITH TIME ZONE
- status: TEXT
```

### Tabla `invitation_codes`
```sql
- id: BIGINT (PRIMARY KEY, auto-incremental)
- code: VARCHAR(8) (único)
- rol: TEXT
- created_at: TIMESTAMP WITH TIME ZONE
- expires_at: TIMESTAMP WITH TIME ZONE
- used: BOOLEAN
- used_by: UUID (referencia a auth.users)
- used_at: TIMESTAMP WITH TIME ZONE
```

## 👥 Roles y Permisos

### Admin
- ✅ Ver todas las entradas
- ✅ Crear, editar y eliminar cualquier entrada
- ✅ Ver y responder comentarios
- ✅ Gestionar usuarios (crear códigos de invitación)
- ✅ Ver notificaciones

### Contratista
- ✅ Ver todas las entradas
- ✅ Crear entradas
- ✅ Editar sus propias entradas
- ✅ Ver y responder comentarios
- ✅ Ver notificaciones

### Interventoría
- ✅ Ver todas las entradas
- ✅ Crear entradas
- ✅ Editar sus propias entradas
- ✅ Ver y responder comentarios
- ✅ Ver notificaciones

### Supervisión del Contrato
- ✅ Ver todas las entradas
- ✅ Crear entradas
- ✅ Editar sus propias entradas
- ✅ Ver y responder comentarios
- ✅ Ver notificaciones

### Ordenador del Gasto
- ✅ Ver todas las entradas
- ✅ Crear entradas
- ✅ Editar sus propias entradas
- ✅ Ver y responder comentarios
- ✅ Ver notificaciones

## 📁 Estructura del Proyecto

```
PROYECTO BITACORA/
├── index.html                  # Página principal
├── app.js                      # Lógica principal de la aplicación
├── styles.css                  # Estilos generales
├── comments-buttons.css        # Estilos de botones de comentarios
├── comments-modal.css          # Estilos del modal de comentarios
├── config.js                   # Configuración de Supabase
├── package.json                # Dependencias de Node
├── comentarios_debug.js        # Debug de comentarios
├── email-backend.js            # Backend de emails (servidor)
├── email-service.js            # Servicio de emails
├── .env.example                # Ejemplo de variables de entorno
├── .gitignore                  # Archivos ignorados por Git
└── README.md                   # Este archivo
```

## 🔧 Tecnologías Utilizadas

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Estilos**: CSS puro con media queries para responsive
- **Librerías**:
  - Supabase JS Client v2
  - jsPDF (exportación a PDF)
  - html2canvas (captura de pantalla)
  - EmailJS (envío de emails)

## 📝 Validaciones

### Campos Obligatorios al Crear Entrada
- ✅ **Título**: Mínimo 5 caracteres
- ✅ **Fecha y Hora**: Siempre requerida
- ✅ **Descripción**: Mínimo 10 caracteres
- ✅ **Tipo de Nota**: Debe seleccionarse
- ✅ **Ubicación**: Debe seleccionarse
- ✅ **Hora Inicio**: Siempre requerida
- ✅ **Hora Final**: Siempre requerida y posterior a Hora Inicio

### Validaciones Lógicas
- ✅ **Orden Cronológico**: Hora inicio < Hora final
- ✅ **Unicidad de Folio**: Generado automáticamente
- ✅ **Archivos**: Solo formatos permitidos

## 🎯 Funcionalidades Principales

### Gestión de Entradas
- Crear nueva entrada con validaciones
- Editar entrada existente (admin o propietario)
- Eliminar entrada (solo admin)
- Ver lista de entradas con paginación
- Filtrar por múltiples criterios
- Buscar por palabra clave

### Sistema de Comentarios
- Agregar comentario a entrada
- Responder a comentarios
- Adjuntar archivos a comentarios
- Ver contador de comentarios
- Marcar como leídos

### Gestión de Usuarios (Admin)
- Generar códigos de invitación
- Asignar rol al código
- Configurar vigencia del código
- Ver lista de códigos generados
- Copiar código al portapapeles

### Notificaciones
- Recibir notificaciones en tiempo real
- Ver contador de notificaciones no leídas
- Ver lista de notificaciones
- Marcar como leídas individual o todas

## 🔒 Seguridad

- ✅ Autenticación con Supabase Auth
- ✅ Row Level Security (RLS) en todas las tablas
- ✅ Validación de roles en backend
- ✅ Sanitización de inputs
- ✅ Validaciones de archivos
- ✅ Políticas de storage controladas

### Row Level Security (RLS)

RLS habilitado en **todas** las tablas: `profiles`, `bitacora`, `bitacora_read`, `comentarios`,
`notification_logs` e `invitation_codes`.

- `profiles`: cada usuario lee perfiles; solo puede actualizar su **propio** perfil y únicamente
  la columna `nombre` (el `rol` no se puede cambiar desde el cliente). El rol solo lo asigna el
  canje de un código de invitación.
- `notification_logs`: escritura controlada por políticas; sin acceso público.

### Funciones RPC (SECURITY DEFINER)

Las funciones `SECURITY DEFINER` se ejecutan con permisos elevados, por lo que **verifican los
permisos internamente** y **no son ejecutables sin sesión (`anon`)**:

| Función | Protección interna | Ejecutable por |
|---|---|---|
| `generate_invitation_code` | Requiere `is_admin()` | `authenticated` |
| `delete_bitacora_entry` | Requiere `is_admin()` | `authenticated` |
| `mark_unread_for_others` | Requiere `current_user_id = auth.uid()` | `authenticated` |
| `redeem_invitation_code` | No permite cambiar el rol de un admin; si hay sesión, solo puede canjear para sí mismo | `authenticated` y `anon`¹ |
| `delete_entry_cascade` | Sin uso en la app | *nadie* |
| `force_delete_entry` | Sin uso en la app | *nadie* |

¹ `redeem_invitation_code` se deja accesible a `anon` porque el registro puede llamarla antes de
iniciar sesión (cuando la confirmación de correo está activada). Su seguridad recae en el control
interno.

Todas las funciones anteriores llevan `SET search_path = public` para evitar secuestro de
`search_path`.

### Revertir los permisos (si algún día hace falta)

```sql
-- Volver a permitir la ejecución a usuarios sin sesión (NO recomendado)
grant execute on function public.generate_invitation_code(character varying, integer) to anon;
grant execute on function public.delete_bitacora_entry(integer) to anon;
grant execute on function public.mark_unread_for_others(integer, uuid) to anon;
grant execute on function public.delete_entry_cascade(bigint) to anon;
grant execute on function public.force_delete_entry(bigint) to anon;

-- Volver a permitir la actualización libre del perfil (NO recomendado)
grant update on public.profiles to authenticated;

-- Deshabilitar RLS (NO recomendado)
alter table public.profiles disable row level security;
alter table public.notification_logs disable row level security;
```

## 📱 Optimizaciones

- ✅ Índice de búsqueda para búsquedas rápidas
- ✅ Lazy loading de imágenes
- ✅ Paginación infinita
- ✅ Carga en segundo plano de emails
- ✅ Debounce en búsqueda
- ✅ Limpieza automática de memoria
- ✅ Virtual scroll (preparado)
- ✅ Renderizado optimizado con fragmentos

## 🐛 Solución de Problemas

### Errores Comunes

**Error: No se puede conectar a Supabase**
- Verificar que config.js tenga las credenciales correctas
- Verificar que el bucket de storage exista

**Error: No se pueden subir archivos**
- Verificar que el bucket `archivos-obra` exista
- Verificar las políticas de storage
- Verificar el tamaño máximo de archivo (50MB por defecto)

**Error: No aparecen las notificaciones**
- Verificar que Realtime esté habilitado en las tablas
- Verificar las políticas RLS para Realtime

## 📞 Soporte

Para reportar problemas o sugerir mejoras, contacta al equipo de desarrollo.

## 📄 Licencia

Este proyecto es propiedad de la organización.

## 🙏 Agradecimientos

- Supabase por el backend completo
- Comunidad de desarrolladores por las contribuciones
