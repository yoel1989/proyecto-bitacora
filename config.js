// Configuración de Supabase
// Nota: Para producción considera usar variables de entorno en tu plataforma de hosting
const SUPABASE_URL = 'https://mqxguprzpypcyyusvfrf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeGd1cHJ6cHlwY3l5dXN2ZnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNjc4NjEsImV4cCI6MjA4MTg0Mzg2MX0.OXxl1n3a0Y5HtoUUBnm-vEE1WvAY86VJvdQ0phAsoSY';

// Crear cliente de Supabase (solo si está disponible)
let supabaseClient = null;
try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        const { createClient } = supabase;
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase client inicializado correctamente');
    } else {
        console.warn('⚠️ Supabase no está disponible - funcionando en modo offline');
    }
} catch (error) {
    console.warn('⚠️ Error inicializando Supabase:', error.message);
    console.warn('⚠️ Funcionando en modo offline');
}