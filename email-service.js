// email-service.js
const nodemailer = require('nodemailer');

// Configurar transporter con Gmail
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: 'tu-email@gmail.com',
    pass: 'tu-contraseña-de-aplicacion'
  }
});

// Verificar conexión
transporter.verify((error, success) => {
  if (error) {
    console.error('Error configurando email:', error);
  } else {
    console.log('✅ Servidor de email listo para enviar');
  }
});

// Función para enviar notificación a todos los usuarios
async function notificarATodosUsuarios(entrada) {
  try {
    // Obtener todos los usuarios de Supabase
    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('email, nombre')
      .eq('activo', true);
    
    if (error) throw error;
    
    console.log(`📧 Enviando notificación a ${usuarios.length} usuarios...`);
    
    // Enviar email a cada usuario
    const promesas = usuarios.map(usuario => 
      enviarEmailIndividual(usuario, entrada)
    );
    
    const resultados = await Promise.allSettled(promesas);
    
    // Contar éxitos y errores
    const exitos = resultados.filter(r => r.status === 'fulfilled').length;
    const errores = resultados.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Emails enviados: ${exitos} | ❌ Errores: ${errores}`);
    
    return { exitos, errores };
    
  } catch (error) {
    console.error('❌ Error en notificación masiva:', error);
    throw error;
  }
}

// Función para enviar email individual
async function enviarEmailIndividual(usuario, entrada) {
  const contenidoEmail = generarContenidoEmail(usuario, entrada);
  
  try {
    await transporter.sendMail(contenidoEmail);
    console.log(`✅ Email enviado a: ${usuario.email}`);
  } catch (error) {
    console.error(`❌ Error enviando a ${usuario.email}:`, error);
    throw error;
  }
}

// Generar contenido del email
function generarContenidoEmail(usuario, entrada) {
  return {
    to: usuario.email,
    from: `Bitácora Obra <tu-email@gmail.com>`,
    subject: `🔔 Nueva entrada: ${entrada.titulo}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; text-align: center;">🏗️ Bitácora de Obra</h1>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
          <h2 style="color: #2c3e50; margin-bottom: 20px;">Nueva Entrada Registrada</h2>
          
          <p style="color: #666; margin-bottom: 10px;">
            <strong>Estimado/a ${usuario.nombre || 'Usuario'},</strong>
          </p>
          
          <p style="color: #666; margin-bottom: 20px;">
            Se ha registrado una nueva entrada en la bitácora:
          </p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 5px 0;"><strong>📅 Fecha:</strong> ${new Date(entrada.fecha).toLocaleString('es-ES')}</p>
            <p style="margin: 5px 0;"><strong>📝 Título:</strong> ${entrada.titulo}</p>
            <p style="margin: 5px 0;"><strong>📍 Ubicación:</strong> ${entrada.ubicacion}</p>
            <p style="margin: 5px 0;"><strong>📋 Tipo:</strong> ${entrada.tipoNota}</p>
            <p style="margin: 5px 0;"><strong>⚡ Estado:</strong> ${entrada.estado}</p>
            ${entrada.descripcion ? `<p style="margin: 10px 0;"><strong>📄 Descripción:</strong><br>${entrada.descripcion}</p>` : ''}
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="http://localhost:3000" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block;">
              Ver en Bitácora
            </a>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
            Este es un email automático. No responder.
          </p>
        </div>
      </div>
    `
  };
}

// Función de prueba
async function probarEmail() {
  try {
    const usuarioPrueba = { email: 'tu-email@gmail.com', nombre: 'Usuario Prueba' };
    const entradaPrueba = {
      titulo: 'Entrada de Prueba',
      descripcion: 'Esta es una entrada de prueba para verificar el sistema de notificaciones',
      ubicacion: 'Sitio de Prueba',
      tipoNota: 'avance',
      estado: 'pendiente',
      fecha: new Date().toISOString()
    };
    
    await enviarEmailIndividual(usuarioPrueba, entradaPrueba);
    console.log('🎉 Email de prueba enviado exitosamente');
  } catch (error) {
    console.error('❌ Error en prueba:', error);
  }
}

module.exports = {
  notificarATodosUsuarios,
  enviarEmailIndividual,
  probarEmail
};