# Guía de Deployment - Bitácora de Obra

## Arquitectura de Producción

```
Hostinger Pro ($8.99/mes)
├── Frontend estático (HTML/CSS/JS)
├── Backend Node.js (Express para emails)
└── Servir archivos estáticos

Supabase Pro ($25/mes)
├── Base de Datos PostgreSQL
├── Autenticación (Auth)
└── Realtime (Notificaciones)

Cloudflare R2 ($1.5/mes)
└── Storage de Archivos (Fotos, Planos AutoCAD)
```

**Costo Total: ~$35.5/mes** (vs $85-110/mes solo con Supabase)

---

## Paso 1: Configurar Cloudflare R2 (Storage)

### 1.1 Crear cuenta en Cloudflare (Gratis)
- Visita: https://dash.cloudflare.com
- Crea tu cuenta

### 1.2 Crear bucket R2
1. Ve a **R2** → **Create Bucket**
2. Nombre: `bitacora-archivos`
3. Región: Cualquiera (elige la más cercana a tu región)

### 1.3 Deploy del Worker
1. Instala Wrangler CLI:
```bash
npm install -g wrangler
```

2. Autentica con Cloudflare:
```bash
wrangler login
```

3. En la carpeta del proyecto, deploya el worker:
```bash
wrangler deploy
```

4. Copia la URL del worker (ej: `https://bitacora-upload-worker.tu-usuario.workers.dev`)

### 1.4 Configurar CORS (Opcional)
En `cloudflare-worker.js` ya está configurado. Si necesitas cambiar el origen, modifica `CORS_ORIGIN` en `wrangler.toml`.

---

## Paso 2: Configurar Supabase

### 2.1 Crear proyecto en Supabase (Gratis para empezar)
1. Visita: https://supabase.com
2. Crea un nuevo proyecto
3. Espera a que se inicialice (~2 min)

### 2.2 Copiar credenciales
1. Ve a **Settings** → **API**
2. Copia:
   - `Project URL`
   - `anon public key`

### 2.3 Crear tablas (si no existen)
Usa el script SQL que ya tienes o crea manualmente:
- `bitacora` (entradas)
- `comentarios`
- `profiles`
- `usuarios`
- `bitacora_read`
- `notification_logs`

---

## Paso 3: Configurar Variables en el Código

### 3.1 Editar `config.js`
```javascript
const supabaseUrl = 'https://tu-proyecto.supabase.co';
const supabaseKey = 'tu-anon-key-de-supabase';
```

### 3.2 Editar `app.js` (línea 10 aprox.)
```javascript
const R2_WORKER_URL = 'https://bitacora-upload-worker.tu-subdominio.workers.dev';
```

---

## Paso 4: Preparar para Hostinger

### 4.1 Excluir archivos innecesarios
El `.gitignore` ya debería excluir:
- `node_modules`
- `.env`
- archivos temporales

### 4.2 Build para producción
Este es un proyecto estático, no necesita build. Solo subir los archivos:
- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `comments-buttons.css`
- `comments-modal.css`
- Carpeta de imágenes (si existe)

### 4.3 Preparar backend (opcional)
Si necesitas el backend de emails en producción:
```bash
npm install --production
```

---

## Paso 5: Deploy en Hostinger

### 5.1 Comprar plan Pro
- Plan Pro: $8.99/mes (primeros 12 meses)
- Incluye 200GB SSD, unlimited bandwidth, Node.js

### 5.2 Subir archivos (Opción A: File Manager)
1. Entra a hPanel de Hostinger
2. Ve a **File Manager**
3. Navega a `public_html`
4. Sube todos los archivos del proyecto

### 5.3 Subir archivos (Opción B: Git - Recomendado)
1. Entra a hPanel → **Git**
2. **Clone your repository**
3. Pega la URL de tu repo de GitHub
4. **Clone**
5. Configura **Public Directory**: `/` (raíz)

### 5.4 Configurar Node.js (si usas backend de emails)
1. Ve a **Node.js** en hPanel
2. Crea una aplicación:
   - **Application mode**: Production
   - **Application root**: `/`
   - **Application URL**: `tu-dominio.com`
   - **Application startup file**: `email-backend.js`
3. Click en **Create Application**
4. Ve a **Setup** → **Environment variables**
5. Agrega:
   - `SUPABASE_URL`: `https://tu-proyecto.supabase.co`
   - `SUPABASE_ANON_KEY`: `tu-anon-key`
   - `RESEND_API_KEY`: `tu-key-de-resend`

---

## Paso 6: Verificar Deploy

1. Visita `https://tu-dominio.com`
2. Intenta:
   - Login con un usuario
   - Crear una entrada
   - Subir fotos y planos AutoCAD
   - Verificar que los archivos se suben a Cloudflare R2
   - Verificar que los datos se guardan en Supabase

---

## Paso 7: Monitoreo y Escalado

### Cuando crezcas (3-6 meses):

### A. Supabase
1. Ve a **Settings** → **Billing**
2. Cambia a **Pro Plan** ($25/mes)
3. Ajusta storage según uso

### B. Cloudflare R2
1. Los primeros 10GB/mes son gratis
2. Después: $0.015/GB
3. Monitorea en **R2** → **Overview**

### C. Hostinger
1. Pro plan soporta hasta ~1000 visitantes simultáneos
2. Si necesitas más, considera **Business Plan** o VPS

---

## Troubleshooting

### Error: "CORS origin not allowed"
- Solución: Cambia `CORS_ORIGIN` en `wrangler.toml` a tu dominio real

### Error: "Storage full"
- Solución: Aumenta plan en Cloudflare R2 o elimina archivos viejos

### Error: "Database connection refused"
- Solución: Verifica que las credenciales de Supabase son correctas

### Error: "File upload failed"
- Solución: Verifica que Cloudflare Worker está activo y la URL es correcta

---

## Resumen de Costos

| Servicio | Plan | Costo Mensual |
|----------|------|---------------|
| Hostinger | Pro | $8.99 |
| Supabase | Pro (después de 3-6 meses) | $25.00 |
| Cloudflare R2 | Storage (~10.5GB/mes) | $1.50 |
| **Total** | | **$35.49/mes** |

**Ahorro vs Supabase completo:** ~$50-75/mes

---

## Soporte

- Hostinger: https://support.hostinger.com
- Supabase: https://supabase.com/docs
- Cloudflare: https://developers.cloudflare.com/r2/
