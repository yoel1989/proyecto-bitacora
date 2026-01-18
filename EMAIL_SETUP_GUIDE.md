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

## Notas importantes

- Gmail tiene límites de envío (500 emails/día para cuentas gratuitas)
- Para más volumen, considera servicios como SendGrid o Mailgun
- Las notificaciones solo se envían para nuevas entradas (no para ediciones)
- Si falla la conexión, el sistema guarda la entrada pero muestra una advertencia