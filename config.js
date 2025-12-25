// Configuración de producción para GitHub Pages
const SUPABASE_URL = 'https://mqxguprzpypcyyusvfrf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeGd1cHJ6cHlwY3l5dXN2ZnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNjc4NjEsImV4cCI6MjA4MTg0Mzg2MX0.OXxl1n3a0Y5HtoUUBnm-vEE1WvAY86VJvdQ0phAsoSY';

// Usar variables de entorno en desarrollo, producción pública en GitHub Pages
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);