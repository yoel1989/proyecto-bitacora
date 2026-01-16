const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mqxguprzpypcyyusvfrf.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeGd1cHJ6cHlwY3l5dXN2ZnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjI2Nzg2MSwiZXhwIjoyMDgxODQzODYxfQ.7eBWeJSkU4qxG5Z1Oy_opcDAavRLr6xCOpXegwE5mHQ'; // Reemplaza con tu clave de servicio

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function deleteUser(userId) {
    try {
        const { error } = await supabase.auth.admin.deleteUser(userId);
        if (error) {
            console.error('Error eliminando usuario:', error);
        } else {
            console.log('Usuario eliminado exitosamente');
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

// Reemplaza 'USER_ID_AQUI' con el ID del usuario a eliminar
deleteUser('c8b34a1f-3d06-40af-92ab-cae66642b577');