const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

// Inicializar Resend
const resend = new Resend(process.env.RESEND_API_KEY || 'tu-api-key-de-resend');

const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Endpoint para enviar notificaciones de nuevas entradas
app.post('/api/send-entry-notification', async (req, res) => {
    try {
        const { entrada } = req.body;

        if (!entrada) {
            return res.status(400).json({
                error: 'Faltan datos de la entrada'
            });
        }

        console.log('📧 Enviando notificación de nueva entrada:', entrada.titulo);

        // Usar el servicio de email para notificar a todos
        const { notificarATodosUsuarios } = require('./email-service');
        const resultado = await notificarATodosUsuarios(entrada);

        console.log('✅ Notificaciones enviadas:', resultado);
        res.json({
            success: true,
            message: `Notificaciones enviadas: ${resultado.exitos} exitosas, ${resultado.errores} errores`,
            ...resultado
        });

    } catch (error) {
        console.error('❌ Error enviando notificación:', error);
        res.status(500).json({
            error: 'Error enviando notificación',
            details: error.message
        });
    }
});

// Endpoint para enviar correo de invitación
app.post('/api/send-invitation', async (req, res) => {
    try {
        const { to_email, to_name, invitation_code, role_name, expiration_hours, app_url } = req.body;

        if (!to_email || !invitation_code) {
            return res.status(400).json({ 
                error: 'Faltan datos requeridos' 
            });
        }

        console.log('📧 Enviando correo de invitación a:', to_email);
        console.log('📧 Código:', invitation_code);
        console.log('📧 Rol:', role_name);

        // Enviar correo usando Resend
        const { data, error } = await resend.emails.send({
            from: 'Bitácora de Obra <onboarding@resend.dev>',
            to: [to_email],
            subject: '🎫 Tu código de invitación para Bitácora de Obra',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">🎫 Invitación a Bitácora de Obra</h1>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
                        
                        <p style="font-size: 18px; margin-bottom: 20px;">
                            Hola <strong>${to_name}</strong>,
                        </p>
                        
                        <p style="margin-bottom: 20px;">
                            Has sido invitado a unirte a la <strong>Bitácora de Obra</strong> con el rol de:
                        </p>
                        
                        <div style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px;">
                            <p style="margin: 0; font-size: 16px; color: #667eea; font-weight: bold;">
                                📋 Rol: <span style="color: #333;">${role_name}</span>
                            </p>
                        </div>
                        
                        <p style="margin-bottom: 20px;">
                            Tu código de invitación es:
                        </p>
                        
                        <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 25px; text-align: center; border-radius: 10px; margin: 20px 0; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                            <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px;">CÓDIGO DE INVITACIÓN</p>
                            <h2 style="margin: 0; font-size: 36px; letter-spacing: 8px; font-weight: bold;">${invitation_code}</h2>
                        </div>
                        
                        <p style="margin-bottom: 20px;">
                            <strong>⏰ Vigencia:</strong> Este código expira en <strong>${expiration_hours} horas</strong>
                        </p>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin: 20px 0;">
                            <p style="margin: 0; font-size: 14px; color: #856404;">
                                <strong>📝 Para registrarte:</strong><br>
                                1. Ve a la aplicación: <a href="${app_url}" style="color: #667eea; text-decoration: none; font-weight: bold;">${app_url}</a><br>
                                2. Haz clic en "¿No tienes cuenta? Regístrate con código de invitación"<br>
                                3. Ingresa el código: <strong>${invitation_code}</strong><br>
                                4. Completa el registro con tu correo y contraseña
                            </p>
                        </div>
                        
                        <p style="margin-bottom: 20px;">
                            Si tienes alguna pregunta, contacta con el administrador del sistema.
                        </p>
                        
                        <p style="margin-bottom: 0; font-size: 14px; color: #666; text-align: center;">
                            🏗️ Bitácora de Obra<br>
                            Sistema de gestión de proyectos de construcción
                        </p>
                    </div>
                    
                </body>
                </html>
            `
        });

        if (error) {
            console.error('❌ Error enviando correo:', error);
            return res.status(500).json({ 
                error: 'Error enviando correo',
                details: error.message 
            });
        }

        console.log('✅ Correo enviado exitosamente:', data);
        res.json({ 
            success: true, 
            message: 'Correo enviado exitosamente',
            data 
        });

    } catch (error) {
        console.error('❌ Error en el endpoint:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            details: error.message 
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Email service is running' });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`📧 Email service corriendo en http://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
