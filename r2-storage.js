// Cloudflare R2 Storage Service
// Reemplaza Supabase Storage para archivos más económicos

const R2_WORKER_URL = process.env.R2_WORKER_URL || 'https://bitacora-upload-worker.tu-usuario.workers.dev';

/**
 * Sube un archivo a Cloudflare R2
 * @param {File} file - Archivo a subir
 * @returns {Promise<{url: string, name: string, type: string, size: number}>}
 */
async function uploadFileToR2(file) {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', cleanFileName);
    
    const response = await fetch(`${R2_WORKER_URL}/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error subiendo archivo');
    }
    
    return await response.json();
}

/**
 * Elimina un archivo de Cloudflare R2
 * @param {string} fileName - Nombre del archivo a eliminar
 * @returns {Promise<void>}
 */
async function deleteFileFromR2(fileName) {
    const response = await fetch(`${R2_WORKER_URL}/delete/${fileName}`, {
        method: 'DELETE'
    });
    
    if (!response.ok) {
        const error = await response.json();
        console.warn('No se pudo eliminar archivo:', error.error);
    }
}

/**
 * Elimina múltiples archivos de Cloudflare R2
 * @param {Array<{url: string, name: string}>} archivos - Lista de archivos a eliminar
 */
async function deleteMultipleFilesFromR2(archivos) {
    const deletePromises = archivos.map(archivo => {
        const url = typeof archivo === 'string' ? archivo : archivo.url;
        if (!url) return Promise.resolve();
        
        // Extraer el nombre del archivo de la URL
        const urlParts = url.split('/download/');
        if (urlParts.length > 1) {
            return deleteFileFromR2(urlParts[1]);
        }
        return Promise.resolve();
    });
    
    await Promise.all(deletePromises);
}

/**
 * Convierte una URL de Supabase Storage a Cloudflare R2
 * Útil para migración de datos existentes
 * @param {string} supabaseUrl - URL de Supabase Storage
 * @returns {string|null} URL de Cloudflare R2 o null si no es aplicable
 */
function convertSupabaseUrlToR2(supabaseUrl) {
    if (!supabaseUrl || typeof supabaseUrl !== 'string') return null;
    
    // Si ya es una URL de R2, devolverla tal cual
    if (supabaseUrl.includes('/download/')) {
        return supabaseUrl;
    }
    
    // Si es de Supabase Storage, extraer el nombre del archivo
    const urlParts = supabaseUrl.split('/storage/v1/object/public/archivos-obra/');
    if (urlParts.length > 1) {
        const fileName = urlParts[1];
        return `${R2_WORKER_URL}/download/${fileName}`;
    }
    
    return null;
}

// Exportar funciones para usar en app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        uploadFileToR2,
        deleteFileFromR2,
        deleteMultipleFilesFromR2,
        convertSupabaseUrlToR2
    };
}
