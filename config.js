// Configuración de producción para GitHub Pages
const SUPABASE_URL = 'https://mqxguprzpypcyyusvfrf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VoPfjSjRMUNNKLXjoI335g_ZR3zcUdm';

// Usar variables de entorno en desarrollo, producción pública en GitHub Pages
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);