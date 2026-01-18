import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

console.log("Email notification function initialized!")

Deno.serve(async (req) => {
  console.log('=== Edge Function invocada ===')
  console.log('Method:', req.method)
  console.log('Origin:', req.headers.get('origin'))
  console.log('URL:', req.url)

  // Allowed origins including www variant
  const allowedOrigins = [
    'https://bitacoradigital1509.com',
    'https://www.bitacoradigital1509.com',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
  ]

  const origin = req.headers.get('origin') || ''
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : '*'

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight')
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  try {
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Content-Type': 'application/json'
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: corsHeaders }
      )
    }

    const { entrada } = await req.json()

    if (!entrada) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos de la entrada' }),
        { status: 400, headers: corsHeaders }
      )
    }

    console.log('Enviando notificacion de nueva entrada:', entrada.titulo)

    // Verificar variables de entorno
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    console.log('Variables de entorno:')
    console.log('  SUPABASE_URL:', supabaseUrl ? 'OK' : 'NO configurada')
    console.log('  SUPABASE_ANON_KEY:', supabaseAnonKey ? 'OK' : 'NO configurada')
    console.log('  RESEND_API_KEY:', resendApiKey ? 'OK' : 'NO configurada')

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('SUPABASE_URL o SUPABASE_ANON_KEY no configuradas')
    }

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY no configurada')
    }

    // Initialize Supabase client
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

    // Get all active users
    console.log('Obteniendo usuarios de la tabla profiles...')
    const { data: usuarios, error } = await supabaseClient
      .from('profiles')
      .select('email, nombre')
      .not('email', 'is', null)

    if (error) {
      console.error('Error obteniendo usuarios:', error)
      throw new Error('Error obteniendo usuarios: ' + error.message)
    }

    console.log('Usuarios encontrados:', usuarios?.length || 0)

    if (!usuarios || usuarios.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No hay usuarios activos para notificar',
          exitos: 0,
          errores: 0
        }),
        { headers: corsHeaders }
      )
    }

    // Send individual emails to each user with delay to avoid rate limit
    let exitos = 0
    let errores = 0
    const resultados: any[] = []
    const emailHtml = generarEmailHtml(entrada, usuarios.length)

    // Helper function to delay between requests
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    for (let i = 0; i < usuarios.length; i++) {
      const usuario = usuarios[i]

      // Add delay between requests to avoid rate limit (max 2 per second)
      if (i > 0) {
        await delay(600) // 600ms delay = ~1.6 requests per second (safe margin)
      }

      try {
        console.log('Enviando email a: ' + usuario.email)

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + resendApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Bitacora de Obra <bitacora@bitacoradigital1509.com>',
            to: [usuario.email],
            subject: 'Nueva entrada: ' + entrada.titulo,
            html: emailHtml
          })
        })

        if (resendResponse.ok) {
          exitos++
          resultados.push({ email: usuario.email, success: true })
          console.log('Email enviado exitosamente a: ' + usuario.email)
        } else {
          errores++
          const errorData = await resendResponse.text()
          resultados.push({ email: usuario.email, success: false, error: errorData })
          console.error('Error enviando a ' + usuario.email + ':', errorData)
        }
      } catch (err: any) {
        errores++
        resultados.push({ email: usuario.email, success: false, error: err.message })
        console.error('Excepcion enviando a ' + usuario.email + ':', err)
      }
    }

    console.log('Proceso completado: ' + exitos + ' exitosas, ' + errores + ' fallidas')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notificaciones enviadas: ' + exitos + ' exitosas, ' + errores + ' fallidas',
        exitos,
        errores,
        resultados
      }),
      { headers: corsHeaders }
    )

  } catch (err: any) {
    console.error('Error en funcion de notificacion:', err)
    return new Response(
      JSON.stringify({
        error: 'Error enviando notificacion',
        details: err.message
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
  }
})

function generarEmailHtml(entrada: any, totalUsuarios: number): string {
  const fecha = new Date(entrada.fecha).toLocaleString('es-ES')
  const descripcion = entrada.descripcion
    ? '<p style="margin: 10px 0;"><strong>Descripcion:</strong><br>' + entrada.descripcion + '</p>'
    : ''

  return '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '</head>' +
    '<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">' +
    '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">' +
    '<h1 style="color: white; margin: 0; font-size: 24px;">Nueva Entrada en Bitacora</h1>' +
    '</div>' +
    '<div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">' +
    '<p style="font-size: 16px; margin-bottom: 20px;">Se ha registrado una nueva entrada en la bitacora de obra:</p>' +
    '<div style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px;">' +
    '<p style="margin: 5px 0;"><strong>Fecha:</strong> ' + fecha + '</p>' +
    '<p style="margin: 5px 0;"><strong>Titulo:</strong> ' + entrada.titulo + '</p>' +
    '<p style="margin: 5px 0;"><strong>Ubicacion:</strong> ' + entrada.ubicacion + '</p>' +
    '<p style="margin: 5px 0;"><strong>Tipo:</strong> ' + (entrada.tipo_nota || entrada.tipoNota) + '</p>' +
    '<p style="margin: 5px 0;"><strong>Folio:</strong> ' + entrada.folio + '</p>' +
    descripcion +
    '</div>' +
    '<div style="text-align: center; margin: 30px 0;">' +
    '<a href="https://bitacoradigital1509.com" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">Ver en Bitacora</a>' +
    '</div>' +
    '<p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">' +
    '<strong>Bitacora de Obra</strong><br>' +
    'Sistema de gestion de proyectos de construccion<br>' +
    '<em>Este es un email automatico enviado a ' + totalUsuarios + ' usuarios registrados.</em>' +
    '</p>' +
    '</div>' +
    '</body>' +
    '</html>'
}
