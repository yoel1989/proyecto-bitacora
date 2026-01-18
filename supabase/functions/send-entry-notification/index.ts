// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

console.log("Email notification function initialized!")

Deno.serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      )
    }

    const { entrada } = await req.json()

    if (!entrada) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos de la entrada' }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log('📧 Enviando notificación de nueva entrada:', entrada.titulo)

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Get all active users
    const { data: usuarios, error } = await supabaseClient
      .from('usuarios')
      .select('email, nombre')
      .eq('activo', true)

    if (error) {
      console.error('❌ Error obteniendo usuarios:', error)
      throw error
    }

    console.log(`📧 Enviando notificación a ${usuarios.length} usuarios...`)

    if (usuarios.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No hay usuarios activos para notificar',
          exitos: 0,
          errores: 0
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    }

    // Send emails using Resend API
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const destinatarios = usuarios.map((u: any) => u.email)
    const emailContent = generarContenidoEmailMasivo(usuarios, entrada)

    // Send email via Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Bitácora de Obra <onboarding@resend.dev>',
        to: destinatarios,
        subject: `🔔 Nueva entrada: ${entrada.titulo}`,
        html: emailContent
      })
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text()
      console.error('❌ Error enviando con Resend:', errorData)
      throw new Error(`Resend API error: ${resendResponse.status} - ${errorData}`)
    }

    const resendResult = await resendResponse.json()
    console.log('✅ Email masivo enviado:', resendResult)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notificaciones enviadas: ${destinatarios.length} exitosas, 0 errores`,
        exitos: destinatarios.length,
        errores: 0,
        resendResult
      }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error('❌ Error en función de notificación:', error)
    return new Response(
      JSON.stringify({
        error: 'Error enviando notificación',
        details: error.message
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})

// Generate email content for mass notification
function generarContenidoEmailMasivo(usuarios: any[], entrada: any): string {
  // Take the first user for personalization (or use generic)
  const usuarioEjemplo = usuarios[0] || { nombre: 'Usuario' }

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
            <a href="${Deno.env.get('FRONTEND_URL') || 'https://tu-dominio.com'}" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">
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
  `
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-entry-notification' \
    --header 'Authorization: Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwODQwNjkxNjJ9.Ixzo8tXgca4VMRIhtzWBp6s_b4IuClHA4uBbjBwToQeyi2kG1l9EbHOLH6QCOB3FsrrmRWHkvsuoEzzVdjEV8g' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
