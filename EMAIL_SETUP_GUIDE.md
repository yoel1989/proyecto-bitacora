# Guía de configuración de notificaciones por email

## 1. Configurar Gmail App Password

### Paso 1: Activar verificación en 2 pasos
1. Ve a [Google Account Settings](https://myaccount.google.com/security)
2. En "Inicio de sesión y recuperación", activa "Verificación en 2 pasos"

### Paso 2: Generar App Password
1. En la misma página, busca "Contraseñas de aplicaciones"
2. Selecciona "Correo" y "Otro (nombre personalizado)"
3. Ingresa "Bitácora de Obra" como nombre
4. Copia la contraseña generada (16 caracteres, sin espacios)

## 2. Configurar variables de entorno

Crea un archivo `.env` en el directorio del backend:

```env
GMAIL_USER=tu-email@gmail.com
GMAIL_APP_PASSWORD=tu-app-password-generada
SUPABASE_URL=https://mqxguprzpypcyyusvfrf.supabase.co
SUPABASE_ANON_KEY=tu-supabase-anon-key
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