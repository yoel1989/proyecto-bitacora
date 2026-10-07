// email-service.js
// Importar Resend para envío de emails
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
require('dotenv').config();

// Configuración
const SUPABASE_URL = 'https://mqxguprzpypcyyusvfrf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeGd1cHJ6cHlwY3l5dXN2ZnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNjc4NjEsImV4cCI6MjA4MTg0Mzg2MX0.OXxl1n3a0Y5HtoUUBnm-vEE1WvAY86VJvdQ0phAsoSY';
const FRONTEND_URL = 'https://bitacoradigital1509.com';

// ⚠️ La API key se lee de RESEND_API_KEY; nunca escribirla en el código
if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY no está configurada. Los correos no se podrán enviar.');
}
const resend = new Resend(process.env.RESEND_API_KEY);

// Verificar conexión con Resend
console.log('✅ Resend configurado para envío de emails');

// Función para enviar notificación a todos los usuarios
async function notificarATodosUsuarios(entrada) {
  try {
    // Obtener todos los usuarios de Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL || SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY
    );

    // Usar tabla 'profiles' en lugar de 'usuarios'
    const { data: usuarios, error } = await supabase
      .from('profiles')
      .select('email, nombre')
      .not('email', 'is', null);

    if (error) throw error;

    console.log(`📧 Enviando notificación a ${usuarios.length} usuarios...`);

    // Crear lista de destinatarios
    const destinatarios = usuarios.map(u => u.email);

    // Enviar email masivo con Resend
    const { data, error: sendError } = await resend.emails.send({
      from: 'Bitacora de Obra <bitacora@bitacoradigital1509.com>',
      to: destinatarios,
      subject: `🔔 Nueva entrada: ${entrada.titulo}`,
      html: generarContenidoEmailMasivo(usuarios, entrada)
    });

    if (sendError) {
      console.error('❌ Error enviando con Resend:', sendError);
      throw sendError;
    }

    console.log(`✅ Email masivo enviado a ${destinatarios.length} usuarios`);
    return { exitos: destinatarios.length, errores: 0 };

  } catch (error) {
    console.error('❌ Error en notificación masiva:', error);
    throw error;
  }
}

// Función para enviar email individual (usando Resend)
async function enviarEmailIndividual(usuario, entrada) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Bitacora de Obra <bitacora@bitacoradigital1509.com>',
      to: [usuario.email],
      subject: `🔔 Nueva entrada: ${entrada.titulo}`,
      html: generarContenidoEmailMasivo([usuario], entrada)
    });

    if (error) {
      console.error(`❌ Error enviando a ${usuario.email}:`, error);
      throw error;
    }

    console.log(`✅ Email enviado a: ${usuario.email}`);
  } catch (error) {
    console.error(`❌ Error enviando a ${usuario.email}:`, error);
    throw error;
  }
}

// Generar contenido del email masivo
function generarContenidoEmailMasivo(usuarios, entrada) {
  // Tomar el primer usuario para personalización (o usar genérico)
  const usuarioEjemplo = usuarios[0] || { nombre: 'Usuario' };

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🔔 Nueva Entrada en Bitácora</h1>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">

          <p style="font-size: 16px; margin-bottom: 20px;">
            Se ha registrado una nueva entrada en la bitácora de obra:
          </p>

          <div style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 5px 0;"><strong>📅 Fecha:</strong> ${new Date(entrada.fecha).toLocaleString('es-ES')}</p>
            <p style="margin: 5px 0;"><strong>📝 Título:</strong> ${entrada.titulo}</p>
            <p style="margin: 5px 0;"><strong>📍 Ubicación:</strong> ${entrada.ubicacion}</p>
            <p style="margin: 5px 0;"><strong>📋 Tipo:</strong> ${entrada.tipo_nota || entrada.tipoNota}</p>
            <p style="margin: 5px 0;"><strong>🏷️ Folio:</strong> ${entrada.folio}</p>
            ${entrada.descripcion ? `<p style="margin: 10px 0;"><strong>📄 Descripción:</strong><br>${entrada.descripcion}</p>` : ''}
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || FRONTEND_URL}" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">
              📋 Ver en Bitácora
            </a>
          </div>

          <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
            🏗️ <strong>Bitácora de Obra</strong><br>
            Sistema de gestión de proyectos de construcción<br>
            <em>Este es un email automático enviado a ${usuarios.length} usuarios registrados.</em>
          </p>
        </div>

    </body>
    </html>
  `;
}

// Endpoint para recibir notificaciones desde el frontend
async function enviarNotificacionDesdeFrontend(entrada) {
  try {
    console.log('📧 Recibida solicitud de notificación desde frontend');
    const resultado = await notificarATodosUsuarios(entrada);
    return { success: true, ...resultado };
  } catch (error) {
    console.error('❌ Error procesando notificación desde frontend:', error);
    throw error;
  }
}

// Función de prueba
async function probarEmail() {
  try {
    const entradaPrueba = {
      titulo: 'Entrada de Prueba - Sistema de Notificaciones',
      descripcion: 'Esta es una entrada de prueba para verificar que el sistema de notificaciones por email funciona correctamente.',
      ubicacion: 'Troncal Calle 26',
      tipo_nota: 'avance',
      estado: 'activo',
      fecha: new Date().toISOString(),
      folio: 'TEST-001'
    };

    // Obtener usuarios de prueba (los primeros 2 usuarios activos)
    const supabase = createClient(
      process.env.SUPABASE_URL || SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY
    );

    const { data: usuarios, error } = await supabase
      .from('profiles')
      .select('email, nombre')
      .not('email', 'is', null)
      .limit(2);

    if (error || !usuarios || usuarios.length === 0) {
      console.log('⚠️ No hay usuarios activos para probar. Usando email de prueba.');
      // Enviar a un email de prueba si no hay usuarios
      const { data, error: sendError } = await resend.emails.send({
        from: 'Bitacora de Obra <bitacora@bitacoradigital1509.com>',
        to: [process.env.TEST_EMAIL || 'escobaryoel7@gmail.com'],
        subject: `🧪 PRUEBA - ${entradaPrueba.titulo}`,
        html: generarContenidoEmailMasivo([{ nombre: 'Usuario de Prueba' }], entradaPrueba)
      });

      if (sendError) throw sendError;
    } else {
      // Enviar a usuarios reales
      await notificarATodosUsuarios(entradaPrueba);
    }

    console.log('🎉 Email de prueba enviado exitosamente');
  } catch (error) {
    console.error('❌ Error en prueba:', error);
  }
}

module.exports = {
  notificarATodosUsuarios,
  enviarEmailIndividual,
  enviarNotificacionDesdeFrontend,
  probarEmail
};