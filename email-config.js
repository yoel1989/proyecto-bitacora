// Archivo de configuración para el backend de email
// Crear archivo .env en el directorio del backend

/*
# Variables de entorno para email-service.js
GMAIL_USER=tu-email@gmail.com
GMAIL_APP_PASSWORD=tu-app-password-de-gmail

# Variables de Supabase
SUPABASE_URL=https://mqxguprzpypcyyusvfrf.supabase.co
SUPABASE_ANON_KEY=tu-anon-key

# Puerto del servidor
PORT=3001
*/

// Para obtener App Password de Gmail:
// 1. Ve a https://myaccount.google.com/security
// 2. Activa la verificación en 2 pasos
// 3. Ve a "Contraseñas de aplicaciones"
// 4. Genera una nueva contraseña para "Bitácora de Obra"
// 5. Usa esa contraseña (sin espacios) en GMAIL_APP_PASSWORD

// Para desplegar el backend:
// 1. Sube email-service.js y email-backend.js a un hosting como Railway, Render o Heroku
// 2. Configura las variables de entorno
// 3. Actualiza la URL en app.js: 'https://tu-backend-url.com/api/send-entry-notification'

module.exports = {};