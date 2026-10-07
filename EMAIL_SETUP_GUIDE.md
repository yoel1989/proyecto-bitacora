# Guía de configuración de notificaciones por email con Resend

## 1. Configurar cuenta en Resend

### Paso 1: Crear cuenta
1. Ve a [resend.com](https://resend.com)
2. Regístrate con tu email (puedes usar Gmail, Outlook, etc.)
3. Verifica tu email desde el correo que te envíen

### Paso 2: Obtener API Key
1. En el dashboard, ve a **"API Keys"** (menú lateral izquierdo)
2. Haz clic en **"Create API Key"**
3. Nombre: **"Bitácora de Obra"**
4. Copia la **API Key** (empieza con `re_`)

### Paso 3: Verificar dominio (Opcional pero recomendado)
1. Ve a **"Domains"** en el menú
2. Agrega tu dominio (ej: `tudominio.com`)
3. Sigue las instrucciones para verificar (DNS records)
4. Una vez verificado, podrás enviar desde `notificaciones@tudominio.com`

## 2. Configurar variables de entorno

Crea un archivo `.env` en el directorio del backend:

```env
# API Key de Resend (requerida)
RESEND_API_KEY=re_tu_api_key_aqui

# Variables de Supabase (requeridas)
SUPABASE_URL=https://mqxguprzpypcyyusvfrf.supabase.co
SUPABASE_ANON_KEY=tu_supabase_anon_key

# URL de tu aplicación frontend (requerida)
FRONTEND_URL=https://tu-dominio.com

# Email para pruebas (opcional)
TEST_EMAIL=tu-email@gmail.com

# Puerto (opcional, default: 3001)
PORT=3001
```

## 3. Desplegar el backend

### Opción A: Railway (Recomendado)
1. Ve a [Railway.app](https://railway.app)
2. Conecta tu repositorio de GitHub
3. Configura las variables de entorno
4. Railway detectará automáticamente el package.json y desplegará

### Opción B: Render
1. Ve a [Render.com](https://render.com)
2. Crea un nuevo "Web Service"
3. Conecta tu repositorio
4. Configura variables de entorno
5. Elige "Node" como runtime

### Opción C: Heroku
1. Instala Heroku CLI
2. `heroku create tu-app-name`
3. `heroku config:set GMAIL_USER=tu-email`
4. `heroku config:set GMAIL_APP_PASSWORD=tu-password`
5. `git push heroku main`

## 4. Actualizar la URL en el frontend

En `app.js`, cambia esta línea:
```javascript
const response = await fetch('https://tu-backend-url.com/api/send-entry-notification', {
```

Reemplaza `https://tu-backend-url.com` con la URL real de tu backend desplegado.

## 5. Probar el sistema

1. Crea una nueva entrada en la bitácora
2. Verifica que se envíen los emails
3. Revisa los logs del backend para confirmar entregas

## 6. Monitoreo

- Los logs del backend mostrarán el estado de envío
- Si hay errores, se mostrarán en la consola
- El frontend seguirá funcionando aunque fallen las notificaciones

## 7. Configurar SMTP de Resend en Supabase (correos de autenticación)

> ⚠️ Los correos de **autenticación** de Supabase (confirmación de registro, recuperación de
> contraseña, invitaciones) **NO pasan por tu backend**: los envía el propio Supabase.
> Por defecto usa su proveedor integrado, que tiene límites (2 correos/hora/proyecto) y un
> remitente genérico que suele caer en **spam**.

Para que esos correos salgan desde **tu dominio** con Resend:

### Paso 1: Verificar tu dominio en Resend
1. Resend → **Domains** → **Add Domain** (ej: `tudominio.com`)
2. Sigue las instrucciones para agregar los registros DNS (SPF, DKIM, DMARC)
3. Espera a que el estado del dominio sea **Verified**

### Paso 2: Crear una API Key
1. Resend → **API Keys** → **Create API Key** (ej: nombre `Supabase SMTP`)
2. Copia la clave (empieza con `re_`)

### Paso 3: Configurar SMTP en Supabase
1. Supabase → **Authentication** → **Settings** → **SMTP Settings**
2. Configura los campos:
   - **Host**: `smtp.resend.com`
   - **Port**: `465` (SSL) — o `587` (TLS)
   - **User**: `resend`
   - **Password**: tu API Key de Resend (`re_...`)
   - **Sender email**: un correo del dominio verificado, ej: `notificaciones@tudominio.com`
   - **Sender name**: `Bitácora de Obra`
3. Activa **Secure connection / SSL** según el puerto que elegiste
4. Guarda: Supabase te enviará un **correo de prueba** al correo configurado como destinatario
   de pruebas (Authentication → Settings → test address)

### Notas
- El remitente **debe** pertenecer a un dominio verificado en Resend.
- Sin dominio verificado solo puedes usar `onboarding@resend.dev` como remitente, y los correos
  solo llegan a tu propia cuenta (útil para probar, no para producción).
- Con SMTP personalizado el límite deja de ser 2 correos/hora; puedes ajustar los límites en
  Supabase → Authentication → **Rate Limits**.
- Plan gratuito de Resend: ~100 correos/día · 3000/mes.
- La recuperación de contraseña funciona igual: el usuario recibe el enlace y la app muestra
  el formulario para crear la nueva contraseña (no requiere página extra).

## Notas importantes

- Gmail tiene límites de envío (500 emails/día para cuentas gratuitas)
- Para más volumen, considera servicios como SendGrid o Mailgun
- Las notificaciones solo se envían para nuevas entradas (no para ediciones)
- Si falla la conexión, el sistema guarda la entrada pero muestra una advertencia