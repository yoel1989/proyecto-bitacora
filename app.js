// Supabase client está configurado en config.js
// Asegúrate de que config.js se cargue antes que app.js

// Registrar Service Worker para modo offline
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Usar ruta relativa para compatibilidad con diferentes entornos
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('✅ Service Worker registrado:', registration.scope);

                // Escuchar actualizaciones del SW
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Nueva versión disponible
                                showNotification('🔄 Nueva versión disponible. Actualiza la página para aplicar cambios.', 'info', 5000);
                            }
                        });
                    }
                });
            })
            .catch((error) => {
                console.error('❌ Error registrando Service Worker:', error);
            });
    });
} else {
    console.warn('⚠️ Service Worker no soportado en este navegador');
}

if (typeof window !== 'undefined' && window.indexedDB) {
    // IndexedDB está disponible
} else {
    console.error('❌ IndexedDB no está disponible');
}

// Variable para evitar notificaciones durante la carga inicial
let initialLoadComplete = false;

// Función para verificar y actualizar estado de conexión
async function updateConnectionStatus(showNotifications = true) {
    const wasOnline = isOnline;
    const navigatorOnline = navigator.onLine;

    // Usar verificación REAL de conectividad, no solo navigator.onLine
    console.log('📡 🔍 VERIFICANDO CONECTIVIDAD REAL...');

    const realOnline = await checkRealConnectivity().catch(() => false);
    isOnline = realOnline;

    console.log(`📡 updateConnectionStatus: wasOnline=${wasOnline}, isOnline=${isOnline}, navigator.onLine=${navigatorOnline}, realOnline=${realOnline}, offlineMode=${offlineMode}`);

    if (wasOnline !== isOnline) {
        console.log(`📡 Estado de conexión cambió: ${wasOnline} -> ${isOnline}`);
        if (isOnline) {
            console.log('🟢 Conexión real restaurada - activando modo online');
            offlineMode = false;
            document.body.classList.remove('offline-mode');
            if (showNotifications && initialLoadComplete) {
                showNotification('🟢 Conexión restaurada', 'success', 2000);
            }
            // Actualizar rol del usuario cuando se recupera conexión
            if (currentUser && supabaseClient) {
                await refreshUserRole();
            }
            syncOfflineQueue();
            loadBitacoraEntries(1, false);
        } else {
            console.log('🔴 Sin conexión REAL detectada - activando modo offline');
            offlineMode = true;
            document.body.classList.add('offline-mode');
            if (showNotifications && initialLoadComplete) {
                showNotification('🔴 Conexión perdida - Trabajando offline', 'warning', 3000);
            }

            console.log('🔴 Cargando entradas offline...');
            await loadOfflineEntries();
        }
    } else {
        console.log('📡 Estado de conexión sin cambios');
    }
}

// Función para refrescar el rol del usuario cuando vuelve la conexión
async function refreshUserRole() {
    if (!currentUser || !supabaseClient) return;

    try {
        console.log('🔄 Refrescando rol del usuario...');
        const { data: profile } = await Promise.race([
            supabaseClient
                .from('profiles')
                .select('rol, nombre')
                .eq('id', currentUser.id)
                .single(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 3000)
            )
        ]);

        if (profile) {
            currentUser.role = profile.rol || 'user';
            currentUser.nombre = profile.nombre;

            // Actualizar localStorage
            const savedSession = localStorage.getItem('bitacora_session');
            if (savedSession) {
                const sessionData = JSON.parse(savedSession);
                sessionData.user.role = currentUser.role;
                sessionData.user.nombre = currentUser.nombre;
                localStorage.setItem('bitacora_session', JSON.stringify(sessionData));
            }

            // Actualizar UI
            const displayName = currentUser.nombre || currentUser.email || 'Usuario';
            document.getElementById('userName').textContent = displayName;
            document.getElementById('userRole').textContent = '(' + getRoleDisplayName(currentUser.role) + ')';

            const manageUsersBtn = document.getElementById('manageUsersBtn');
            if (manageUsersBtn) {
                manageUsersBtn.style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
            }

            console.log('✅ Rol actualizado:', currentUser.role);
        }
    } catch (error) {
        console.warn('⚠️ Error refrescando rol:', error);
    }
}

// Detectar cambios de conexión
window.addEventListener('online', async () => {
    console.log('🎯 Evento "online" disparado - verificando conexión real');
    await updateConnectionStatus();
});

window.addEventListener('offline', async () => {
    console.log('🎯 Evento "offline" disparado - verificando pérdida de conexión');
    await updateConnectionStatus();
});

// Función para verificar conectividad real con ping
async function checkRealConnectivity() {
    try {
        console.log('🌐 Verificando conectividad real...');

        // Intentar hacer un fetch rápido a un endpoint confiable
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout más largo: 5 segundos

        const response = await fetch('https://httpbin.org/status/200', {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache',
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('✅ Ping exitoso - conexión real disponible');
        return true;
    } catch (error) {
        console.log('❌ Ping falló - sin conexión real:', error.message);

        // Verificación adicional: intentar con un endpoint diferente
        try {
            console.log('🌐 Intentando verificación secundaria...');
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), 3000);

            await fetch('https://www.google.com/favicon.ico', {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-cache',
                signal: controller2.signal
            });

            clearTimeout(timeoutId2);
            console.log('✅ Verificación secundaria exitosa');
            return true;
        } catch (error2) {
            console.log('❌ Verificación secundaria también falló:', error2.message);
            return false;
        }
    }
}

// Check periódico de conectividad REAL (cada 30 segundos - más razonable)
console.log('🌐 Iniciando check periódico de conectividad (cada 30 segundos)');
setInterval(async () => {
    try {
        const wasOnline = isOnline;
        const realOnline = await checkRealConnectivity();

        // Log solo cuando hay cambio o cada 10 checks
        if (realOnline !== wasOnline || Math.random() < 0.1) {
            console.log(`🌐 Check periódico: wasOnline=${wasOnline}, realOnline=${realOnline}, current isOnline=${isOnline}`);
        }

        if (realOnline !== wasOnline) {
            console.log(`🌐 ========== CAMBIO DETECTADO: ${wasOnline} -> ${realOnline} ==========`);

            if (realOnline) {
                console.log('🟢 CONEXIÓN RESTAURADA - activando modo online');
                isOnline = true;
                offlineMode = false;
                document.body.classList.remove('offline-mode');
                showNotification('🟢 Conexión restaurada', 'success', 2000);

                // Sincronizar y recargar
                console.log('🟢 Sincronizando queue...');
                await syncOfflineQueue();
                console.log('🟢 Recargando entradas...');
                await loadBitacoraEntries(1, false);
                console.log('🟢 Modo online activado completamente');
            } else {
                console.log('🔴 CONEXIÓN PERDIDA - activando modo offline');
                isOnline = false;
                offlineMode = true;
                document.body.classList.add('offline-mode');
                showNotification('🔴 Sin conexión - Trabajando offline', 'warning', 5000);

                console.log('🔴 Cargando entradas offline...');
                await loadOfflineEntries();
                console.log('🔴 Modo offline activado completamente');
            }
        }
    } catch (error) {
        console.error('❌ Error en check periódico:', error);
    }
}, 30000);

// Verificar conexión real inmediatamente (sin notificaciones)
console.log('🚀 Verificación inicial de conexión real');
checkRealConnectivity().then(realOnline => {
    console.log(`🚀 Conectividad real inicial: ${realOnline}`);
    isOnline = realOnline;
    offlineMode = !realOnline;
    if (!realOnline) {
        document.body.classList.add('offline-mode');
    }
    // Marcar que la carga inicial está completa después de un breve delay
    setTimeout(() => {
        initialLoadComplete = true;
    }, 2000);
});

// Función para sincronizar cuando vuelve la conexión
async function syncOfflineQueue() {
    try {
        if (!dbManager || !isOnline) return;

        console.log('🔄 Iniciando sincronización...');

        const queueItems = await dbManager.getQueueItems();

        if (queueItems.length === 0) {
            console.log('✅ Queue vacío, nada que sincronizar');
            return;
        }

        console.log(`🔄 Procesando ${queueItems.length} items del queue...`);

        for (const item of queueItems) {
            try {
                console.log(`🔄 Procesando item: ${item.action}`);

                if (item.action === 'create_entry') {
                    await createEntryOnline(item.data);
                } else if (item.action === 'update_entry') {
                    await updateEntryOnline(item.data);
                } else if (item.action === 'delete_entry') {
                    await deleteEntryOnline(item.data.id);
                }

                await dbManager.markQueueItemAsSynced(item.id);
                console.log(`✅ Item sincronizado: ${item.id}`);
            } catch (error) {
                console.error(`❌ Error sincronizando item ${item.id}:`, error);
            }
        }

        showNotification(`✅ ${queueItems.length} cambios sincronizados`, 'success', 3000);
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
    }
}

// Crear entrada online (usar Supabase)
async function createEntryOnline(entryData) {
    if (!supabaseClient) {
        throw new Error('Supabase no disponible - no se puede crear entrada online');
    }

    const { data, error } = await supabaseClient
        .from('bitacora')
        .insert([{
            titulo: entryData.titulo,
            descripcion: entryData.descripcion,
            fecha: entryData.fecha,
            hora_inicio: entryData.hora_inicio,
            hora_final: entryData.hora_final,
            tipo_nota: entryData.tipo_nota,
            ubicacion: entryData.ubicacion,
            user_id: currentUser?.id,
            folio: entryData.folio
        }])
        .select()
        .single();

    if (error) throw error;

    return data;
}

// Actualizar entrada online
async function updateEntryOnline(entryData) {
    if (!supabaseClient) {
        throw new Error('Supabase no disponible - no se puede actualizar entrada online');
    }

    const { error } = await supabaseClient
        .from('bitacora')
        .update({
            titulo: entryData.titulo,
            descripcion: entryData.descripcion,
            fecha: entryData.fecha,
            hora_inicio: entryData.hora_inicio,
            hora_final: entryData.hora_final,
            tipo_nota: entryData.tipo_nota,
            ubicacion: entryData.ubicacion
        })
        .eq('id', entryData.id)
        .select();

    if (error) throw error;
}

// Eliminar entrada online
async function deleteEntryOnline(id) {
    if (!supabaseClient) {
        throw new Error('Supabase no disponible - no se puede eliminar entrada online');
    }

    const { error } = await supabaseClient
        .from('bitacora')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// Cargar entradas desde IndexedDB cuando está offline
async function loadOfflineEntries() {
    console.log('🔧 ========== LOAD OFFLINE ENTRIES ==========');
    console.log('🔧 Timestamp:', new Date().toISOString());
    console.log('🔧 Estado del sistema:');
    console.log('  - navigator.onLine:', navigator.onLine);
    console.log('  - isOnline:', isOnline);
    console.log('  - offlineMode:', offlineMode);
    console.log('  - dbManager existe:', !!dbManager);
    console.log('  - currentUser existe:', !!currentUser);

    try {
        console.log('🔧 Verificando dbManager...');
        if (!dbManager) {
            console.error('❌ dbManager no disponible');
            showNotification('❌ Base de datos offline no disponible', 'error', 3000);
            return;
        }

        console.log('🔧 dbManager encontrado, inicializando si es necesario...');
        // Asegurar que IndexedDB esté inicializado
        if (!dbManager.db) {
            console.log('🔧 Inicializando IndexedDB...');
            await dbManager.init();
            console.log('✅ IndexedDB inicializado en loadOfflineEntries');
        }

        console.log('🔧 Consultando IndexedDB...');
        const offlineEntries = await dbManager.getAllEntries();
        console.log(`📦 IndexedDB retornó ${offlineEntries.length} entradas`);

        // Log detallado de las entradas
        if (offlineEntries.length > 0) {
            console.log('📦 Detalles de entradas encontradas:');
            offlineEntries.forEach((entry, index) => {
                console.log(`  ${index + 1}. ID: ${entry.id}, Título: ${entry.titulo}, Fecha: ${entry.fecha}`);
            });
        }

        if (offlineEntries.length === 0) {
            console.log('ℹ️ No hay entradas en IndexedDB');
            showNotification('ℹ️ No hay datos offline disponibles', 'info', 3000);
            // Limpiar UI
            allEntries = [];
            totalEntries = 0;
            currentPage = 1;
            await filterAndDisplayEntries();
            updatePaginationInfo();
            return;
        }

        console.log('🔧 Procesando entradas para UI...');
        // Procesar entradas
        allEntries = offlineEntries.map(entry => ({
            ...entry,
            profiles: {
                email: entry.profiles?.email || entry.user_id || 'Usuario offline'
            }
        }));

        totalEntries = offlineEntries.length;
        currentPage = 1;

        console.log(`✅ Procesadas ${allEntries.length} entradas para UI`);
        console.log('✅ Primera entrada procesada:', allEntries[0] ? {
            id: allEntries[0].id,
            titulo: allEntries[0].titulo,
            fecha: allEntries[0].fecha,
            email: allEntries[0].profiles?.email
        } : 'Ninguna');

        // Actualizar UI
        console.log('🔧 Actualizando interfaz...');
        await filterAndDisplayEntries();
        updatePaginationInfo();

        console.log('✅ ========== CARGA OFFLINE COMPLETADA ==========');
        showNotification(`📦 ${offlineEntries.length} entradas cargadas (offline)`, 'success', 2000);

    } catch (error) {
        console.error('❌ ========== ERROR EN CARGA OFFLINE ==========');
        console.error('❌ Error:', error);
        console.error('❌ Stack:', error.stack);
        showNotification('❌ Error cargando datos offline', 'error', 3000);

        // Limpiar UI en caso de error
        allEntries = [];
        totalEntries = 0;
        currentPage = 1;
        await filterAndDisplayEntries();
        updatePaginationInfo();
    }
}

// Cloudflare R2 Worker URL para almacenamiento de archivos
const R2_WORKER_URL = 'https://bitacora-upload-worker.bitacoradeobra.workers.dev';

// Importar servicio de email (solo en servidor)
// const { notificarATodosUsuarios } = require('./email-service.js');

// Funciones de Cloudflare R2
async function uploadFileToR2(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', file.name);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos timeout

        const response = await fetch(`${R2_WORKER_URL}/upload`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error subiendo archivo');
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Error en uploadFileToR2:', error);
        if (error.name === 'AbortError') {
            throw new Error('Timeout: La subida del archivo tardó demasiado');
        }
        throw new Error('Error de conexión al subir archivo: ' + error.message);
    }
}

async function deleteFileFromR2(fileName) {
    const response = await fetch(`${R2_WORKER_URL}/delete/${fileName}`, {
        method: 'DELETE'
    });
    
    if (!response.ok) {
        const error = await response.json();
        console.warn('No se pudo eliminar archivo:', error.error);
    }
}

async function deleteMultipleFilesFromR2(archivos) {
    const deletePromises = archivos.map(archivo => {
        const url = typeof archivo === 'string' ? archivo : archivo.url;
        if (!url) return Promise.resolve();
        
        const urlParts = url.split('/download/');
        if (urlParts.length > 1) {
            return deleteFileFromR2(urlParts[1]);
        }
        return Promise.resolve();
    });
    
    await Promise.all(deletePromises);
}

// Ignorar errores no relacionados con la aplicación (como MetaMask)
window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('MetaMask')) {
        e.preventDefault();
        return false;
    }
});

window.addEventListener('unhandledrejection', function(e) {
    if (e.reason && e.reason.message && e.reason.message.includes('MetaMask')) {
        e.preventDefault();
        return false;
    }
});

let currentUser = null;
let allEntries = [];
let currentPage = 1;
const ENTRIES_PER_PAGE = 50;
let isLoadingEntries = false;
let totalEntries = 0;
let isOnline = true;
let offlineMode = false;

// IndexedDB Manager para funcionalidad offline
class IndexedDBManager {
    constructor() {
        this.dbName = 'BitacoraDB';
        this.version = 3;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('❌ Error abriendo IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB inicializada');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('🔧 Actualizando IndexedDB...');

                // Crear object store para entradas
                if (!db.objectStoreNames.contains('entries')) {
                    const entriesStore = db.createObjectStore('entries', { keyPath: 'id' });
                    entriesStore.createIndex('fecha', 'fecha', { unique: false });
                    entriesStore.createIndex('user_id', 'user_id', { unique: false });
                    console.log('📦 Object store "entries" creado');
                }

                // Crear object store para queue de sincronización
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                    queueStore.createIndex('action', 'action', { unique: false });
                    queueStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('📦 Object store "syncQueue" creado');
                }
            };
        });
    }

    async saveEntry(entry) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['entries'], 'readwrite');
            const store = transaction.objectStore('entries');

            const request = store.put(entry);

            request.onsuccess = () => {
                console.log('✅ Entrada guardada en IndexedDB:', entry.id);
                resolve(entry);
            };

            request.onerror = () => {
                console.error('❌ Error guardando entrada:', request.error);
                reject(request.error);
            };
        });
    }

    async getAllEntries() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['entries'], 'readonly');
            const store = transaction.objectStore('entries');
            const index = store.index('fecha');

            const request = index.openCursor(null, 'prev'); // Orden descendente por fecha
            const results = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    console.log(`📦 ${results.length} entradas recuperadas de IndexedDB`);
                    resolve(results);
                }
            };

            request.onerror = () => {
                console.error('❌ Error obteniendo entradas:', request.error);
                reject(request.error);
            };
        });
    }

    async getEntryById(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['entries'], 'readonly');
            const store = transaction.objectStore('entries');

            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                console.error('❌ Error obteniendo entrada:', request.error);
                reject(request.error);
            };
        });
    }

    async deleteEntry(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['entries'], 'readwrite');
            const store = transaction.objectStore('entries');

            const request = store.delete(id);

            request.onsuccess = () => {
                console.log('✅ Entrada eliminada de IndexedDB:', id);
                resolve();
            };

            request.onerror = () => {
                console.error('❌ Error eliminando entrada:', request.error);
                reject(request.error);
            };
        });
    }

    async addToQueue(action, data) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');

            const queueItem = {
                action,
                data,
                timestamp: new Date().toISOString(),
                synced: false
            };

            const request = store.add(queueItem);

            request.onsuccess = () => {
                console.log('✅ Item agregado al queue:', action, request.result);
                resolve(request.result);
            };

            request.onerror = () => {
                console.error('❌ Error agregando al queue:', request.error);
                reject(request.error);
            };
        });
    }

    async getQueueItems() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readonly');
            const store = transaction.objectStore('syncQueue');
            const index = store.index('timestamp');

            const request = index.openCursor(null, 'next'); // Orden ascendente por timestamp
            const results = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    console.log(`📦 ${results.length} items en queue recuperados`);
                    resolve(results);
                }
            };

            request.onerror = () => {
                console.error('❌ Error obteniendo queue:', request.error);
                reject(request.error);
            };
        });
    }

    async markQueueItemAsSynced(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');

            const request = store.get(id);

            request.onsuccess = () => {
                const item = request.result;
                if (item) {
                    item.synced = true;
                    item.syncedAt = new Date().toISOString();

                    const updateRequest = store.put(item);
                    updateRequest.onsuccess = () => {
                        console.log('✅ Item marcado como sincronizado:', id);
                        resolve();
                    };
                    updateRequest.onerror = () => {
                        console.error('❌ Error actualizando item:', updateRequest.error);
                        reject(updateRequest.error);
                    };
                } else {
                    resolve(); // Item no encontrado, asumir ya sincronizado
                }
            };

            request.onerror = () => {
                console.error('❌ Error obteniendo item para marcar:', request.error);
                reject(request.error);
            };
        });
    }

    async clearSyncedQueueItems() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncQueue'], 'readwrite');
            const store = transaction.objectStore('syncQueue');

            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.synced) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    console.log('🧹 Queue limpiado');
                    resolve();
                }
            };

            request.onerror = () => {
                console.error('❌ Error limpiando queue:', request.error);
                reject(request.error);
            };
        });
    }
}

// Inicializar dbManager
let dbManager = new IndexedDBManager();

// Inicializar aplicación
(async () => {
    console.log('🚀 ========== INICIANDO APLICACIÓN ==========');
    console.log('🚀 Timestamp:', new Date().toISOString());
    console.log('🔥 Aplicación iniciada con verificación de conectividad real');

    try {
        await dbManager.init();
        console.log('🚀 IndexedDB inicializado');

        // Verificar conectividad REAL desde el inicio
        console.log('📱 Verificando conectividad real al inicio...');
        try {
            const realOnline = await checkRealConnectivity();
            console.log('🚀 Conectividad real al inicio:', realOnline);

            if (realOnline && supabaseClient) {
                console.log('🟢 Conexión real detectada - modo online');
                isOnline = true;
                offlineMode = false;
            } else {
                console.log('🔴 Sin conexión REAL detectada - activando modo offline');
                offlineMode = true;
                isOnline = false;
                document.body.classList.add('offline-mode');
                showNotification('🔴 Sin conexión - Trabajando en modo offline', 'warning', 3000);

                // Cargar datos offline en lugar de recargar la página
                await loadOfflineEntries();
            }
        } catch (error) {
            console.log('⚠️ Error verificando conectividad, asumiendo offline:', error);
            isOnline = false;
            offlineMode = true;
            document.body.classList.add('offline-mode');
        }

        // Verificar estado de IndexedDB
        console.log('🚀 Verificando datos en IndexedDB...');
        try {
            const entries = await dbManager.getAllEntries();
            console.log(`🚀 IndexedDB contiene ${entries.length} entradas`);
        } catch (dbError) {
            console.warn('🚀 Error verificando IndexedDB:', dbError);
        }

        console.log('🚀 ========== INICIALIZACIÓN COMPLETADA ==========');

    } catch (error) {
        console.error('❌ Error inicializando:', error);

        // AGRESIVO: Si hay error en inicialización, forzar offline
        console.log('🚨 ERROR EN INICIALIZACIÓN - forzando offline');
        offlineMode = true;
        isOnline = false;
        document.body.classList.add('offline-mode');

        showNotification('🚨 Modo offline forzado por error de inicialización', 'warning', 5000);

        // Intentar continuar con offline
        try {
            await checkAuth();
        } catch (authError) {
            console.error('❌ Error en checkAuth offline:', authError);
            showNotification('❌ Error crítico - aplicación no disponible', 'error', 10000);
        }
    }
})();
let commentFiles = []; // Archivos para el comentario principal
let replyFiles = {}; // Archivos para respuestas (key: commentId)

// Variables de optimización
let searchIndex = new Map(); // Índice de búsqueda rápido
let virtualScrollEnabled = true;
let virtualContainer = null;
let virtualEntries = [];
let virtualRowHeight = 80; // Altura estimada por fila
let virtualVisibleStart = 0;
let virtualVisibleEnd = 50;
let virtualBufferSize = 10;

// Variable para manejar errores 409
let errorRetryCount = new Map();



// Función para reintentar llamadas con backoff exponencial
async function retryWithBackoff(operation, maxRetries = 3) {
    const operationId = Date.now() + Math.random();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();
            // Si tiene éxito, limpiar contador de errores
            errorRetryCount.delete(operationId);
            return result;
        } catch (error) {
            console.error(`❌ Intento ${attempt}/${maxRetries} fallido:`, error);
            
            if (attempt === maxRetries) {
                console.error('💥 Máximo de reintentos alcanzado');
                throw error;
            }
            
            // Si es error 409, esperar más tiempo
            const waitTime = error.status === 409 ? 
                Math.pow(2, attempt) * 1000 : // 2s, 4s, 8s
                attempt * 500; // 0.5s, 1s, 1.5s
            
            console.log(`⏳ Esperando ${waitTime}ms antes de reintentar...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Función de limpieza de memoria
function cleanupMemory() {
    if (allEntries.length > 1000) {
        // Mantener solo las últimas 500 entradas en memoria para interfaz
        const entriesForInterface = allEntries.slice(0, 500);
        allEntries = entriesForInterface;
        console.log(`🧹 Limpieza de memoria: reducidas a ${allEntries.length} entradas para interfaz`);
        
        // Reconstruir índice
        searchIndex = buildSearchIndex(allEntries);
    }
}

// Limpiar memoria cada 5 minutos
setInterval(cleanupMemory, 300000);

// Función para construir índice de búsqueda optimizado
function buildSearchIndex(entries) {
    const newIndex = new Map();
    entries.forEach((entry, index) => {
        const searchText = [
            entry.titulo || '',
            entry.descripcion || '',
            entry.tipo_nota || '',
            entry.ubicacion || '',
            entry.hora_inicio || '',
            entry.hora_final || '',
            entry.folio || '',
            entry.profiles?.email || '',
            entry.user_id || ''
        ].join(' ').toLowerCase();
        
        // Tokenizar y almacenar
        const tokens = searchText.split(/\s+/);
        tokens.forEach(token => {
            if (token.length > 1) { // Ignorar tokens muy cortos
                if (!newIndex.has(token)) {
                    newIndex.set(token, new Set());
                }
                newIndex.get(token).add(index);
            }
        });
    });
    
    console.log(`🔍 Índice construido: ${newIndex.size} tokens únicos para ${entries.length} entradas`);
    return newIndex;
}

// Búsqueda optimizada usando índice
function optimizedSearch(searchTerm, entries) {
    if (!searchTerm || searchTerm.length < 2) {
        return entries;
    }
    
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const matchingIndices = new Set();
    
    tokens.forEach(token => {
        if (searchIndex.has(token)) {
            const tokenMatches = searchIndex.get(token);
            if (matchingIndices.size === 0) {
                tokenMatches.forEach(index => matchingIndices.add(index));
            } else {
                // Intersección para búsqueda AND
                const current = new Set(matchingIndices);
                matchingIndices.clear();
                tokenMatches.forEach(index => {
                    if (current.has(index)) {
                        matchingIndices.add(index);
                    }
                });
            }
        }
    });
    
    return Array.from(matchingIndices).map(index => entries[index]);
}

// Sistema de notificaciones en tiempo real
let notificationSubscription = null;
let notificationChannel = null;
let notifications = []; // Lista de notificaciones
let unreadNotificationCount = 0; // Contador de no leídas

// Función de notificaciones por email usando Supabase Edge Function
async function enviarNotificacionesEmailATodos(entrada) {
    try {
        console.log('📧 ========== INICIANDO ENVÍO DE NOTIFICACIONES ==========');
        console.log('📧 Datos de entrada:', JSON.stringify(entrada, null, 2));

        if (!supabaseClient) {
            throw new Error('Supabase client no disponible');
        }

        // Llamar a la Edge Function de Supabase
        console.log('📧 Invocando Edge Function: send-entry-notification...');
        const { data, error } = await supabaseClient.functions.invoke('send-entry-notification', {
            body: {
                entrada: entrada
            }
        });

        console.log('📧 Respuesta de Edge Function:', { data, error });

        if (error) {
            console.error('❌ Error en Edge Function:', error);
            console.error('❌ Error context:', error.context);
            console.error('❌ Error message:', error.message);
            throw new Error(`Edge Function error: ${error.message || JSON.stringify(error)}`);
        }

        if (data && data.error) {
            console.error('❌ Error retornado por Edge Function:', data.error);
            console.error('❌ Detalles:', data.details);
            throw new Error(`Error en servidor: ${data.error} - ${data.details || ''}`);
        }

        console.log('✅ Notificaciones enviadas exitosamente:', data);

        // Mostrar confirmación de envío
        const exitosCount = data?.exitos || 0;
        const erroresCount = data?.errores || 0;

        if (exitosCount > 0) {
            showNotification(`✅ Notificaciones enviadas a ${exitosCount} usuarios`, 'success', 3000);
        } else if (erroresCount > 0) {
            showNotification(`⚠️ Error enviando notificaciones: ${erroresCount} fallidos`, 'warning', 4000);
        } else {
            showNotification('ℹ️ No hay usuarios para notificar', 'info', 3000);
        }

        console.log('📧 ========== FIN ENVÍO DE NOTIFICACIONES ==========');
        return data;

    } catch (error) {
        console.error('❌ ========== ERROR EN NOTIFICACIONES ==========');
        console.error('❌ Error:', error);
        console.error('❌ Mensaje:', error.message);
        console.error('❌ Stack:', error.stack);

        // Mostrar notificación con más detalles del error
        const errorMsg = error.message || 'Error desconocido';
        showNotification(`⚠️ Error enviando emails: ${errorMsg.substring(0, 50)}...`, 'warning', 5000);

        // No relanzar el error para que no falle el guardado
        return { error: true, message: errorMsg };
    }
}

// Función eliminada - ahora usa el backend para notificaciones

// Funciones de pantalla
function showLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    
    loginScreen.style.setProperty('display', 'flex', 'important');
    mainApp.style.display = 'none';
}

function showMain() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    
    loginScreen.style.setProperty('display', 'none', 'important');
    mainApp.style.display = 'block';
}

// Login
async function handleLogin(e) {
    e.preventDefault();

    // Verificar si Supabase está disponible
    if (!supabaseClient) {
        showLoginError('Modo offline: No se puede iniciar sesión sin conexión a internet.');
        return;
    }

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    
    try {
        // Mostrar indicador de carga
        loginBtn.textContent = 'Ingresando...';
        loginBtn.disabled = true;
        loginError.textContent = 'Iniciando sesión...';
        loginError.style.color = '#666';
        
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) {
            throw error;
        }
        
        currentUser = data.user;
        isOnline = true;
        offlineMode = false;
        initialLoadComplete = true;

        // Establecer información básica del usuario inmediatamente
        document.getElementById('userName').textContent = currentUser.email || 'Sin email';
        document.getElementById('userRole').textContent = '(Cargando...)';

        // Mostrar la aplicación principal inmediatamente
        showMain();

        // Restablecer botón de login
        loginBtn.textContent = 'Ingresar';
        loginBtn.disabled = false;
        loginError.textContent = '';

        // Cargar perfil y entradas en paralelo para mejor rendimiento
        Promise.all([
            getUserProfile().catch(err => console.warn('Error cargando perfil:', err)),
            loadBitacoraEntries().catch(err => console.warn('Error cargando entradas:', err))
        ]).then(() => {
            // Guardar sesión completa con rol en localStorage después de obtener perfil
            localStorage.setItem('bitacora_session', JSON.stringify({
                user: {
                    ...currentUser,
                    role: currentUser.role,
                    nombre: currentUser.name
                },
                expires_at: data.session?.expires_at
            }));
            // Inicializar notificaciones en tiempo real después de cargar todo
            initializeRealtimeNotifications().catch(err => console.warn('Error inicializando notificaciones:', err));
        });
        

    } catch (error) {
        loginBtn.textContent = 'Ingresar';
        loginBtn.disabled = false;
        loginError.textContent = 'Error: ' + error.message;
        loginError.style.color = '#e74c3c';
    }
}

// Logout
async function handleLogout() {
    // Limpiar notificaciones en tiempo real
    cleanupRealtimeNotifications();

    // Limpiar sesión offline
    localStorage.removeItem('bitacora_session');

    // Solo hacer signOut si Supabase está disponible
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }

    currentUser = null;
    showLogin();
}

// Obtener perfil del usuario
async function getUserProfile() {
    if (!currentUser) return;

    try {
        // Consulta optimizada con timeout para obtener rol y nombre
        const { data, error } = await Promise.race([
            supabaseClient
                .from('profiles')
                .select('rol, email, nombre')
                .eq('id', currentUser.id)
                .single(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 3000)
            )
        ]);

        if (data) {
            currentUser.role = data.rol || 'user';
            currentUser.name = data.nombre;
            currentUser.nombre = data.nombre;
            console.log('👤 Rol del usuario:', data.rol);
            console.log('👤 Nombre del usuario:', data.nombre);

            const displayName = data.nombre || currentUser.email || 'Usuario desconocido';
            document.getElementById('userName').textContent = displayName;
            document.getElementById('userRole').textContent = '(' + getRoleDisplayName(data.rol) + ')';

            if (data.rol === 'admin') {
                document.getElementById('manageUsersBtn').style.display = 'block';
            } else {
                document.getElementById('manageUsersBtn').style.display = 'none';
            }

            // Actualizar localStorage con el rol obtenido
            updateStoredSession();
        } else {
            currentUser.role = 'user';
            const displayName = currentUser.email || 'Usuario desconocido';
            document.getElementById('userName').textContent = displayName;
            document.getElementById('userRole').textContent = '(' + getRoleDisplayName('user') + ')';
            const manageUsersBtn = document.getElementById('manageUsersBtn');
            if (manageUsersBtn) {
                manageUsersBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.warn('⚠️ Error obteniendo perfil:', error);
        // Intentar usar rol guardado en localStorage
        const savedSession = localStorage.getItem('bitacora_session');
        if (savedSession) {
            try {
                const sessionData = JSON.parse(savedSession);
                if (sessionData.user?.role) {
                    currentUser.role = sessionData.user.role;
                    currentUser.nombre = sessionData.user.nombre;
                }
            } catch (e) {
                currentUser.role = 'user';
            }
        } else {
            currentUser.role = 'user';
        }

        const displayName = currentUser.nombre || currentUser.email || 'Usuario desconocido';
        document.getElementById('userName').textContent = displayName;
        document.getElementById('userRole').textContent = '(' + getRoleDisplayName(currentUser.role) + ')';
        const manageUsersBtn = document.getElementById('manageUsersBtn');
        if (manageUsersBtn) {
            manageUsersBtn.style.display = currentUser.role === 'admin' ? 'block' : 'none';
        }
    }
}

// Función auxiliar para actualizar la sesión guardada
function updateStoredSession() {
    if (!currentUser) return;

    try {
        const savedSession = localStorage.getItem('bitacora_session');
        let sessionData = savedSession ? JSON.parse(savedSession) : { user: {} };

        sessionData.user = {
            ...sessionData.user,
            ...currentUser,
            role: currentUser.role,
            nombre: currentUser.nombre || currentUser.name
        };

        localStorage.setItem('bitacora_session', JSON.stringify(sessionData));
        console.log('💾 Sesión actualizada en localStorage con rol:', currentUser.role);
    } catch (error) {
        console.warn('Error actualizando sesión en localStorage:', error);
    }
}

// Funciones del formulario
function showForm() {
    const formSection = document.getElementById('formSection');
    const entriesSection = document.querySelector('.entries-section');
    
    // Ocultar entradas y mostrar formulario
    entriesSection.style.display = 'none';
    formSection.style.display = 'block';
    
    // Limpiar archivos acumulados al abrir nuevo formulario
    allSelectedFiles = [];
    document.getElementById('fotos').value = '';
    
    // Establecer fecha y hora actual con zona horaria local
    const fechaInput = document.getElementById('fecha');
    if (fechaInput && !fechaInput.value) {
        const now = new Date();
        // Usar la zona horaria local del navegador
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        const localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
        fechaInput.value = localDateTime;
        
        // Establecer horas sugeridas basadas en la hora actual
        const horaInicio = document.getElementById('horaInicio');
        const horaFinal = document.getElementById('horaFinal');
        
        if (horaInicio && !horaInicio.value) {
            // Redondear a la próxima hora u hora actual
            const roundedMinutes = now.getMinutes() >= 30 ? '00' : '30';
            const adjustedHours = roundedMinutes === '00' && now.getMinutes() >= 30 ? 
                String((now.getHours() + 1) % 24).padStart(2, '0') : 
                String(now.getHours()).padStart(2, '0');
            horaInicio.value = `${adjustedHours}:${roundedMinutes}`;
        }
        
        if (horaFinal && !horaFinal.value) {
            // Sugerir 8 horas después del inicio (jornada estándar)
            const startHour = parseInt(horaInicio.value.split(':')[0]);
            const startMin = parseInt(horaInicio.value.split(':')[1]);
            let endHour = startHour + 8;
            let endMin = startMin;
            
            // Ajustar si pasa de medianoche
            if (endHour >= 24) {
                endHour = endHour - 24;
            }
            
            horaFinal.value = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
        }
        
        // console.log('📍 Zona horaria detectada:', Intl.DateTimeFormat().resolvedOptions().timeZone);
        // console.log('🕒 Fecha y hora local establecida:', localDateTime);
        // console.log('⏰ Hora actual:', `${hours}:${minutes}`);
    }
    
    // Simple scroll al inicio del main
    window.scrollTo(0, 0);
}

function hideForm() {
    const formSection = document.getElementById('formSection');
    const entriesSection = document.querySelector('.entries-section');
    const form = document.getElementById('bitacoraForm');
    
    // Ocultar formulario y mostrar entradas
    formSection.style.display = 'none';
    entriesSection.style.display = 'block';
    
    form.reset();
    delete form.dataset.editId;
    delete form.dataset.existingPhotos;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Guardar Entrada';
    submitBtn.classList.remove('update-mode');
    
    // Resetear variables de archivos
    commentFiles = [];
    
    // Limpiar vista previa de archivos
    const photoPreview = document.getElementById('photoPreview');
    const photoPreviewGrid = document.getElementById('photoPreviewGrid');
    if (photoPreview) {
        photoPreview.style.display = 'text';
        photoPreviewGrid.innerHTML = '';
    }
    
    // Limpiar advertencia de actualización
    const updateWarning = document.getElementById('updateWarning');
    if (updateWarning) {
        updateWarning.style.display = 'none';
    }
    
    // Resetear estilos del formulario para móvil
    formSection.style.position = '';
    formSection.style.top = '';
    formSection.style.left = '';
    formSection.style.width = '';
    formSection.style.height = '';
    formSection.style.zIndex = '';
    formSection.style.padding = '';
    formSection.style.overflow = '';
    
    window.scrollTo(0, 0);
}
    
    // Resetear checkbox
    const keepPhotosCheckbox = document.getElementById('keepPhotosCheckbox');
    if (keepPhotosCheckbox) {
        keepPhotosCheckbox.checked = true;
    }


// Guardar entrada
async function handleBitacoraSubmit(e) {
    e.preventDefault();

    try {
        console.log('📝 ========== handleBitacoraSubmit INICIADO ==========');
        console.log('📝 Estado del sistema:');
        console.log('  - navigator.onLine:', navigator.onLine);
        console.log('  - isOnline:', isOnline);
        console.log('  - offlineMode:', offlineMode);
        console.log('  - currentUser:', !!currentUser);

        const form = document.getElementById('bitacoraForm');
        const editId = form.dataset.editId;
        const keepPhotosCheckbox = document.getElementById('keepPhotosCheckbox');

        const fotoFiles = allSelectedFiles.length > 0 ? allSelectedFiles : document.getElementById('fotos').files;

        console.log('  - fotoFiles.length:', fotoFiles.length);

        // Advertir sobre archivos offline (solo si realmente está offline)
        console.log('📝 Verificando condición offline:', { offlineMode, fotoFilesLength: fotoFiles.length });
        if (offlineMode && fotoFiles.length > 0) {
        console.log('📝 Mostrando advertencia de archivos offline');
        const proceed = confirm('⚠️ Estás offline. Los archivos adjuntos NO se guardarán. Solo se guardará el texto de la entrada. ¿Deseas continuar?');
        if (!proceed) {
            console.log('📝 Usuario canceló guardado offline con archivos');
            return;
        }
    } else {
        console.log('📝 No se muestra advertencia (online o sin archivos)');
    }

    console.log('📝 Continuando con el guardado...');

    let archivoUrls = [];
    
    if (editId) {
        // Estamos actualizando una entrada existente
        const existingArchivos = JSON.parse(form.dataset.existingPhotos || '[]');
        
        // Verificar si hay archivos nuevos y si el checkbox está marcado
        if (fotoFiles.length > 0 && keepPhotosCheckbox && !keepPhotosCheckbox.checked) {
            // No se mantiene archivos existentes y se suben nuevos
            // console.log('⚠️ Advertencia: Los archivos existentes serán reemplazados');
        } else if (keepPhotosCheckbox && keepPhotosCheckbox.checked) {
            // Mantener archivos existentes y agregar nuevos si los hay
            archivoUrls = [...existingArchivos];
            // console.log('ℹ️ Manteniendo archivos existentes:', existingArchivos.length, 'archivos');
        } else if (fotoFiles.length === 0) {
            // No hay archivos nuevos, mantener los existentes
            archivoUrls = [...existingArchivos];
            // console.log('ℹ️ Sin archivos nuevos, manteniendo archivos existentes');
        } else {
            // Hay archivos nuevos y no se quiere mantener los existentes
            archivoUrls = [];
            // console.log('⚠️ Archivos existentes eliminados, solo nuevos archivos se guardarán');
        }
        
            // Subir nuevos archivos si hay
        if (fotoFiles.length > 0) {
            const newArchivoUrls = [];
            for (let i = 0; i < fotoFiles.length; i++) {
                const file = fotoFiles[i];
                
                // Validar tipo de archivo de forma más estricta
                const validTypes = [
                    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
                    'application/pdf', 
                    'application/msword', 
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel', 
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-powerpoint', 
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/zip',
                    'application/x-rar-compressed',
                    'application/x-7z-compressed',
                    'application/x-tar',
                    'application/gzip',
                    'application/octet-stream' // Para archivos DWG, DXF y otros archivos binarios
                ];
                
                // Validar por MIME type y extensión de archivo
                const fileExtension = file.name.split('.').pop().toLowerCase();
                const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'tar', 'gz', 'dwg', 'dxf', 'dwf'];
                
                if (!validTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
                    console.error('Tipo de archivo no permitido:', file.type, 'Extensión:', fileExtension);
                    alert(`El archivo "${file.name}" no es un tipo permitido. Tipos permitidos: imágenes (JPG, PNG, GIF), PDF, Word, Excel, PowerPoint, ZIP, RAR, 7Z, TAR, AutoCAD`);
                    continue;
                }
                
                // Limpiar el nombre del archivo para evitar caracteres problemáticos
                const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const fileName = `${Date.now()}_${cleanFileName}`;

                // Subir archivo a Cloudflare R2 (solo si está online)
                if (!navigator.onLine) {
                    console.log('🔴 Offline: omitiendo subida de archivo', file.name);
                    continue; // Saltar este archivo cuando está offline
                }

                try {
                    const uploadData = await uploadFileToR2(file);
                    newArchivoUrls.push({
                        url: uploadData.url,
                        name: file.name,
                        type: file.type,
                        size: file.size
                    });
                } catch (uploadError) {
                    console.error('❌ Error subiendo archivo:', file.name, uploadError);
                    showNotification(`⚠️ No se pudo subir "${file.name}". La entrada se guardará sin este archivo.`, 'warning', 5000);
                }
            }

            if (keepPhotosCheckbox && keepPhotosCheckbox.checked) {
                // Agregar nuevos archivos a los existentes
                archivoUrls = [...archivoUrls, ...newArchivoUrls];
            } else {
                // Reemplazar completamente con nuevos archivos
                archivoUrls = newArchivoUrls;
            }
        }
    } else 
        // Es una nueva entrada, solo subir los archivos nuevos
        if (fotoFiles.length > 0) {
            for (let i = 0; i < fotoFiles.length; i++) {
                const file = fotoFiles[i];
                
                // Validar tipo de archivo de forma más estricta
                const validTypes = [
                    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
                    'application/pdf', 
                    'application/msword', 
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel', 
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-powerpoint', 
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/zip',
                    'application/x-rar-compressed',
                    'application/x-7z-compressed',
                    'application/x-tar',
                    'application/gzip',
                    'application/octet-stream' // Para archivos DWG, DXF y otros archivos binarios
                ];
                
                // Validar por MIME type y extensión de archivo
                const fileExtension = file.name.split('.').pop().toLowerCase();
                const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'tar', 'gz', 'dwg', 'dxf', 'dwf'];
                
                if (!validTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
                    console.error('Tipo de archivo no permitido:', file.type, 'Extensión:', fileExtension);
                    alert(`El archivo "${file.name}" no es un tipo permitido. Tipos permitidos: imágenes (JPG, PNG, GIF), PDF, Word, Excel, PowerPoint, ZIP, RAR, 7Z, TAR, AutoCAD`);
                    continue;
                }
                
                // Limpiar el nombre del archivo para evitar caracteres problemáticos
                const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const fileName = `${Date.now()}_${cleanFileName}`;

                // Subir archivo a Cloudflare R2 (solo si está online)
                if (!navigator.onLine) {
                    console.log('🔴 Offline: omitiendo subida de archivo', file.name);
                    continue; // Saltar este archivo cuando está offline
                }

                try {
                    const uploadData = await uploadFileToR2(file);
                    archivoUrls.push({
                        url: uploadData.url,
                        name: file.name,
                        type: file.type,
                        size: file.size
                    });
                } catch (uploadError) {
                    console.error('❌ Error subiendo archivo:', file.name, uploadError);
                    showNotification(`⚠️ No se pudo subir "${file.name}". La entrada se guardará sin este archivo.`, 'warning', 5000);
                    // Continuar con los demás archivos
                }
            }
        }

    const fechaInput = document.getElementById('fecha').value;
    // console.log('Fecha del input:', fechaInput);
    // console.log('📍 Zona horaria actual:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    if (!fechaInput) {
        showValidationErrors(['❌ Por favor selecciona una fecha y hora']);
        return;
    }
    
    // Generar folio consecutivo SOLO para nuevas entradas
    let folio;
    if (editId) {
        // Si es actualización, mantener el folio existente
        const { data: existingEntry } = await supabaseClient
            .from('bitacora')
            .select('folio')
            .eq('id', editId)
            .single();
        folio = existingEntry.folio;
    } else {
        // Si es nueva entrada, generar folio nuevo
        folio = await generarFolioConsecutivo();
    }
    
    const formData = {
        folio: folio, // Agregar folio (existente o nuevo)
        user_id: currentUser.id,
        fecha: fechaInput, // Guardar directamente como datetime-local
        titulo: document.getElementById('titulo').value.trim(),
        descripcion: document.getElementById('descripcion').value.trim(),
        hora_inicio: document.getElementById('horaInicio').value,
        hora_final: document.getElementById('horaFinal').value,
        tipo_nota: document.getElementById('tipoNota').value,
        ubicacion: document.getElementById('ubicacion').value.trim(),
        archivos: archivoUrls
    };
    
    // Validar campos obligatorios
    const validationErrors = validateBitacoraEntry(formData);
    if (validationErrors.length > 0) {
        showValidationErrors(validationErrors);
        return;
    }
    
// console.log('FormData a guardar:', formData);
    // console.log('Archivos finales:', archivoUrls.length, 'archivos');
    
    let data, error;

    if (editId) {
        // Actualizar entrada existente
        try {
            const { data: updateData, error: updateError } = await supabaseClient
                .from('bitacora')
                .update(formData)
                .eq('id', editId)
                .select();

            data = updateData;
            error = updateError;

            // Detectar errores de conexión
            if (error && (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError'))) {
                console.warn('⚠️ Error de conexión al actualizar, guardando localmente');
                // Guardar cambios en IndexedDB para sincronizar después
                await dbManager.saveEntry({ ...formData, id: editId });
                await dbManager.addToQueue('update_entry', { ...formData, id: editId });
                showNotification('📦 Cambios guardados offline (se sincronizarán cuando vuelva la conexión)', 'warning', 5000);
                error = null;
                data = [{ ...formData, id: editId }];
            }
        } catch (updateCatchError) {
            console.warn('⚠️ Error de conexión al actualizar:', updateCatchError);
            // Guardar cambios en IndexedDB para sincronizar después
            await dbManager.saveEntry({ ...formData, id: editId });
            await dbManager.addToQueue('update_entry', { ...formData, id: editId });
            showNotification('📦 Cambios guardados offline (se sincronizarán cuando vuelva la conexión)', 'warning', 5000);
            data = [{ ...formData, id: editId }];
        }
    } else {
        // Crear nueva entrada
        console.log('👤 Usuario actual:', currentUser);
        console.log('🔐 Sesión actual:', await supabaseClient.auth.getSession());
        let currentlyOnline = navigator.onLine;
        console.log('📝 ========== CREANDO ENTRADA ==========');
        console.log('📝 currentlyOnline:', currentlyOnline);
        console.log('📝 navigator.onLine:', navigator.onLine);
        console.log('📝 isOnline:', isOnline);

        if (currentlyOnline) {
            try {
                // Crear nueva entrada en Supabase (online)
                const result = await supabaseClient
                    .from('bitacora')
                    .insert(formData)
                    .select()
                    .single();

                data = result.data;
                error = result.error;

                // Detectar errores de conexión y hacer fallback a offline
                if (error && (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError') || error.message?.includes('fetch'))) {
                    console.warn('⚠️ Error de conexión detectado, cambiando a modo offline:', error.message);
                    currentlyOnline = false;
                    error = null; // Limpiar el error para que el modo offline funcione
                } else if (!error && data) {
                    // Guardar en IndexedDB para soporte offline
                    await dbManager.saveEntry({
                        ...formData,
                        id: data.id,
                        folio: data.folio,
                        fecha_hora: data.fecha_hora,
                        created_at: data.created_at
                    });
                    console.log('✅ Entrada guardada en IndexedDB');
                }
            } catch (onlineError) {
                console.warn('⚠️ Error guardando online, intentando offline:', onlineError);
                currentlyOnline = false; // Fallback a offline
            }
        }

        if (!currentlyOnline) {
            // Guardar solo en IndexedDB (offline)
            console.log('🔴 ========== GUARDANDO ENTRADA OFFLINE ==========');
            console.log('🔴 currentUser:', currentUser);

            const tempId = Date.now().toString();
            const offlineEntry = {
                ...formData,
                id: tempId,
                folio: formData.folio,
                fecha_hora: formData.fecha,
                created_at: new Date().toISOString(),
                isOffline: true,
                user_id: currentUser?.id || 'offline_user'
            };

            console.log('🔴 Datos a guardar:', {
                id: offlineEntry.id,
                titulo: offlineEntry.titulo,
                fecha: offlineEntry.fecha,
                folio: offlineEntry.folio,
                user_id: offlineEntry.user_id
            });

            try {
                console.log('🔴 Guardando en IndexedDB...');
                await dbManager.saveEntry(offlineEntry);
                console.log('🔴 Agregando a queue...');
                await dbManager.addToQueue('create_entry', offlineEntry);
                console.log('✅ Entrada guardada exitosamente en IndexedDB');

                // Verificar que se guardó
                const savedEntries = await dbManager.getAllEntries();
                console.log(`✅ Verificación: ${savedEntries.length} entradas en IndexedDB después de guardar`);

                data = [offlineEntry];
                error = null;

                console.log('🔴 ========== GUARDADO OFFLINE COMPLETADO ==========');
            } catch (saveError) {
                console.error('❌ Error guardando offline:', saveError);
                console.error('❌ Stack trace:', saveError.stack);
                throw saveError;
            }
        }
    }

        console.log('📧 ========== ANTES DE VERIFICAR ERROR ==========');
        console.log('📧 error existe:', !!error);
        if (error) {
            console.log('📧 error.message:', error.message);
        }

        if (error) {
            console.error('Error guardando:', error);
            alert('Error al guardar: ' + error.message);
        } else {
            console.log('📧 ========== NO HAY ERROR, ENTRANDO A SECCIÓN DE EMAILS ==========');
            console.log('📧 ========== LLEGANDO A LA SECCIÓN DE EMAILS ==========');

            // Enviar notificaciones por email a todos los usuarios (solo para nuevas entradas online)
            console.log('📧 ========== VERIFICANDO CONDICIONES PARA EMAILS ==========');
            console.log('📧 editId:', editId, 'typeof editId:', typeof editId);
            console.log('📧 data:', data, 'data.length:', data?.length);
            console.log('📧 data[0]:', data?.[0]);
            console.log('📧 isOnline:', isOnline);
            console.log('📧 navigator.onLine:', navigator.onLine);
            console.log('📧 offlineMode:', offlineMode);

            const condition1 = !editId;
            const condition2 = data && (Array.isArray(data) ? data[0] : data);
            const condition3 = isOnline;

            console.log('📧 Condición 1 (!editId):', condition1);
            console.log('📧 Condición 2 (data && entrada):', condition2);
            console.log('📧 Condición 3 (isOnline):', condition3);
            console.log('📧 TODAS las condiciones:', condition1 && condition2 && condition3);

            if (!editId && data && isOnline) {
                console.log('📧 ✅ CONDICIONES CUMPLIDAS - ENVIANDO NOTIFICACIONES...');
                const entrada = Array.isArray(data) ? data[0] : data;
                try {
                    await enviarNotificacionesEmailATodos(entrada);
                    console.log('📧 ✅ Notificaciones por email enviadas exitosamente');
                } catch (emailError) {
                    console.error('❌ Error enviando emails:', emailError);
                    // No fallar el guardado si hay error en emails
                }
            } else {
                console.log('📧 ❌ CONDICIONES NO CUMPLIDAS - NO SE ENVIAN EMAILS');
                console.log('📧 Razón del fallo:');
                if (editId) console.log('  - Es una edición (editId existe)');
                if (!data) console.log('  - No hay datos');
                if (!isOnline) console.log('  - No está online');
            }

            console.log('📧 ========== FIN DE LA SECCIÓN DE EMAILS ==========');

            // Notificar a otros usuarios (el realtime se encargará automáticamente)
            const successMsg = isOnline ? '✅ Entrada guardada exitosamente' : '📦 Entrada guardada offline (se sincronizará cuando vuelva la conexión)';
            showNotification(successMsg, 'success');

            document.getElementById('bitacoraForm').reset();
            await loadBitacoraEntries(1, false); // Recargar desde la primera página
            hideForm();

            if (editId) {
                if (fotoFiles.length > 0 && keepPhotosCheckbox && !keepPhotosCheckbox.checked) {
                    alert('⚠️ Entrada actualizada: Las fotos existentes fueron reemplazadas por las nuevas fotos.');
                } else if (fotoFiles.length > 0 && keepPhotosCheckbox && keepPhotosCheckbox.checked) {
                    alert(`✅ Entrada actualizada: Se mantuvieron ${JSON.parse(form.dataset.existingPhotos || '[]').length} fotos existentes y se agregaron ${fotoFiles.length} nuevas.`);
                } else {
                    alert(isOnline ? '✅ Entrada actualizada exitosamente' : '📦 Entrada actualizada offline (se sincronizará cuando vuelva la conexión)');
                }
            } else {
                alert(isOnline ? '✅ Entrada guardada exitosamente' : '📦 Entrada guardada offline (se sincronizará cuando vuelva la conexión)');
            }
        }
    } catch (error) {
        console.error('❌ ========== ERROR EN handleBitacoraSubmit ==========');
        console.error('❌ Error:', error);
        console.error('❌ Stack:', error.stack);
        showNotification('❌ Error al guardar la entrada: ' + error.message, 'error', 5000);
    }
}

// Cargar entradas con paginación y optimización
async function loadBitacoraEntries(page = 1, append = false) {
    isLoadingEntries = true;
    showLoadingIndicator();

    try {
        // Siempre intentar cargar desde online primero si Supabase está disponible
        if (supabaseClient) {
            console.log('🌐 Intentando cargar entradas desde online...');
            try {
                await loadBitacoraEntriesOnline(page, append);
                console.log('✅ Entradas cargadas desde online exitosamente');
                return;
            } catch (onlineError) {
                console.warn('⚠️ Error cargando desde online, intentando offline:', onlineError.message);
            }
        }

        // Fallback a offline
        console.log('🔴 Cargando entradas desde offline...');
        await loadOfflineEntries();
        console.log('✅ Entradas cargadas desde offline');

    } catch (error) {
        console.error('❌ Error crítico cargando entradas:', error);
        showNotification('❌ Error cargando entradas', 'error');
    } finally {
        isLoadingEntries = false;
        hideLoadingIndicator();
    }
}

// Función separada para cargar desde online
async function loadBitacoraEntriesOnline(page = 1, append = false) {
    if (!supabaseClient) {
        throw new Error('Supabase no disponible');
    }

    console.log('🌐 Cargando desde online...');
    const offset = (page - 1) * ENTRIES_PER_PAGE;

    const result = await Promise.race([
        supabaseClient
            .from('bitacora')
            .select('*', { count: 'exact' })
            .order('fecha', { ascending: false })
            .range(offset, offset + ENTRIES_PER_PAGE - 1),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout online')), 15000)
        )
    ]);

    const { data: bitacoraData, error, count } = result;

    if (error) {
        throw error;
    }

    // Procesar datos online
    const processedEntries = bitacoraData.map(entry => ({
        ...entry,
        profiles: null // Se cargará correctamente en loadUserEmailsInBackground
    }));

    // Actualizar datos globales
    if (append && page > 1) {
        allEntries = [...allEntries, ...processedEntries];
    } else {
        allEntries = processedEntries;
        currentPage = page;
    }

    totalEntries = count || 0;
    updatePaginationInfo();

    // Guardar en IndexedDB para offline
    try {
        console.log('💾 Guardando en IndexedDB...');
        for (const entry of processedEntries) {
            await dbManager.saveEntry(entry);
        }
    } catch (dbError) {
        console.warn('⚠️ Error guardando en IndexedDB:', dbError);
    }

    // Actualizar UI
    await filterAndDisplayEntries(append, processedEntries);

    // Cargar emails en segundo plano
    if (bitacoraData.length > 0) {
        loadUserEmailsInBackground(processedEntries).catch(err => {
            console.warn('Error cargando emails:', err);
        });
    }
}

// Obtener email de usuario desde auth (función admin)
async function getUserEmailFromAuth(userId) {
    if (!supabaseClient) {
        return null;
    }

    try {
        // Esta función requiere privilegios de admin para consultar otros usuarios
        // Si tienes permisos de admin, puedes usar esta consulta
        const { data, error } = await supabaseClient.auth.admin.getUserById(userId);
        if (!error && data.user && data.user.email) {
            return data.user.email;
        }
        return null;
    } catch (error) {
        // Si no hay permisos de admin, retornar null
        return null;
    }
}

// Cargar emails de usuarios (ahora síncrono para mejor UX)
async function loadUserEmailsInBackground(entries) {
    try {
        console.log('🔍 Función loadUserEmailsInBackground iniciada');
        const userIds = [...new Set(entries.map(entry => entry.user_id).filter(id => id))];
        
        
        if (userIds.length > 0) {
            // Obtener emails de la tabla profiles
            console.log('📥 Consultando tabla profiles...');
            const { data: profiles, error } = await supabaseClient
                .from('profiles')
                .select('id, email')
                .in('id', userIds);
            
            if (error) {
                console.error('❌ Error consultando profiles:', error);
                return;
            }
            
            console.log('📨 Profiles encontrados:', profiles);
            
            const userEmails = {};
            
            if (profiles) {
                profiles.forEach(profile => {
                    if (profile.email) {
                        userEmails[profile.id] = profile.email;
                        console.log(`✅ Email mapeado: ${profile.id} → ${profile.email}`);
                    }
                });
            }
            
            // DEBUG: Verificar IDs de entradas antes de actualizar emails
            console.log('🔍 IDs de entradas antes de actualizar:', entries.map(e => e.id).sort((a, b) => b - a));
            console.log('🔍 ¿Entrada 90 existe antes de actualizar?', entries.some(e => e.id === 90));
            
            // Actualizar entradas con emails encontrados
            let updatedAny = false;
            entries.forEach(entry => {
                console.log(`🔍 Procesando entrada ${entry.id} - user_id: ${entry.user_id}`);
                if (userEmails[entry.user_id]) {
                    // Asegurar que profiles exista
                    if (!entry.profiles) {
                        entry.profiles = {};
                    }
                    // Solo actualizar si es diferente
                    if (entry.profiles.email !== userEmails[entry.user_id]) {
                        entry.profiles.email = userEmails[entry.user_id];
                        updatedAny = true;
                        console.log(`🔄 Email actualizado para entrada ${entry.id}: ${userEmails[entry.user_id]}`);
                    } else {
                        console.log(`ℹ️ Email ya correcto para entrada ${entry.id}: ${entry.profiles.email}`);
                    }
                } else {
                    console.log(`⚠️ No se encontró email para user_id: ${entry.user_id}`);
                }
            });
            
            // Actualizar la vista solo si hubo cambios en los emails
            if (updatedAny) {
                console.log('🔄 Actualizando vista con emails correctos...');
                
                // Reconstruir índice de búsqueda con todas las entradas acumuladas
                searchIndex = buildSearchIndex(allEntries);
                
                // Solo actualizar los elementos existentes en el DOM sin duplicar
                updateExistingEntriesWithEmails(entries);
                console.log('✅ Vista actualizada con emails correctos');
            } else {
                console.log('ℹ️ No se actualizaron emails, omitiendo actualización de vista');
            }
        } else {
            console.log('ℹ️ No hay IDs de usuarios para procesar');
        }
    } catch (error) {
        console.error('❌ Error cargando emails:', error);
    }
}

// Actualizar entradas existentes sin duplicar contenido
function updateExistingEntriesWithEmails(entries) {
    try {
        entries.forEach(entry => {
            // Buscar elementos existentes para esta entrada
            const entryElements = document.querySelectorAll(`[data-entry-id="${entry.id}"]`);
            
            entryElements.forEach(element => {
                const userCell = element.querySelector('td:nth-child(9)'); // Columna Usuario (9ª)
                if (userCell && entry.profiles?.email) {
                    userCell.textContent = entry.profiles.email;
                }
                
                // También actualizar en cards móviles si existen
                const mobileUserLabel = element.querySelector('.mobile-author-email') || element.querySelector('.mobile-entry-row:last-child .mobile-entry-content');
                if (mobileUserLabel && entry.profiles?.email) {
                    mobileUserLabel.textContent = entry.profiles.email;
                }
            });
        });
    } catch (error) {
        console.error('Error actualizando entradas existentes:', error);
    }
}

// Variable para evitar múltiples filtrados simultáneos
let isFiltering = false;

// Filtrar y mostrar entradas con debounce para mejor rendimiento
let pendingFilterRun = false;

function endFiltering() {
    isFiltering = false;
    // Si mientras se filtraba llegó otra solicitud, ejecutarla ahora (no descartarla)
    if (pendingFilterRun) {
        pendingFilterRun = false;
        console.log('🔁 Re-ejecutando filtro pendiente...');
        setTimeout(() => filterAndDisplayEntries(), 0);
    }
}

async function filterAndDisplayEntries(append = false, newEntries = null) {
    if (isFiltering && !append) {
        console.log('⏳ Ya se está filtrando, encolando solicitud...');
        pendingFilterRun = true;
        return;
    }

    console.log('🔍 filterAndDisplayEntries iniciado', { append, newEntriesCount: newEntries?.length });

    isFiltering = true;

    // Si estamos añadiendo y tenemos las nuevas entradas, solo mostramos esas
    if (append && newEntries) {
        await displayEntries(newEntries, true);
        endFiltering();
        
        // ACTUALIZACIÓN DE BOTÓN Y CONTADOR INCLUSO EN APPEND
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = allEntries.length >= totalEntries ? 'none' : 'block';
        }
        updatePaginationInfo();
        return;
    }

    let filteredEntries = [...allEntries];

    // Verificar si hay filtros que requieran cargar todas las entradas de la base de datos
    const searchTerm = document.getElementById('searchInput').value.trim();
    const tipoFilter = document.getElementById('tipoFilter').value;
    const ubicacionFilter = document.getElementById('ubicacionFilter').value;
    const fechaInicioFilter = document.getElementById('fechaInicioFilter').value;
    const fechaFinalFilter = document.getElementById('fechaFinalFilter').value;
    const hasAdvancedFilters = searchTerm || tipoFilter || ubicacionFilter || fechaInicioFilter || fechaFinalFilter;

    // Si hay filtros avanzados, cargar todas las entradas de la base de datos
    if (hasAdvancedFilters) {
        console.log('🔍 Filtros avanzados detectados, cargando todas las entradas...');

        try {
            let query = supabaseClient
                .from('bitacora')
                .select('id, fecha, fecha_hora, titulo, descripcion, tipo_nota, ubicacion, user_id, folio, hora_inicio, hora_final, archivos', { count: 'exact' })
                .limit(5000)
                .order('fecha', { ascending: false });

            // Aplicar filtros en la consulta SQL
            if (tipoFilter) {
                query = query.eq('tipo_nota', tipoFilter);
            }

            if (ubicacionFilter) {
                query = query.eq('ubicacion', ubicacionFilter);
            }

            if (fechaInicioFilter) {
                const inicio = new Date(fechaInicioFilter + 'T00:00:00').toISOString();
                query = query.gte('fecha', inicio);
            }

            if (fechaFinalFilter) {
                const fin = new Date(fechaFinalFilter + 'T23:59:59').toISOString();
                query = query.lte('fecha', fin);
            }

            // Cargar todas las entradas sin límite
            const { data: allData, error, count } = await query;

            if (error) {
                console.error('Error cargando todas las entradas para filtros:', error);
                showNotification('❌ Error al aplicar filtros', 'error');
                endFiltering();
                return;
            }

            filteredEntries = allData || [];
            totalEntries = count || 0;
            console.log('🔍 Cargadas', filteredEntries.length, 'entradas con filtros aplicados');

            // Cargar emails de usuarios para las entradas filtradas
            if (filteredEntries.length > 0) {
                const userIds = [...new Set(filteredEntries.map(entry => entry.user_id).filter(id => id))];

                if (userIds.length > 0) {
                    const { data: profiles, error: profilesError } = await supabaseClient
                        .from('profiles')
                        .select('id, email')
                        .in('id', userIds);

                    if (!profilesError && profiles) {
                        const userEmails = {};
                        profiles.forEach(profile => {
                            if (profile.email) {
                                userEmails[profile.id] = profile.email;
                            }
                        });

                        filteredEntries.forEach(entry => {
                            if (userEmails[entry.user_id]) {
                                entry.profiles = { email: userEmails[entry.user_id] };
                            }
                        });
                    }
                }
            }

        } catch (error) {
            console.error('Error al cargar entradas filtradas:', error);
            showNotification('❌ Error al aplicar filtros', 'error');
            endFiltering();
            return;
        }
    } else {
        console.log('🔍 Sin filtros avanzados, usando entradas cargadas');
    }

    // Filtrar por búsqueda (siempre se hace en JavaScript)
    console.log('🔍 searchTerm:', searchTerm);
    if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const normalizedTerm = term.replace(/^#/, '').trim();

        // 1) Prioridad: coincidencia EXACTA de folio
        const folioMatches = filteredEntries.filter(entry =>
            entry.folio !== null &&
            entry.folio !== undefined &&
            String(entry.folio).toLowerCase().replace(/^#/, '').trim() === normalizedTerm
        );

        if (folioMatches.length > 0) {
            console.log('🔍 Folio exacto encontrado:', folioMatches.length, 'resultado(s)');
            filteredEntries = folioMatches;
        } else {
            // 2) Búsqueda por palabras COMPLETAS (no subcadenas)
            const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const words = term.split(/\s+/).filter(w => w.length > 1);
            filteredEntries = filteredEntries.filter(entry => {
                const fields = [
                    entry.titulo,
                    entry.descripcion,
                    entry.tipo_nota,
                    entry.ubicacion,
                    entry.hora_inicio,
                    entry.hora_final,
                    entry.folio,
                    entry.profiles?.email,
                    entry.user_id
                ].map(f => String(f ?? '').toLowerCase());
                return words.some(word => {
                    const regex = new RegExp(`(^|[^\\w])${escapeRegExp(word)}([^\\w]|$)`);
                    return fields.some(field => regex.test(field));
                });
            });
        }
        console.log('🔍 Después de search:', filteredEntries.length);
    }

    console.log('🔍 tipoFilter:', tipoFilter);
    console.log('🔍 ubicacionFilter:', ubicacionFilter);

    // Usar await para asegurar que displayEntries se complete antes de continuar
    await displayEntries(append ? newEntries : filteredEntries, append);

    // Actualizar contadores
    updateEntriesCounter(filteredEntries);

    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        const count = filteredEntries.length;
        paginationInfo.innerHTML = `
            ${hasAdvancedFilters ? `Mostrando ${count} entradas filtradas` : `Mostrando ${count} de ${totalEntries} entradas`}
        `;
    }

    // Ocultar botón de cargar más si hay filtros
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.style.display = hasAdvancedFilters ? 'none' : (allEntries.length >= totalEntries ? 'none' : 'block');
    }

    endFiltering();
}

// Debounce para búsqueda (mejora rendimiento)
let searchTimeout;
function debouncedFilter() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterAndDisplayEntries, 200);
}

// Enter en búsqueda dispara filtro inmediato
document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        filterAndDisplayEntries();
    }
});

// Actualizar contador de entradas
function updateEntriesCounter(entries) {
    const counter = document.getElementById('entriesCounter');
    if (counter) {
        const count = entries ? entries.length : 0;
        const totalCount = totalEntries || 0;
        counter.innerHTML = `
            <span class="counter-number">${count}</span>
            <span class="counter-text">${count === 1 ? 'entrada' : 'entradas'}</span>
            <span class="counter-total">de ${totalCount}</span>
        `;
    }
}

// Actualizar información de paginación
function updatePaginationInfo() {
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        const showing = Math.min(allEntries.length, totalEntries);
        paginationInfo.innerHTML = `
            Mostrando ${showing} de ${totalEntries} entradas
        `;
    }
}

// Indicadores de carga
function showLoadingIndicator() {
    const loader = document.getElementById('entriesLoader');
    if (loader) {
        loader.style.display = 'block';
    }
}

function hideLoadingIndicator() {
    const loader = document.getElementById('entriesLoader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// Función para contar comentarios de una entrada
async function countComments(bitacoraId) {
    try {
        const { count, error } = await supabaseClient
            .from('comentarios')
            .select('*', { count: 'exact', head: true })
            .eq('bitacora_id', bitacoraId);
        
        if (error) {
            console.error('Error contando comentarios:', error);
            return 0;
        }
        
        return count || 0;
    } catch (error) {
        console.error('Error inesperado contando comentarios:', error);
        return 0;
    }
}

// Verificar si los comentarios de una entrada han sido leídos por el usuario actual
async function checkIfCommentsRead(bitacoraId) {
    try {
        if (!currentUser || !currentUser.id) {
            return false;
        }

        const { data, error } = await supabaseClient
            .from('bitacora_read')
            .select('id')
            .eq('bitacora_id', bitacoraId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (error) {
            console.warn('⚠️ Error verificando lectura:', error.message);
            return false;
        }

        return !!data;

    } catch (error) {
        console.error('Error verificando comentarios leídos:', error);
        return false;
    }
}
// Cargar más entradas (paginación infinita)
async function loadMoreEntries() {
    if (isLoadingEntries || allEntries.length >= totalEntries) return;
    
    currentPage++;
    await loadBitacoraEntries(currentPage, true);
}

// Variable global para evitar múltiples renderizados simultáneos
let isRenderingEntries = false;

// Mostrar entradas con renderizado optimizado
async function displayEntries(entries, append = false) {
    const entriesList = document.getElementById('entriesList');
    if (!entriesList) return;
    
    // Si no es append, limpiar la lista
    if (!append) {
        entriesList.innerHTML = '';
    }
    
    // Actualizar contador con el total global
    updateEntriesCounter(allEntries);
    
    if (!entries || entries.length === 0) {
        if (!append) entriesList.innerHTML = '<p>No hay entradas de bitácora aún.</p>';
        return;
    }

    // --- OPTIMIZACIÓN: BATCHING DE CONSULTAS ---
    const entryIds = entries.map(e => e.id);
    let countsMap = new Map();
    let readMap = new Map();

    try {
        if (supabaseClient && isOnline) {
            // 1. Obtener todos los conteos de una vez
            const { data: countsData, error: countsErr } = await supabaseClient
                .from('comentarios')
                .select('bitacora_id')
                .in('bitacora_id', entryIds);
            
            if (!countsErr && countsData) {
                countsData.forEach(c => {
                    countsMap.set(c.bitacora_id, (countsMap.get(c.bitacora_id) || 0) + 1);
                });
            }

            // 2. Obtener todos los estados de lectura de una vez
            if (currentUser) {
                const { data: readData, error: readErr } = await supabaseClient
                    .from('bitacora_read')
                    .select('bitacora_id')
                    .in('bitacora_id', entryIds)
                    .eq('user_id', currentUser.id);
                
                if (!readErr && readData) {
                    readData.forEach(r => readMap.set(r.bitacora_id, true));
                }
            }
        }
    } catch (err) {
        console.warn('Error en batch optimization:', err);
    }

    const entriesWithCounts = entries.map(entry => ({
        ...entry,
        commentCount: countsMap.get(entry.id) || 0,
        isCommentsRead: readMap.get(entry.id) || false
    }));
    
    const isMobile = window.innerWidth <= 768;
    const fragment = document.createDocumentFragment();
    
    if (isMobile) {
        entriesWithCounts.forEach(entry => {
            fragment.appendChild(createMobileEntryCard(entry));
        });
        entriesList.appendChild(fragment);
    } else {
        // Versión desktop
        if (append) {
            // Añadir filas al tbody existente
            const tbody = entriesList.querySelector('tbody');
            if (tbody) {
                const rowFragment = document.createDocumentFragment();
                entriesWithCounts.forEach(entry => {
                    rowFragment.appendChild(createDesktopRow(entry));
                });
                tbody.appendChild(rowFragment);
            } else {
                entriesList.appendChild(createDesktopTable(entriesWithCounts));
            }
        } else {
            entriesList.appendChild(createDesktopTable(entriesWithCounts));
        }
    }
    
    setTimeout(initializeLazyLoading, 100);
}

// Función para crear una tarjeta de entrada para versión móvil
function createMobileEntryCard(entry) {
    const card = document.createElement('div');
    card.className = 'mobile-entry-card';
    card.setAttribute('data-entry-id', entry.id);

    const fechaUsar = entry.fecha_hora || entry.fecha;
    const fechaFormateada = formatearFechaLocal(fechaUsar);

    // Lógica de "Ver más" para descripción larga
    const descOriginal = entry.descripcion || '';
    let descDisplay = descOriginal;
    if (descOriginal.length > 100) {
        descDisplay = descOriginal.substring(0, 100) + '... <a href="#" onclick="event.preventDefault(); openDescModal(\'' + descOriginal.replace(/'/g, "\\'").replace(/\n/g, "\\n") + '\')" style="color: #667eea; font-weight: bold; cursor: pointer;">Ver más</a>';
    }

    // Preparar archivos y fotos
    let archivosHtml = '';
    let archivos = entry.archivos || entry.fotos || [];
    if (archivos && archivos.length > 0) {
        archivosHtml = '<div class="mobile-archivos-container">';
        archivos.slice(0, 4).forEach(archivo => {
            const url = typeof archivo === 'string' ? archivo : archivo.url;
            const name = typeof archivo === 'string' ? '' : archivo.name;
            const type = typeof archivo === 'string' ? '' : archivo.type;
            
            if (type && type.startsWith('image/')) {
                archivosHtml += `
                    <div class="mini-photo-container">
                        <img class="mobile-foto lazy-image" data-src="${url}" onclick="window.open('${url}', '_blank')" title="${name}" />
                    </div>
                `;
            } else {
                const icon = getFileIcon(name || url);
                archivosHtml += `<div class="mobile-file-icon" onclick="window.open('${url}', '_blank')" title="${name}">${icon}</div>`;
            }
        });
        
        if (archivos.length > 4) {
            archivosHtml += `
                <div class="more-photos-mobile" onclick="showAllArchivos('${entry.id}')" style="display: flex; align-items: center; justify-content: center; width: 35px; height: 35px; background: #f0f4ff; border-radius: 4px; border: 1px solid #667eea; color: #667eea; font-weight: bold; font-size: 0.7rem; cursor: pointer;">
                    +${archivos.length - 4}
                </div>
            `;
        }
        archivosHtml += '</div>';
    }

    const actionButtons = `
        <div class="mobile-actions" style="display: flex; gap: 8px; margin-top: 1rem; border-top: 1px solid #eee; padding-top: 0.8rem;">
            <button class="comments-btn ${entry.isCommentsRead ? 'comments-read' : ''}" onclick="openCommentsModal(${entry.id})" style="flex: 1; padding: 8px; font-size: 0.85rem;">
                Responder <span class="comment-count">${entry.commentCount || 0}</span>
            </button>
            <button class="edit-btn" onclick="editEntry(${entry.id})" style="flex: 1; padding: 8px; font-size: 0.85rem;">✏️ Editar</button>
            ${currentUser.role === 'admin' ? `<button class="delete-btn" onclick="deleteEntry(${entry.id})" style="flex: 1; padding: 8px; font-size: 0.85rem;">🗑️ Borrar</button>` : ''}
        </div>
    `;

    card.innerHTML = `
        <div class="mobile-entry-header">
            <span class="mobile-entry-date">${fechaFormateada}</span>
            <span class="entry-folio" style="background: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.75rem;">#${entry.folio || '-'}</span>
        </div>
        <div class="mobile-entry-title" style="margin-bottom: 8px; font-weight: bold; color: #2c3e50;">${entry.titulo}</div>
        
        <div class="mobile-entry-row" style="margin-bottom: 4px; font-size: 0.9rem;">
            <span class="mobile-entry-label" style="color: #7f8c8d; font-weight: 600;">Tipo:</span>
            <span class="mobile-entry-content">${entry.tipo_nota || '-'}</span>
        </div>
        
        <div class="mobile-entry-row" style="margin-bottom: 10px; font-size: 0.9rem;">
            <span class="mobile-entry-label" style="color: #7f8c8d; font-weight: 600;">Ubicación:</span>
            <span class="mobile-entry-content">${entry.ubicacion || '-'}</span>
        </div>

        <div class="mobile-entry-description" style="background: #f8f9fa; padding: 10px; border-radius: 8px; font-size: 0.95rem; border-left: 3px solid #667eea; margin-bottom: 10px;">
            ${descDisplay}
        </div>
        
        ${archivosHtml}
        
        <div class="mobile-entry-row" style="font-size: 0.75rem; color: #95a5a6; margin-top: 8px;">
            <span class="mobile-entry-label">Autor:</span>
            <span class="mobile-entry-content mobile-author-email">${entry.profiles?.email || entry.user_id || 'Usuario desconocido'}</span>
        </div>
        
        ${actionButtons}
    `;

    return card;
}

// Función auxiliar para crear una fila desktop (extraída para reusabilidad)
function createDesktopRow(entry) {
    const row = document.createElement('tr');
    row.setAttribute('data-entry-id', entry.id);
    
    let archivosHtml = '';
    let archivos = [];
    
    if (entry.archivos && Array.isArray(entry.archivos) && entry.archivos.length > 0) {
        archivos = entry.archivos;
    } else if (entry.fotos && Array.isArray(entry.fotos) && entry.fotos.length > 0) {
        archivos = entry.fotos;
    }
    
    if (archivos && archivos.length > 0) {
        const archivosParaMostrar = archivos.slice(0, 3);
        archivosHtml = '<div class="archivos-container">';
        
        archivosParaMostrar.forEach(archivo => {
            const url = typeof archivo === 'string' ? archivo : archivo.url;
            const name = typeof archivo === 'string' ? '' : archivo.name;
            const type = typeof archivo === 'string' ? '' : archivo.type;
            
            if (type && type.startsWith('image/')) {
                archivosHtml += `
                    <div class="mini-photo-container">
                        <div class="mini-image-placeholder">📷</div>
                        <img class="mini-photo lazy-image" data-src="${url}" onclick="window.open('${url}', '_blank')" title="${name}" />
                    </div>
                `;
            } else {
                const icon = getFileIcon(name || url);
                archivosHtml += `<div class="file-icon-preview" onclick="window.open('${url}', '_blank')" title="${name}">${icon}</div>`;
            }
        });
        
        if (archivos.length > 3) {
            archivosHtml += `
                <span class="more-photos" onclick="showAllArchivos('${entry.id}')" title="Ver todos los ${archivos.length} archivos">
                    +${archivos.length - 3}
                </span>
            `;
        }
        archivosHtml += '</div>';
    } else {
        archivosHtml = '<span class="no-photos">Sin archivos</span>';
    }
    
    let actionButtons = `
        <button class="comments-btn ${entry.isCommentsRead ? 'comments-read' : ''}" onclick="openCommentsModal(${entry.id})" title="Ver y responder comentarios">
            Responder <span class="comment-count">${entry.commentCount || 0}</span>
        </button>
        <button class="edit-btn" onclick="editEntry(${entry.id})">✏️ Editar</button>
    `;

    if (currentUser.role === 'admin') {
        actionButtons += `<button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️ Eliminar</button>`;
    }

    const fechaUsar = entry.fecha_hora || entry.fecha;
    let fechaFormateada = '';
    
    if (fechaUsar.includes('T')) {
        const [datePart, timePart] = fechaUsar.split('T');
        const [year, month, day] = datePart.split('-');
        const [hours, minutes] = timePart.split(':');
        fechaFormateada = `${day}/${month}/${year} ${hours}:${minutes}`;
    } else {
        const [year, month, day] = fechaUsar.split('-');
        fechaFormateada = `${day}/${month}/${year}`;
    }
    
    const descOriginal = entry.descripcion || '';
    let descDisplay = descOriginal;
    if (descOriginal.length > 100) {
        descDisplay = descOriginal.substring(0, 100) + '... <a href="#" onclick="event.preventDefault(); openDescModal(\'' + descOriginal.replace(/'/g, "\\'").replace(/\n/g, "\\n") + '\')" style="color: #667eea; font-weight: bold; cursor: pointer;">Ver más</a>';
    }

    row.innerHTML = `
        <td class="col-folio"><strong>${entry.folio || '-'}</strong></td>
        <td class="col-fecha">${fechaFormateada}</td>
        <td class="col-titulo">${entry.titulo}</td>
        <td class="col-desc">${descDisplay}</td>
        <td class="col-hini">${entry.hora_inicio || '-'}</td>
        <td class="col-hfin">${entry.hora_final || '-'}</td>
        <td class="col-tipo">${entry.tipo_nota || '-'}</td>
        <td class="col-ubic">${entry.ubicacion || ''}</td>
        <td class="col-user">${entry.profiles?.email || entry.user_id || 'Usuario desconocido'}</td>
        <td class="col-adj">${archivosHtml}</td>
        <td class="col-acc">${actionButtons}</td>
    `;
    
    return row;
}

// Reemplazar también la función createDesktopTable original para usar createDesktopRow
function createDesktopTable(entries) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    
    // Crear tabla de encabezados
    const headerContainer = document.createElement('div');
    headerContainer.className = 'table-header';
    const headerTable = document.createElement('table');
    headerTable.className = 'excel-table desktop-table';
    
    const colgroup = document.createElement('colgroup');
    colgroup.innerHTML = `
        <col class="col-folio">
        <col class="col-fecha">
        <col class="col-titulo">
        <col class="col-desc">
        <col class="col-hini">
        <col class="col-hfin">
        <col class="col-tipo">
        <col class="col-ubic">
        <col class="col-user">
        <col class="col-adj">
        <col class="col-acc">
    `;
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th class="col-folio">Folio</th>
            <th class="col-fecha">Fecha<br>Hora</th>
            <th class="col-titulo">Título</th>
            <th class="col-desc">Descripción</th>
            <th class="col-hini">Hora<br>Inicio</th>
            <th class="col-hfin">Hora<br>Final</th>
            <th class="col-tipo">Tipo Nota</th>
            <th class="col-ubic">Ubicación</th>
            <th class="col-user">Usuario</th>
            <th class="col-adj">Adjuntos</th>
            <th class="col-acc">Acciones</th>
        </tr>
    `;
    headerTable.appendChild(colgroup.cloneNode(true));
    headerTable.appendChild(thead);
    headerContainer.appendChild(headerTable);
    
    // Crear contenedor del cuerpo
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'table-body-container';
    const bodyTable = document.createElement('table');
    bodyTable.className = 'excel-table desktop-table';
    
    bodyTable.appendChild(colgroup.cloneNode(true));
    
    const tbody = document.createElement('tbody');
    entries.forEach(entry => {
        tbody.appendChild(createDesktopRow(entry));
    });
    bodyTable.appendChild(tbody);
    
    bodyContainer.appendChild(bodyTable);
    wrapper.appendChild(headerContainer);
    wrapper.appendChild(bodyContainer);
    
    return wrapper;
}

// Mostrar todos los archivos de una entrada
function showAllArchivos(entryId) {
    // console.log('Buscando archivos para entryId:', entryId);
    
    let archivos = [];
    let found = false;
    
    // Buscar en la variable global allEntries
    const entry = allEntries.find(e => e.id == entryId);
    if (entry) {
        archivos = entry.archivos || entry.fotos || [];
        found = true;
    }
    
    if (!found) {
        console.error('No se encontró la entrada para entryId:', entryId);
        return;
    }
    // console.log('Archivos encontrados:', archivos);
    
    if (archivos.length > 0) {
        const modal = document.createElement('div');
        modal.className = 'photo-modal';

        // Filtrar solo las imágenes para el botón de descarga masiva
        const imagenes = archivos.filter(archivo => {
            const type = typeof archivo === 'string' ? '' : archivo.type;
            const name = typeof archivo === 'string' ? archivo : archivo.name;
            return (type && type.startsWith('image/')) || (name && name.match(/\.(jpg|jpeg|png|gif|webp)$/i));
        });

        let modalContent = '<div class="modal-content">';
        modalContent += `
            <div class="modal-header">
                <h3>Todos los archivos (${archivos.length})</h3>
                <div class="modal-header-actions" style="display: flex; gap: 10px; align-items: center;">
                    ${imagenes.length > 0 ? `
                        <button class="download-all-btn" id="downloadAllImagesBtn" title="Descargar todas las imágenes">
                            📥 Descargar Imágenes (${imagenes.length})
                        </button>
                    ` : ''}
                    <button class="close-modal" onclick="this.closest('.photo-modal').remove()">✕</button>
                </div>
            </div>
            <div class="files-grid">
        `;

        archivos.forEach(archivo => {
            const url = typeof archivo === 'string' ? archivo : archivo.url;
            const name = typeof archivo === 'string' ? '' : archivo.name;
            const type = typeof archivo === 'string' ? '' : archivo.type;
            const size = typeof archivo === 'string' ? '' : archivo.size;

            if (type && type.startsWith('image/')) {
                // Para imágenes
                modalContent += `
                    <div class="file-item">
                        <img src="${url}" onclick="window.open('${url}', '_blank')" />
                        <div class="file-details">
                            <div class="file-name">${name || 'Imagen'}</div>
                            <div class="file-size">${formatFileSize(size)}</div>
                        </div>
                    </div>
                `;
            } else {
                // Para otros archivos
                const icon = getFileIcon(name || url);
                modalContent += `
                    <div class="file-item">
                        <div class="file-icon-large" onclick="window.open('${url}', '_blank')">${icon}</div>
                        <div class="file-details">
                            <div class="file-name">${name || 'Archivo'}</div>
                            <div class="file-size">${formatFileSize(size)}</div>
                            <button class="download-btn" onclick="window.open('${url}', '_blank')">📥 Descargar</button>
                        </div>
                    </div>
                `;
            }
        });

        modalContent += '</div></div>';
        modal.innerHTML = modalContent;
        document.body.appendChild(modal);

        // Agregar evento al botón de descarga masiva
        const downloadBtn = modal.querySelector('#downloadAllImagesBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => downloadAllImages(imagenes));
        }
        // console.log('Modal de archivos agregado');
    } else {
        // console.log('No hay archivos para mostrar');
    }
}

// Función para descargar todas las imágenes en un archivo ZIP
async function downloadAllImages(imagenes) {
    if (!imagenes || imagenes.length === 0) return;

    if (typeof JSZip === 'undefined') {
        showNotification('⚠️ La librería de compresión aún se está cargando o no está disponible.', 'warning');
        // Fallback a descarga individual si JSZip no está
        const confirmacion = confirm(`La descarga ZIP no está disponible. ¿Deseas descargar las ${imagenes.length} imágenes individualmente?`);
        if (confirmacion) {
            for (let i = 0; i < imagenes.length; i++) {
                const archivo = imagenes[i];
                const url = typeof archivo === 'string' ? archivo : archivo.url;
                const name = typeof archivo === 'string' ? `imagen_${i + 1}.jpg` : archivo.name;
                window.open(url, '_blank');
            }
        }
        return;
    }

    const confirmacion = confirm(`¿Deseas descargar las ${imagenes.length} imágenes en un archivo comprimido (.zip)?`);
    if (!confirmacion) return;

    const zip = new JSZip();
    const folder = zip.folder("imagenes_bitacora");

    showNotification(`📦 Preparando archivo ZIP con ${imagenes.length} imágenes...`, 'info', 5000);

    let descargados = 0;
    const total = imagenes.length;

    // Descargar cada imagen y añadirla al ZIP
    const promesas = imagenes.map(async (archivo, index) => {
        const url = typeof archivo === 'string' ? archivo : archivo.url;
        let name = typeof archivo === 'string' ? `imagen_${index + 1}.jpg` : archivo.name;

        // Asegurarse de que el nombre tenga una extensión válida para el ZIP
        if (!name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            name += '.jpg';
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error al descargar');
            const blob = await response.blob();
            folder.file(name, blob);
            descargados++;
            // Opcional: actualizar notificación de progreso
        } catch (error) {
            console.error(`Error al añadir ${name} al ZIP:`, error);
        }
    });

    await Promise.all(promesas);

    if (descargados === 0) {
        showNotification('❌ No se pudo descargar ninguna imagen para el ZIP', 'error');
        return;
    }

    try {
        showNotification('🚀 Generando archivo ZIP...', 'info', 3000);
        const content = await zip.generateAsync({type:"blob"});
        const zipName = `bitacora_imagenes_${new Date().getTime()}.zip`;

        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(content);
        link.download = zipName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.URL.revokeObjectURL(link.href);
        showNotification('✅ Archivo ZIP descargado con éxito', 'success', 3000);
    } catch (error) {
        console.error('Error generando ZIP:', error);
        showNotification('❌ Error al generar el archivo ZIP', 'error');
    }
}

// Ver imagen en pantalla completa
function viewImageFullscreen(url, name) {
    const fullscreenModal = document.createElement('div');
    fullscreenModal.className = 'fullscreen-image-modal';
    fullscreenModal.innerHTML = `
        <div class="fullscreen-content">
            <button class="fullscreen-close" onclick="this.closest('.fullscreen-image-modal').remove()">✕</button>
            <img src="${url}" alt="${name}" />
            <div class="fullscreen-info">${name}</div>
        </div>
    `;
    document.body.appendChild(fullscreenModal);
    
    // Cerrar con ESC
    const closeHandler = (e) => {
        if (e.key === 'Escape') {
            fullscreenModal.remove();
            document.removeEventListener('keydown', closeHandler);
        }
    };
    document.addEventListener('keydown', closeHandler);
}

// Mantener compatibilidad con función anterior
function showAllPhotos(entryId) {
    showAllArchivos(entryId);
}

// Editar entrada
async function editEntry(entryId) {
    try {
        let data, error;

        if (isOnline) {
            // Intentar cargar desde Supabase
            const result = await supabaseClient
                .from('bitacora')
                .select('*')
                .eq('id', entryId)
                .single();
            data = result.data;
            error = result.error;
        } else {
            // Cargar desde IndexedDB si offline
            data = await dbManager.getEntryById(entryId);
            error = data ? null : new Error('Entrada no encontrada offline');
        }

        if (error || !data) {
            showNotification('❌ Error al cargar la entrada para editar', 'error');
            return;
        }

        // Validar permisos: solo admin o dueño de la entrada puede editar
        const isAdmin = currentUser.role === 'admin';
        const isOwner = data.user_id === currentUser.id;

        if (!isAdmin && !isOwner) {
            showNotification('❌ No tienes permiso para editar esta entrada', 'error');
            return;
        }

    // Mostrar formulario primero
    showForm();
    
    // Llenar formulario con datos existentes - usar fecha directamente
    let fechaParaFormulario = data.fecha;
    
    // Si viene con timezone Z o con segundos, ajustar al formato datetime-local
    if (data.fecha && (data.fecha.includes('Z') || data.fecha.includes('.'))) {
        const fecha = new Date(data.fecha);
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        const hours = String(fecha.getHours()).padStart(2, '0');
        const minutes = String(fecha.getMinutes()).padStart(2, '0');
        fechaParaFormulario = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    document.getElementById('fecha').value = fechaParaFormulario;
    
    // Ajustar altura de textareas según su contenido (versión segura)
    const tituloTextarea = document.getElementById('titulo');
    tituloTextarea.value = data.titulo;
    autoResize(tituloTextarea);
    
    const descripcionTextarea = document.getElementById('descripcion');
    descripcionTextarea.value = data.descripcion || '';
    autoResize(descripcionTextarea);
    
    document.getElementById('horaInicio').value = data.hora_inicio || '';
    document.getElementById('horaFinal').value = data.hora_final || '';
    document.getElementById('tipoNota').value = data.tipo_nota || '';
    
    document.getElementById('ubicacion').value = data.ubicacion || '';
    

    
    // Cambiar el comportamiento del formulario para actualizar
    const form = document.getElementById('bitacoraForm');
    form.dataset.editId = entryId;
    
    // Guardar archivos existentes para referencia
    form.dataset.existingPhotos = JSON.stringify(data.archivos || []);
    
    // Cambiar texto del botón y estilo
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Actualizar Entrada';
    submitBtn.classList.add('update-mode');
    
    // Ocultar preview de fotos al editar
    document.getElementById('photoPreview').style.display = 'none';
    
    // Mostrar advertencia de actualización si hay archivos existentes
    const updateWarning = document.getElementById('updateWarning');
    if (data.archivos && data.archivos.length > 0) {
        updateWarning.style.display = 'block';
        document.getElementById('keepPhotosCheckbox').checked = true;
    } else {
        updateWarning.style.display = 'none';
    }
    
    } catch (error) {
        console.error('Error al editar entrada:', error);
        showNotification('❌ Error al cargar la entrada para editar', 'error');
    }
}

// Función de diagnóstico para eliminación
async function diagnoseDeleteIssue(entryId) {
    console.log('🔍 === DIAGNÓSTICO DE ELIMINACIÓN ===');
    
    try {
        // 1. Verificar si la entrada existe
        console.log('🔍 Paso 1: Verificando si la entrada existe...');
        const { data: entryExists, error: checkError } = await supabaseClient
            .from('bitacora')
            .select('id, user_id')
            .eq('id', entryId)
            .single();
        
        console.log('🔍 Entrada encontrada:', entryExists);
        console.log('🔍 Error al verificar:', checkError);
        
        // 2. Verificar si hay comentarios relacionados
        console.log('🔍 Paso 2: Verificando comentarios relacionados...');
        const { data: relatedComments, error: commentsError } = await supabaseClient
            .from('comentarios')
            .select('id, bitacora_id')
            .eq('bitacora_id', entryId);
        
        console.log('🔍 Comentarios relacionados:', relatedComments);
        console.log('🔍 Error al verificar comentarios:', commentsError);
        
        // 3. Verificar si hay registros de lectura
        console.log('🔍 Paso 3: Verificando registros de lectura...');
        const { data: readRecords, error: readError } = await supabaseClient
            .from('bitacora_read')
            .select('id, bitacora_id')
            .eq('bitacora_id', entryId);
        
        console.log('🔍 Registros de lectura:', readRecords);
        console.log('🔍 Error al verificar lectura:', readError);
        
        // 4. Verificar si hay logs de notificaciones
        console.log('🔍 Paso 4: Verificando logs de notificaciones...');
        const { data: notificationLogs, error: logError } = await supabaseClient
            .from('notification_logs')
            .select('id, entry_id')
            .eq('entry_id', entryId);
        
        console.log('🔍 Logs de notificaciones:', notificationLogs);
        console.log('🔍 Error al verificar logs:', logError);
        
        // 5. Intentar eliminar registros relacionados manualmente
        console.log('🔍 Paso 5: Limpiando registros relacionados...');
        
        // Eliminar comentarios
        if (relatedComments && relatedComments.length > 0) {
            const { error: delCommentsError } = await supabaseClient
                .from('comentarios')
                .delete()
                .eq('bitacora_id', entryId);
            console.log('🔍 Resultado eliminar comentarios:', delCommentsError);
        }
        
        // Eliminar registros de lectura
        if (readRecords && readRecords.length > 0) {
            const { error: delReadError } = await supabaseClient
                .from('bitacora_read')
                .delete()
                .eq('bitacora_id', entryId);
            console.log('🔍 Resultado eliminar lectura:', delReadError);
        }
        
        // Eliminar logs
        if (notificationLogs && notificationLogs.length > 0) {
            const { error: delLogError } = await supabaseClient
                .from('notification_logs')
                .delete()
                .eq('entry_id', entryId);
            console.log('🔍 Resultado eliminar logs:', delLogError);
        }
        
        console.log('🔍 === FIN DEL DIAGNÓSTICO ===');
        
    } catch (error) {
        console.error('🚨 Error en diagnóstico:', error);
    }
}

// Eliminar entrada
async function deleteEntry(entryId) {
    // Solo admin puede eliminar entradas
    if (currentUser.role !== 'admin') {
        showNotification('❌ Solo los administradores pueden eliminar entradas', 'error');
        return;
    }

    if (confirm('⚠️ ¿REALMENTE DESEA ELIMINAR ESTA ENTRADA?\n\n• Se eliminarán todos los archivos adjuntos\n• Se eliminarán todos los comentarios\n• Este paso NO se puede recuperar\n\n¿Desea continuar?')) {
        try {
            console.log('🗑️ Eliminando entrada:', entryId);
            showNotification('🔄 Eliminando entrada...', 'info', 2000);

            let entry, fetchError;

            if (isOnline && supabaseClient) {
                // Obtener desde Supabase
                const result = await supabaseClient
                    .from('bitacora')
                    .select('*')
                    .eq('id', entryId)
                    .single();
                entry = result.data;
                fetchError = result.error;
            } else {
                // Obtener desde IndexedDB
                entry = await dbManager.getEntryById(entryId);
                fetchError = entry ? null : new Error('Entrada no encontrada offline');
            }

            if (fetchError || !entry) {
                console.error('❌ Error obteniendo entrada:', fetchError);
                throw new Error('No se pudo obtener la entrada: ' + (fetchError?.message || 'No encontrada offline'));
            }

            if (isOnline && supabaseClient) {
                // 2. Eliminar archivos del storage si existen
                const archivos = entry.archivos || entry.fotos || [];
                if (archivos.length > 0) {
                    console.log('🗂️ Eliminando', archivos.length, 'archivos del storage...');
                    await deleteMultipleFilesFromR2(archivos);
                }

                // 3. Eliminar archivos de comentarios
                const { data: comentarios } = await supabaseClient
                    .from('comentarios')
                    .select('archivos')
                    .eq('bitacora_id', entryId);

                if (comentarios) {
                    for (const comentario of comentarios) {
                        const archivosComentario = comentario.archivos || [];
                        await deleteMultipleFilesFromR2(archivosComentario);
                    }
                }

                // 4. Usar función RPC para eliminar de forma segura
                console.log('🔄 Eliminando entrada con función RPC...');

                const { error: rpcError } = await supabaseClient
                    .rpc('delete_bitacora_entry', { entry_id_param: entryId });

                if (rpcError) {
                    console.error('❌ Error en RPC:', rpcError);

                    // Intentar método alternativo si RPC falla
                    console.log('🔄 Intentando método alternativo...');

                    await supabaseClient.from('notification_logs').delete().eq('entry_id', entryId);
                    await supabaseClient.from('comentarios').delete().eq('bitacora_id', entryId);
                    await supabaseClient.from('bitacora_read').delete().eq('entry_id', entryId);
                    await deleteEntryOnline(entryId);
                }
                // También eliminar de IndexedDB si existe
                try {
                    await dbManager.deleteEntry(entryId);
                    console.log('✅ Entrada eliminada de IndexedDB');
                } catch (dbError) {
                    console.warn('⚠️ Error eliminando de IndexedDB:', dbError);
                }
            } else {
                // Modo offline: eliminar de IndexedDB y agregar al queue
                console.log('🔴 Modo offline - Eliminando entrada de IndexedDB');

                await dbManager.deleteEntry(entryId);
                await dbManager.addToQueue('delete_entry', { id: entryId });

                console.log('✅ Entrada eliminada offline (se sincronizará cuando vuelva la conexión)');
            }

            console.log('✅ Entrada eliminada exitosamente');
            showNotification('✅ Entrada eliminada correctamente', 'success');

            // Forzar recarga completa limpiando caché
            allEntries = [];
            currentPage = 1;

            await new Promise(resolve => setTimeout(resolve, 300));
            await loadBitacoraEntries(1, false);

        } catch (error) {
            console.error('❌ Error general:', error);
            showNotification('❌ Error: ' + error.message, 'error');
        }
    }
}

// Función auxiliar para obtener nombre del rol
function getRoleDisplayName(role) {
    const roles = {
        'admin': 'Administrador',
        'contratista': 'Contratista',
        'interventoria': 'Interventoría',
        'supervision': 'Supervisión',
        'ordenador_gasto': 'Ordenador del Gasto',
        'user': 'Usuario'
    };
    return roles[role] || 'Usuario';
}

// Verificar conexión y estructura de base de datos (optimizado)
async function checkDatabaseStructure() {
    try {
        // Verificación rápida con timeout
        const result = await Promise.race([
            supabaseClient
                .from('bitacora')
                .select('id')
                .limit(1),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 2000)
            )
        ]);
        
        if (result.error && result.error.code === 'PGRST116') {
            console.error('La tabla bitacora no existe o no tiene acceso');
            showNotification('❌ Error: La tabla bitacora no existe. Verifica la configuración de la base de datos.', 'error');
            return false;
        }
        
        console.log('✅ Estructura básica verificada correctamente');
        return true;
        
    } catch (error) {
        console.warn('Error verificando estructura (continuando igual):', error.message);
        return true; // No bloquear el login si hay error en verificación
    }
}

// Verificar sesión
async function checkAuth() {
    console.log('🔍 ========== INICIANDO checkAuth ==========');

    // Obtener sesión offline guardada (para usar como fallback)
    const offlineSession = localStorage.getItem('bitacora_session');
    let savedSessionData = null;

    if (offlineSession) {
        try {
            savedSessionData = JSON.parse(offlineSession);
            console.log('🔍 Sesión guardada encontrada:', savedSessionData.user?.email);
            console.log('🔍 Rol guardado:', savedSessionData.user?.role);
        } catch (parseError) {
            console.warn('Error parseando sesión guardada:', parseError);
        }
    }

    // PASO 1: SIEMPRE intentar autenticación online primero
    console.log('🔍 Supabase client disponible:', !!supabaseClient);

    if (supabaseClient) {
        try {
            console.log('🔍 Intentando autenticación online...');

            // Intentar obtener sesión de Supabase con timeout
            const sessionPromise = supabaseClient.auth.getSession();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 5000)
            );

            const result = await Promise.race([sessionPromise, timeoutPromise]);
            console.log('🔍 Resultado getSession:', result);

            const { data: { session }, error } = result;
            console.log('🔍 Session:', session ? 'Existe' : 'No existe');
            console.log('🔍 Error:', error);

            if (!error && session) {
                console.log('🔍 ✅ Sesión online VÁLIDA encontrada:', session.user.email);
                currentUser = session.user;
                isOnline = true;
                offlineMode = false;
                document.body.classList.remove('offline-mode');

                // Obtener perfil con rol
                try {
                    const { data: profile } = await Promise.race([
                        supabaseClient
                            .from('profiles')
                            .select('rol, nombre')
                            .eq('id', currentUser.id)
                            .single(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout')), 3000)
                        )
                    ]);

                    if (profile) {
                        currentUser.role = profile.rol || 'user';
                        currentUser.nombre = profile.nombre;
                        console.log('👤 Rol obtenido:', currentUser.role);
                    } else {
                        currentUser.role = 'user';
                    }
                } catch (profileError) {
                    console.warn('⚠️ Error obteniendo perfil:', profileError);
                    // Usar rol guardado si existe
                    currentUser.role = savedSessionData?.user?.role || 'user';
                }

                // Guardar sesión completa con rol para uso offline
                localStorage.setItem('bitacora_session', JSON.stringify({
                    user: {
                        ...currentUser,
                        role: currentUser.role,
                        nombre: currentUser.nombre
                    },
                    expires_at: session.expires_at
                }));

                // Actualizar UI
                const displayName = currentUser.nombre || currentUser.email || 'Usuario';
                document.getElementById('userName').textContent = displayName;
                document.getElementById('userRole').textContent = '(' + getRoleDisplayName(currentUser.role) + ')';

                const manageUsersBtn = document.getElementById('manageUsersBtn');
                if (manageUsersBtn) {
                    manageUsersBtn.style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
                }

                showMain();
                await loadBitacoraEntries();
                return;
            }
        } catch (onlineError) {
            console.warn('⚠️ Error en autenticación online:', onlineError.message);
        }
    }

    // PASO 2: Si no hay sesión online, usar sesión guardada (modo offline)
    if (savedSessionData && savedSessionData.user) {
        console.log('🔍 ⚠️ Usando sesión guardada en modo offline');
        console.log('🔍 Datos guardados:', JSON.stringify(savedSessionData.user, null, 2));

        currentUser = savedSessionData.user;
        // Usar el rol guardado, no sobrescribir con 'user'
        const savedRole = savedSessionData.user.role || savedSessionData.user.rol || 'user';
        currentUser.role = savedRole;
        console.log('🔍 Rol a usar:', savedRole);

        isOnline = false;
        offlineMode = true;

        const displayName = currentUser.nombre || currentUser.name || currentUser.email || 'Usuario';
        document.getElementById('userName').textContent = displayName;

        // Mostrar rol guardado con indicador offline
        const roleDisplay = getRoleDisplayName(currentUser.role);
        console.log('🔍 Role display:', roleDisplay);
        document.getElementById('userRole').textContent = '(' + roleDisplay + ' - Offline)';

        const manageUsersBtn = document.getElementById('manageUsersBtn');
        if (manageUsersBtn) {
            // En modo offline, ocultar gestión de usuarios
            manageUsersBtn.style.display = 'none';
        }

        document.body.classList.add('offline-mode');
        showMain();
        await loadBitacoraEntries();
        return;
    }

    // PASO 3: No hay sesión - mostrar login
    console.log('🔍 No hay sesión - mostrando login');
    showLogin();
}

// Función de diagnóstico para modo offline
async function diagnoseOfflineMode() {
    console.log('🔍 === DIAGNÓSTICO MODO OFFLINE ===');

    console.log('📡 Estado de conexión:');
    console.log('  - navigator.onLine:', navigator.onLine);
    console.log('  - isOnline (variable):', isOnline);
    console.log('  - offlineMode:', offlineMode);
    console.log('  - body class contains offline-mode:', document.body.classList.contains('offline-mode'));

    console.log('👤 Estado de usuario:');
    console.log('  - currentUser existe:', !!currentUser);
    if (currentUser) {
        console.log('  - email:', currentUser.email);
        console.log('  - role:', currentUser.role);
    }

    console.log('💾 Estado de IndexedDB:');
    console.log('  - dbManager existe:', !!dbManager);
    if (dbManager && dbManager.db) {
        try {
            const entries = await dbManager.getAllEntries();
            console.log('  - entradas en IndexedDB:', entries.length);
            if (entries.length > 0) {
                console.log('  - muestra de entradas:', entries.slice(0, 2).map(e => ({id: e.id, titulo: e.titulo})));
            }
        } catch (error) {
            console.log('  - error accediendo IndexedDB:', error.message);
        }
    }

    console.log('🌐 Estado de localStorage:');
    const session = localStorage.getItem('bitacora_session');
    console.log('  - sesión guardada:', !!session);
    if (session) {
        try {
            const sessionData = JSON.parse(session);
            console.log('  - usuario en sesión:', sessionData.user?.email);
        } catch (error) {
            console.log('  - error parseando sesión:', error.message);
        }
    }

    console.log('📊 Estado de datos:');
    console.log('  - allEntries.length:', allEntries.length);
    console.log('  - totalEntries:', totalEntries);

    console.log('🔍 === FIN DIAGNÓSTICO ===');
}

// Función para forzar modo offline (para testing)
async function forceOfflineMode() {
    console.log('🔧 Forzando modo offline manualmente');

    isOnline = false;
    offlineMode = true;
    document.body.classList.add('offline-mode');

    showNotification('🔴 Modo offline forzado', 'warning', 2000);

    try {
        await loadOfflineEntries();
    } catch (error) {
        console.error('Error forzando offline:', error);
        showNotification('❌ Error cargando offline', 'error', 3000);
    }
}

// Función para probar conectividad manualmente
async function testConnectivity() {
    console.log('🧪 ========== PRUEBA MANUAL DE CONECTIVIDAD ==========');
    const realOnline = await checkRealConnectivity();
    const result = {
        navigatorOnLine: navigator.onLine,
        realOnline: realOnline,
        isOnline: isOnline,
        offlineMode: offlineMode,
        bodyHasOfflineClass: document.body.classList.contains('offline-mode'),
        timestamp: new Date().toISOString()
    };

    console.log('🧪 Resultado:', result);

    // Forzar actualización del estado si es necesario
    const shouldBeOnline = realOnline;
    if (isOnline !== shouldBeOnline) {
        console.log('🧪 Corrigiendo estado de conexión...');
        isOnline = shouldBeOnline;
        offlineMode = !shouldBeOnline;
        document.body.classList.toggle('offline-mode', !shouldBeOnline);

        if (shouldBeOnline) {
            showNotification('🟢 Conexión detectada', 'success', 2000);
            await syncOfflineQueue();
            await loadBitacoraEntries(1, false);
        } else {
            showNotification('🔴 Sin conexión detectada', 'warning', 2000);
            await loadOfflineEntries();
        }
    }

    // Mostrar en pantalla también
    showNotification(`Conectividad: Real=${realOnline}, Navigator=${navigator.onLine}, isOnline=${isOnline}`, 'info', 5000);

    console.log('🧪 ========== PRUEBA COMPLETADA ==========');
    return result;
}

// Función para probar el envío de emails
async function testEmailNotification() {
    console.log('📧 ========== PRUEBA DE ENVÍO DE EMAIL ==========');

    if (!supabaseClient) {
        console.error('❌ Supabase client no disponible');
        showNotification('❌ Supabase no disponible', 'error', 3000);
        return;
    }

    const entradaPrueba = {
        titulo: 'PRUEBA - Sistema de Notificaciones',
        descripcion: 'Esta es una entrada de prueba para verificar que el sistema de notificaciones por email funciona correctamente.',
        ubicacion: 'Troncal Calle 26',
        tipo_nota: 'avance',
        tipoNota: 'avance',
        estado: 'activo',
        fecha: new Date().toISOString(),
        folio: 'TEST-' + Date.now()
    };

    console.log('📧 Datos de prueba:', entradaPrueba);
    showNotification('📧 Enviando email de prueba...', 'info', 3000);

    try {
        const resultado = await enviarNotificacionesEmailATodos(entradaPrueba);
        console.log('📧 Resultado:', resultado);

        if (resultado && !resultado.error) {
            console.log('✅ Prueba de email exitosa');
        } else {
            console.log('⚠️ Prueba de email con errores');
        }

        return resultado;
    } catch (error) {
        console.error('❌ Error en prueba de email:', error);
        showNotification('❌ Error: ' + error.message, 'error', 5000);
        return { error: true, message: error.message };
    }
}

// Función para verificar usuarios en profiles
async function checkEmailRecipients() {
    console.log('👥 ========== VERIFICACIÓN DE DESTINATARIOS ==========');

    if (!supabaseClient) {
        console.error('❌ Supabase client no disponible');
        return;
    }

    try {
        const { data: usuarios, error } = await supabaseClient
            .from('profiles')
            .select('id, email, nombre, rol')
            .not('email', 'is', null);

        if (error) {
            console.error('❌ Error obteniendo usuarios:', error);
            return;
        }

        console.log(`👥 Total usuarios con email: ${usuarios.length}`);
        console.log('👥 Lista de destinatarios:');
        usuarios.forEach((u, i) => {
            console.log(`  ${i + 1}. ${u.nombre || 'Sin nombre'} <${u.email}> - Rol: ${u.rol || 'user'}`);
        });

        showNotification(`👥 ${usuarios.length} usuarios encontrados para notificar`, 'info', 3000);
        return usuarios;
    } catch (error) {
        console.error('❌ Error:', error);
        return null;
    }
}

// Función para verificar estado de IndexedDB
async function checkIndexedDBStatus() {
    console.log('💾 ========== VERIFICACIÓN INDEXEDDB ==========');

    try {
        if (!dbManager) {
            console.log('❌ dbManager no existe');
            return;
        }

        const entries = await dbManager.getAllEntries();
        console.log(`📦 Total entradas en IndexedDB: ${entries.length}`);

        if (entries.length > 0) {
            console.log('📦 Lista de entradas:');
            entries.forEach((entry, index) => {
                console.log(`  ${index + 1}. ID: ${entry.id}`);
                console.log(`     Título: ${entry.titulo}`);
                console.log(`     Fecha: ${entry.fecha}`);
                console.log(`     Folio: ${entry.folio}`);
                console.log(`     Usuario: ${entry.user_id}`);
                console.log(`     Offline: ${entry.isOffline}`);
                console.log('     ---');
            });
        }

        // Verificar queue de sincronización
        const queue = await dbManager.getQueueItems();
        console.log(`📋 Items en queue de sincronización: ${queue.length}`);

        if (queue.length > 0) {
            console.log('📋 Queue items:');
            queue.forEach((item, index) => {
                console.log(`  ${index + 1}. Acción: ${item.action}, ID: ${item.data?.id}`);
            });
        }

        console.log('💾 ========== VERIFICACIÓN COMPLETADA ==========');

        showNotification(`IndexedDB: ${entries.length} entradas, ${queue.length} en queue`, 'info', 3000);

    } catch (error) {
        console.error('❌ Error verificando IndexedDB:', error);
        showNotification('❌ Error verificando base de datos', 'error', 3000);
    }
}

// El check periódico ya está incluido arriba con checkRealConnectivity cada 3 segundos

// Función para forzar modo online (para testing)
async function forceOnlineMode() {
    console.log('🔧 Forzando modo online manualmente');

    isOnline = true;
    offlineMode = false;
    document.body.classList.remove('offline-mode');

    showNotification('🟢 Modo online forzado', 'success', 2000);

    try {
        await loadBitacoraEntries(1, false);
        await syncOfflineQueue();
    } catch (error) {
        console.error('Error forzando online:', error);
        showNotification('❌ Error cargando online', 'error', 3000);
    }
}

// Función para forzar verificación de conectividad
async function forceConnectivityCheck() {
    console.log('🔧 Forzando verificación de conectividad...');
    await testConnectivity();
}

// Hacer funciones globales para debugging
window.diagnoseOfflineMode = diagnoseOfflineMode;
window.forceOfflineMode = forceOfflineMode;
window.forceOnlineMode = forceOnlineMode;
window.testConnectivity = testConnectivity;
window.checkIndexedDBStatus = checkIndexedDBStatus;
window.forceConnectivityCheck = forceConnectivityCheck;

// Función para obtener nombre amigable del rol
function getRoleDisplayName(role) {
    const roleNames = {
        'admin': 'Administrador',
        'contratista': 'Contratista',
        'interventoria': 'Interventoría',
        'supervision': 'Supervisión del Contrato',
        'ordenador_gasto': 'Ordenador del Gasto'
    };
    return roleNames[role] || role;
}

// Función para auto-ajustar altura de textareas (versión mejorada)
function autoResize(textarea) {
    // Guardar el scroll actual
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    
    // Resetear altura para medir correctamente
    textarea.style.height = 'auto';
    
    // Calcular nueva altura con límites máximos
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 44;
    const maxHeight = 200; // Límite máximo para evitar que el formulario se rompa
    
    let newHeight = Math.max(minHeight, scrollHeight);
    newHeight = Math.min(newHeight, maxHeight);
    
    // Aplicar nueva altura
    textarea.style.height = newHeight + 'px';
    
    // Si el contenido es muy largo, agregar scroll interno
    if (scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto';
    } else {
        textarea.style.overflowY = 'hidden';
    }
    
    // Restaurar scroll para evitar saltos en móvil
    window.scrollTo(0, scrollTop);
}

// Función mejorada para manejar textareas grandes
function setupTextarea(textarea) {
    // Configurar propiedades base
    textarea.style.minHeight = '44px';
    textarea.style.maxHeight = '200px';
    textarea.style.overflowY = 'hidden';
    textarea.style.resize = 'none'; // Deshabilitar resize manual
    
    // Auto-ajustar inicial
    autoResize(textarea);
    
    // Event listener mejorado con debounce
    let resizeTimeout;
    textarea.addEventListener('input', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            autoResize(textarea);
        }, 100);
    });
    
    // También ajustar cuando se pega texto
    textarea.addEventListener('paste', function() {
        setTimeout(() => {
            autoResize(textarea);
        }, 50);
    });
}

// Event listeners
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('bitacoraForm').addEventListener('submit', handleBitacoraSubmit);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('newEntryBtn').addEventListener('click', showForm);
document.getElementById('cancelFormBtn').addEventListener('click', hideForm);

// Configurar textareas con auto-ajuste mejorado
document.getElementById('titulo')?.addEventListener('DOMContentLoaded', function() {
    setupTextarea(document.getElementById('titulo'));
});

document.getElementById('descripcion')?.addEventListener('DOMContentLoaded', function() {
    setupTextarea(document.getElementById('descripcion'));
});



// Configurar inmediatamente si ya están cargados
if (document.getElementById('titulo')) {
    setupTextarea(document.getElementById('titulo'));
}
if (document.getElementById('descripcion')) {
    setupTextarea(document.getElementById('descripcion'));
}

// Variable global para almacenar todos los archivos seleccionados
let allSelectedFiles = [];

// Preview de archivos
document.getElementById('fotos')?.addEventListener('change', function(e) {
    const files = e.target.files;
    const preview = document.getElementById('photoPreview');
    const grid = document.getElementById('photoPreviewGrid');
    const form = document.getElementById('bitacoraForm');
    const isEditMode = form.dataset.editId;
    
    // Acumular archivos nuevos con los existentes
    allSelectedFiles = [...allSelectedFiles, ...Array.from(files)];
    
    if (allSelectedFiles.length > 0) {
        preview.style.display = 'block';
        grid.innerHTML = '';
        
        allSelectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-preview-item';
            
            if (file.type.startsWith('image/')) {
                // Para imágenes, mostrar vista previa
                const reader = new FileReader();
                reader.onload = function(e) {
                    item.innerHTML = `
                        <div class="file-preview-content">
                            <img src="${e.target.result}" alt="${file.name}">
                            <div class="file-name">${file.name}</div>
                        </div>
                    `;
                };
                reader.readAsDataURL(file);
            } else {
                // Para otros archivos, mostrar icono según tipo
                const icon = getFileIcon(file.name);
                item.innerHTML = `
                    <div class="file-preview-content">
                        <div class="file-icon">${icon}</div>
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${formatFileSize(file.size)}</div>
                    </div>
                `;
            }
            
            grid.appendChild(item);
        });
        
        // Agregar botón "+" para agregar más archivos
        const addMoreItem = document.createElement('div');
        addMoreItem.className = 'file-preview-item file-preview-add-more';
        addMoreItem.innerHTML = `
            <div class="file-preview-content">
                <div class="add-more-icon">+</div>
                <div class="add-more-text">Agregar más</div>
            </div>
        `;
        addMoreItem.addEventListener('click', function() {
            document.getElementById('fotos').click();
        });
        grid.appendChild(addMoreItem);
        
        // Si estamos en modo edición, actualizar el texto informativo
        const fileInfo = preview.querySelector('.file-info');
        if (isEditMode && fileInfo) {
            const keepPhotosCheckbox = document.getElementById('keepPhotosCheckbox');
            if (keepPhotosCheckbox && keepPhotosCheckbox.checked) {
                fileInfo.textContent = `ℹ️ ${allSelectedFiles.length} archivos nuevos se agregarán a los existentes`;
            } else {
                fileInfo.textContent = `⚠️ ${allSelectedFiles.length} archivos nuevos reemplazarán los existentes`;
            }
        }
    } else {
        preview.style.display = 'none';
        
        // Restaurar texto original si no hay archivos
        const fileInfo = preview.querySelector('.file-info');
        if (fileInfo) {
            fileInfo.textContent = 'ℹ️ Los archivos seleccionados se agregarán al guardar';
        }
    }
});

// Función para obtener icono según tipo de archivo
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'xls': '📊',
        'xlsx': '📊',
        'ppt': '📋',
        'pptx': '📋',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'webp': '🖼️'
    };
    return iconMap[ext] || '📎';
}

// Función para formatear tamaño de archivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Lazy loading para imágenes
function initializeLazyLoading() {
    if (!window.IntersectionObserver) return;
    
    // Solo observar imágenes que no han sido observadas aún
    const lazyImages = document.querySelectorAll('.lazy-image:not([data-observed])');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const placeholder = img.previousElementSibling;
                
                // Cargar imagen
                img.onload = () => {
                    if (placeholder && placeholder.classList.contains('image-placeholder')) {
                        placeholder.style.display = 'none';
                    }
                    img.classList.add('loaded');
                };
                
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    // Dejar de observar inmediatamente para liberar recursos
                    observer.unobserve(img);
                }
            }
        });
    }, {
        rootMargin: '100px 0px', // Cargar 100px antes
        threshold: 0.01
    });

    lazyImages.forEach(img => {
        imageObserver.observe(img);
        img.setAttribute('data-observed', 'true');
    });
}

// Event listeners para filtros con debounce
document.getElementById('searchInput')?.addEventListener('input', debouncedFilter);
document.getElementById('tipoFilter')?.addEventListener('change', () => filterAndDisplayEntries());
document.getElementById('ubicacionFilter')?.addEventListener('change', () => filterAndDisplayEntries());
document.getElementById('fechaInicioFilter')?.addEventListener('change', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterAndDisplayEntries, 500);
});
document.getElementById('fechaFinalFilter')?.addEventListener('change', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterAndDisplayEntries, 500);
});
document.getElementById('downloadPdf')?.addEventListener('click', downloadPDF);
document.getElementById('clearFilters')?.addEventListener('click', async () => {
    console.log('🔄 Limpiando filtros...');
    
    // Limpiar campos de filtro
    const searchInput = document.getElementById('searchInput');
    const tipoFilter = document.getElementById('tipoFilter');
    const ubicacionFilter = document.getElementById('ubicacionFilter');
    const fechaInicioFilter = document.getElementById('fechaInicioFilter');
    const fechaFinalFilter = document.getElementById('fechaFinalFilter');
    
    searchInput.value = '';
    tipoFilter.value = '';
    ubicacionFilter.value = '';
    fechaInicioFilter.value = '';
    fechaFinalFilter.value = '';
    
    // Ocultar preview de fotos si existe
    const photosPreview = document.getElementById('photosPreview');
    if (photosPreview) {
        photosPreview.style.display = 'none';
    }
    
    // Resetear variables globales
    currentPage = 1;
    allEntries = [];
    
    console.log('✅ Filtros limpiados, recargando...');
    
    // Esperar para asegurar que los inputs se limpien
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Cargar entradas con paginación normal
    // loadBitacoraEntries ya llama a filterAndDisplayEntries automáticamente
    await loadBitacoraEntries(1, false);
    
    console.log('🔍 allEntries:', allEntries.length);
    console.log('🔍 Filtros actuales:', {
        search: searchInput.value,
        tipo: tipoFilter.value,
        ubicacion: ubicacionFilter.value
    });
});

// Event listener para cargar más entradas
document.getElementById('loadMoreBtn')?.addEventListener('click', loadMoreEntries);

// Infinite scroll con throttling
let scrollTimeout;
function handleScroll() {
    if (scrollTimeout) return;
    
    scrollTimeout = setTimeout(() => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = document.documentElement.clientHeight;
        
        // Cargar más cuando falten 200px para el final
        if (scrollTop + clientHeight >= scrollHeight - 200) {
            loadMoreEntries();
        }
        
        scrollTimeout = null;
    }, 100);
}

window.addEventListener('scroll', handleScroll, { passive: true });

// Sistema de notificaciones
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10001;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        max-width: 400px;
        word-wrap: break-word;
    `;
    
    if (type === 'success') {
        notification.style.background = 'linear-gradient(135deg, #27ae60, #229954)';
    } else if (type === 'error') {
        notification.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
    } else if (type === 'warning') {
        notification.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
    } else if (type === 'info') {
        notification.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

// Sistema de notificaciones en tiempo real
async function initializeRealtimeNotifications() {
    console.log('📡 Inicializando sistema de notificaciones en tiempo real...');
    console.log('📡 Usuario actual ID:', currentUser?.id);

    try {
        // Suscribirse a nuevas entradas
        const entriesChannel = supabaseClient
            .channel('new-entries')
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'bitacora'
                },
                (payload) => {
                    console.log('📡 Recibido evento INSERT en bitacora:', payload);
                    handleNewEntryNotification(payload);
                }
            )
            .subscribe((status) => {
                console.log('📡 Estado de suscripción entriesChannel:', status);
            });

        // Suscribirse a nuevos comentarios
        const commentsChannel = supabaseClient
            .channel('new-comments-global')
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'comentarios'
                },
                (payload) => {
                    console.log('📡 Recibido evento INSERT en comentarios:', payload);
                    handleNewCommentNotification(payload);
                }
            )
            .subscribe((status) => {
                console.log('📡 Estado de suscripción commentsChannel:', status);
            });

        notificationChannel = { entriesChannel, commentsChannel };
        console.log('✅ Sistema de notificaciones activado');

        // Configurar event listeners del dropdown
        setupNotificationUI();

    } catch (error) {
        console.error('❌ Error inicializando notificaciones:', error);
    }
}

// Manejar notificación de nueva entrada
async function handleNewEntryNotification(payload) {
    const newEntry = payload.new;

    // No notificar si es del usuario actual
    if (newEntry.user_id === currentUser?.id) return;

    // Obtener info del usuario que creó la entrada
    const userInfo = await getUserInfo(newEntry.user_id);

    const notification = {
        id: Date.now(),
        type: 'entry',
        title: 'Nueva entrada',
        message: newEntry.titulo || 'Sin título',
        user: userInfo.email,
        entryId: newEntry.id,
        time: new Date(),
        read: false
    };

    addNotification(notification);
    console.log('🔔 Nueva entrada:', newEntry.titulo);

    // Animar la campana
    const btn = document.getElementById('notificationBtn');
    console.log('🔔 Botón de notificaciones encontrado (entrada):', !!btn);

    if (btn) {
        btn.classList.add('has-notifications');
        setTimeout(() => btn.classList.remove('has-notifications'), 500);
    }

    // Mostrar toast
    showNotification(`🔔 ${notification.title}: ${notification.message}`, 'info', 3000);

    // Recargar entradas para mostrar la nueva
    try {
        await loadBitacoraEntries(currentPage, false);
        console.log('🔄 Entradas recargadas automáticamente');
    } catch (error) {
        console.error('❌ Error recargando entradas:', error);
    }
}

// Manejar notificación de nuevo comentario
async function handleNewCommentNotification(payload) {
    const newComment = payload.new;

    // No notificar si es del usuario actual
    if (newComment.user_id === currentUser?.id) return;

    // Obtener info del usuario que comentó
    const userInfo = await getUserInfo(newComment.user_id);

    const notification = {
        id: Date.now(),
        type: 'comment',
        title: 'Nuevo comentario',
        message: newComment.comentario?.substring(0, 50) + '...' || 'Comentario',
        user: userInfo.email,
        entryId: newComment.bitacora_id,
        time: new Date(),
        read: false
    };

    addNotification(notification);
    
    // Verificar si el modal de comentarios está abierto
    const commentsModal = document.getElementById('commentsModal');
    const isModalOpen = commentsModal && commentsModal.style.display !== 'none';
    
    console.log('📝 Nuevo comentario recibido:', {
        commentId: newComment.id,
        bitacoraId: newComment.bitacora_id,
        currentBitacoraId: currentBitacoraId,
        isModalOpen: isModalOpen,
        isMatching: currentBitacoraId === newComment.bitacora_id
    });
    
    // Recargar comentarios si el modal está abierto y coincide el ID
    if (isModalOpen && currentBitacoraId && newComment.bitacora_id === currentBitacoraId) {
        try {
            await loadComments(currentBitacoraId);
            console.log('🔄 Comentarios recargados automáticamente en modal');
        } catch (error) {
            console.error('❌ Error recargando comentarios:', error);
        }
    } else {
        // Si el modal no está abierto, actualizar contador en la lista de entradas
        await updateCommentCount(newComment.bitacora_id);
    }
    
    // Animar la campana
    const btn = document.getElementById('notificationBtn');
    console.log('🔔 Botón de notificaciones encontrado:', !!btn, {
        hasClass: btn ? btn.classList.contains('has-notifications') : 'N/A',
        innerHTML: btn ? btn.innerHTML : 'N/A',
        display: btn ? btn.style.display : 'N/A'
    });
    
    if (btn) {
        btn.classList.add('has-notifications');
        setTimeout(() => btn.classList.remove('has-notifications'), 500);
        console.log('✅ Clase has-notifications agregada al botón');
    } else {
        console.error('❌ No se encontró el botón de notificaciones');
    }
    
    // Mostrar toast
    showNotification(`🔔 ${notification.title}: ${notification.message}`, 'info', 3000);
}

// Agregar notificación a la lista
function addNotification(notification) {
    notifications.unshift(notification);
    unreadNotificationCount++;

    console.log('🔔 addNotification llamado:', { notification, unreadNotificationCount, notificationsLength: notifications.length });

    // Actualizar contador en UI
    updateNotificationUI();

    // Limitar a 50 notificaciones
    if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
    }
}

// Actualizar contador de comentarios en una entrada específica
async function updateCommentCount(bitacoraId) {
    try {
        // Buscar la entrada en allEntries
        const entryIndex = allEntries.findIndex(e => e.id === bitacoraId);
        if (entryIndex === -1) {
            console.log('⚠️ Entrada no encontrada en allEntries:', bitacoraId);
            return;
        }
        
        // Obtener nuevo conteo de comentarios
        const newCount = await countComments(bitacoraId);
        
        // Actualizar en allEntries
        allEntries[entryIndex].commentCount = newCount;
        allEntries[entryIndex].isCommentsRead = false;
        
        // Actualizar el DOM
        const entryElements = document.querySelectorAll(`[data-entry-id="${bitacoraId}"]`);
        console.log('🔍 Elementos encontrados para actualizar:', {
            bitacoraId,
            elementCount: entryElements.length,
            elements: Array.from(entryElements).map(el => ({
                className: el.className,
                innerHTML: el.innerHTML.substring(0, 200)
            }))
        });
        
        entryElements.forEach(element => {
            // Buscar el contador de comentarios en el elemento
            const countSpan = element.querySelector('.comment-count');
            console.log('🔍 CountSpan encontrado:', {
                exists: !!countSpan,
                currentText: countSpan ? countSpan.textContent : 'N/A'
            });
            
            if (countSpan) {
                countSpan.textContent = newCount;
                // Quitar clase de leído si existe
                const commentsBtn = element.querySelector('.comments-btn, .mobile-action-btn.comments-btn');
                if (commentsBtn) {
                    commentsBtn.classList.remove('comments-read');
                    console.log('✅ Clase comments-read removida del botón');
                }
            } else {
                console.log('⚠️ No se encontró .comment-count en el elemento');
            }
        });
        
        console.log('🔄 Contador de comentarios actualizado:', { bitacoraId, newCount });
    } catch (error) {
        console.error('❌ Error actualizando contador de comentarios:', error);
    }
}

// Agregar notificación a la lista (versión original)
function addNotificationOriginal(notification) {
    notifications.unshift(notification);
    unreadNotificationCount++;

    updateNotificationUI();

    // Animar la campana
    const btn = document.getElementById('notificationBtn');
    if (btn) {
        btn.classList.add('has-notifications');
        setTimeout(() => btn.classList.remove('has-notifications'), 500);
    }

    // Mostrar toast
    showNotification(`🔔 ${notification.title}: ${notification.message}`, 'info', 3000);
}

// Actualizar UI de notificaciones
function updateNotificationUI() {
    const countElement = document.getElementById('notificationCount');
    const listElement = document.getElementById('notificationList');

    console.log('🔔 updateNotificationUI llamado:', { unreadNotificationCount, countElement: !!countElement, currentDisplay: countElement?.style.display, currentText: countElement?.textContent });

    // Actualizar contador
    if (countElement) {
        countElement.textContent = unreadNotificationCount > 99 ? '99+' : unreadNotificationCount;

        if (unreadNotificationCount > 0) {
            countElement.classList.add('visible');
            countElement.classList.remove('hidden');
            console.log('✅ Contador actualizado y mostrado:', countElement.textContent);
        } else {
            countElement.classList.remove('visible');
            countElement.classList.add('hidden');
            console.log('ℹ️ Contador oculto (0 notificaciones)');
        }
    } else {
        console.error('❌ No se encontró el elemento notificationCount');
    }

    // Actualizar lista
    if (listElement) {
        if (notifications.length === 0) {
            listElement.innerHTML = '<p class="no-notifications">No hay notificaciones nuevas</p>';
        } else {
            listElement.innerHTML = notifications.map(notif => `
                <div class="notification-item ${notif.read ? '' : 'unread'}"
                     onclick="handleNotificationClick(${notif.id}, ${notif.entryId})">
                    <span class="notification-icon">${notif.type === 'entry' ? '📋' : '💬'}</span>
                    <div class="notification-content">
                        <div class="notification-title">${notif.title}</div>
                        <div class="notification-message">${notif.message}</div>
                        <div class="notification-time">${notif.user} · ${formatTimeAgo(notif.time)}</div>
                    </div>
                </div>
            `).join('');
        }
    }
}

// Formatear tiempo relativo
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);

    if (seconds < 60) return 'Ahora mismo';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
    return `Hace ${Math.floor(seconds / 86400)} días`;
}

// Manejar clic en notificación
function handleNotificationClick(notificationId, entryId) {
    // Marcar como leída
    const notif = notifications.find(n => n.id === notificationId);
    if (notif && !notif.read) {
        notif.read = true;
        unreadNotificationCount = Math.max(0, unreadNotificationCount - 1);
    }

    // Cerrar dropdown
    document.getElementById('notificationDropdown').style.display = 'none';

    // Abrir modal de comentarios de esa entrada
    if (entryId) {
        openCommentsModal(entryId);
    }

    updateNotificationUI();
}

// Marcar todas como leídas
function markAllNotificationsAsRead() {
    notifications.forEach(n => n.read = true);
    unreadNotificationCount = 0;
    updateNotificationUI();
    showNotification('✅ Todas las notificaciones marcadas como leídas', 'success', 2000);
}

// Configurar UI de notificaciones
function setupNotificationUI() {
    const btn = document.getElementById('notificationBtn');
    const dropdown = document.getElementById('notificationDropdown');
    const markAllBtn = document.getElementById('markAllRead');
    const countElement = document.getElementById('notificationCount');

    console.log('🔔 setupNotificationUI llamado:', { btn: !!btn, dropdown: !!dropdown, markAllBtn: !!markAllBtn, countElement: !!countElement });

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            markAllNotificationsAsRead();
        });
    }

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (dropdown && !dropdown.contains(e.target) && e.target !== btn) {
            dropdown.style.display = 'none';
        }
    });
}

// Exponer funciones globalmente
window.handleNotificationClick = handleNotificationClick;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;

// Obtener información de usuario
async function getUserInfo(userId) {
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('email, rol')
            .eq('id', userId)
            .single();
            
        if (error || !data) {
            return { email: 'Usuario desconocido', rol: 'desconocido' };
        }
        
        return data;
    } catch (error) {
        return { email: 'Usuario desconocido', rol: 'desconocido' };
    }
}

// Actualizar entrada en la lista sin recargar todo
function updateEntryInList(updatedEntry) {
    // Buscar y actualizar la entrada en el DOM
    const entryElements = document.querySelectorAll(`[data-entry-id="${updatedEntry.id}"]`);
    
    entryElements.forEach(element => {
        // Actualizar contenido según el tipo de vista (móvil/desktop)
        if (element.classList.contains('mobile-entry-card')) {
            // Actualizar card móvil
            updateMobileCard(element, updatedEntry);
        } else if (element.closest('tr')) {
            // Actualizar fila de tabla desktop
            updateDesktopRow(element.closest('tr'), updatedEntry);
        }
    });
}

// Actualizar card móvil
function updateMobileCard(cardElement, entry) {
    const titleElement = cardElement.querySelector('.mobile-entry-content');
    const stateElement = cardElement.querySelector('.entry-state');
    
    if (titleElement) {
        titleElement.textContent = entry.titulo;
    }
    

    
    // Agregar animación de actualización
    cardElement.style.animation = 'highlightUpdate 1s ease';
    setTimeout(() => {
        cardElement.style.animation = '';
    }, 1000);
}

// Actualizar fila desktop
function updateDesktopRow(rowElement, entry) {
    const cells = rowElement.querySelectorAll('td');
    
        // Actualizar celdas relevantes
        if (cells[2]) cells[2].textContent = entry.titulo; // Título
        if (cells[4]) cells[4].textContent = entry.hora_inicio || '-'; // Hora inicio
        if (cells[5]) cells[5].textContent = entry.hora_final || '-'; // Hora final
    
    // Agregar animación de actualización
    rowElement.style.animation = 'highlightUpdate 1s ease';
    setTimeout(() => {
        rowElement.style.animation = '';
    }, 1000);
}

// Remover entrada de la lista
function removeEntryFromList(entryId) {
    const entryElements = document.querySelectorAll(`[data-entry-id="${entryId}"]`);
    
    entryElements.forEach(element => {
        element.style.animation = 'slideOutRemove 0.5s ease';
        setTimeout(() => {
            element.remove();
            updateEntriesCounter(allEntries.filter(e => e.id !== entryId));
        }, 500);
    });
}

// Actualizar badge de notificaciones
function updateNotificationBadge() {
    // Aquí podrías implementar un contador de notificaciones no leídas
    // Por ahora, solo mostramos un indicador visual
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.style.display = 'block';
        badge.style.animation = 'pulse 2s infinite';
    }
}

// Limpiar notificaciones en tiempo real
function cleanupRealtimeNotifications() {
    if (notificationSubscription && supabaseClient) {
        supabaseClient.removeChannel(notificationSubscription);
        notificationSubscription = null;
        console.log('🔌 Sistema de notificaciones desactivado');
    }
}

// Animaciones CSS para notificaciones y actualizaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
    
    @keyframes highlightUpdate {
        0% {
            background-color: #fff3cd;
            transform: scale(1.02);
        }
        50% {
            background-color: #ffeaa7;
            transform: scale(1.01);
        }
        100% {
            background-color: transparent;
            transform: scale(1);
        }
    }
    
    @keyframes slideOutRemove {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50px);
        }
    }
    
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10001;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        max-width: 400px;
        word-wrap: break-word;
    }
    
    .notification strong {
        font-weight: 700;
    }
    
    .notification-success {
        background: linear-gradient(135deg, #27ae60, #229954);
    }
    
    .notification-error {
        background: linear-gradient(135deg, #e74c3c, #c0392b);
    }
    
    .notification-warning {
        background: linear-gradient(135deg, #f39c12, #e67e22);
    }
    
    .notification-info {
        background: linear-gradient(135deg, #667eea, #764ba2);
    }
`;
document.head.appendChild(style);



// Función para generar folio consecutivo
async function generarFolioConsecutivo(resetear = false) {
    try {
        if (resetear) {
            // Reiniciar foliado - solo para desarrollo/despliegue
            // console.log('🔄 Reiniciando foliado desde 0001');
            return '0001';
        }

        const currentlyOnline = navigator.onLine;

        if (currentlyOnline) {
            try {
                // Obtener el último folio registrado desde Supabase
                const { data, error } = await supabaseClient
                    .from('bitacora')
                    .select('folio')
                    .not('folio', 'is', null)
                    .order('folio', { ascending: false })
                    .limit(1)
                    .single();

                if (!error && data && data.folio) {
                    // Convertir folio a número, incrementar y formatear
                    const ultimoNumero = parseInt(data.folio) + 1;
                    const nuevoFolio = String(ultimoNumero).padStart(4, '0');
                    console.log('🔢 Nuevo folio generado (online):', nuevoFolio);
                    return nuevoFolio;
                }
            } catch (onlineError) {
                console.warn('⚠️ Error obteniendo folio online, intentando offline:', onlineError);
            }
        }

        // Offline o fallback: buscar en IndexedDB
        try {
            const allEntries = await dbManager.getAllEntries();
            const folios = allEntries
                .map(entry => entry.folio)
                .filter(folio => folio && !isNaN(parseInt(folio)))
                .map(folio => parseInt(folio))
                .sort((a, b) => b - a);

            if (folios.length > 0) {
                const ultimoNumero = folios[0] + 1;
                const nuevoFolio = String(ultimoNumero).padStart(4, '0');
                console.log('🔢 Nuevo folio generado (offline):', nuevoFolio);
                return nuevoFolio;
            }
        } catch (dbError) {
            console.warn('⚠️ Error obteniendo folio de IndexedDB:', dbError);
        }

        // Último fallback
        const nuevoFolio = String(Date.now()).slice(-4); // Usar últimos 4 dígitos del timestamp
        console.log('🔢 Nuevo folio generado (fallback):', nuevoFolio);
        return nuevoFolio;

    } catch (error) {
        console.error('Error en generarFolioConsecutivo:', error);
        // Último fallback absoluto
        return String(Date.now()).slice(-4);
    }
}

// ===== SISTEMA DE COMENTARIOS =====

let currentBitacoraId = null;
let commentsSubscription = null;

// Marcar comentarios como leídos en la base de datos
async function markCommentsAsReadInDB(bitacoraId) {
    try {
        if (!currentUser || !currentUser.id) {
            console.log('⚠️ No hay usuario actual, no se puede marcar como leído');
            return;
        }

        // Verificar si ya existe un registro de lectura
        const { data: existing } = await supabaseClient
            .from('bitacora_read')
            .select('id')
            .eq('bitacora_id', bitacoraId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (!existing) {
            // Insertar nuevo registro de lectura
            const { error } = await supabaseClient
                .from('bitacora_read')
                .insert({
                    bitacora_id: bitacoraId,
                    user_id: currentUser.id,
                    read_at: new Date().toISOString()
                });

            if (error) {
                console.warn('⚠️ Error marcando como leído:', error.message);
            } else {
                console.log('✅ Entrada marcada como leída en BD');
            }
        }

        // Marcar visualmente
        markCommentsAsReadVisual(bitacoraId);

    } catch (error) {
        console.error('Error marcando como leídos:', error);
        markCommentsAsReadVisual(bitacoraId);
    }
}

// Marcar comentarios como leídos visualmente
function markCommentsAsReadVisual(bitacoraId) {
    const buttons = document.querySelectorAll(`.comments-btn[onclick*="${bitacoraId}"]`);
    buttons.forEach(btn => {
        btn.classList.add('comments-read');
    });
}

// Actualizar contador de comentarios visualmente
async function updateCommentCountVisual(bitacoraId) {
    const buttons = document.querySelectorAll(`.comments-btn[onclick*="${bitacoraId}"]`);
    
    // Obtener el nuevo conteo de comentarios
    const { count } = await supabaseClient
        .from('comentarios')
        .select('*', { count: 'exact', head: true })
        .eq('bitacora_id', bitacoraId);
    
    buttons.forEach(btn => {
        const countElement = btn.querySelector('.comment-count');
        if (countElement && count !== null) {
            countElement.textContent = count;
        }
    });
}

// Abrir modal de comentarios
async function openCommentsModal(entryId) {
    try {
        console.log('🔍 Abriendo modal de comentarios para entrada:', entryId);
        
        // Marcar comentarios como leídos (en la base de datos)
        await markCommentsAsReadInDB(entryId);
        
        // Abrir modal - aplicar estilos exactos de desktop
        const modal = document.getElementById('commentsModal');
        modal.style.display = 'flex';
        modal.dataset.entryId = entryId;
        
        // Aplicar estilos desktop en línea para evitar overrides móviles
        modal.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0, 0, 0, 0.7) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 10000 !important;
            animation: fadeIn 0.3s ease !important;
            backdrop-filter: blur(5px) !important;
            padding: 1rem !important;
        `;
        
        // Estilos exactos del contenido del modal
        const modalContent = modal.querySelector('.comments-modal-content');
        if (modalContent) {
            modalContent.style.cssText = `
                background: white !important;
                border-radius: 16px !important;
                padding: 0 !important;
                max-width: 1000px !important;
                width: 90% !important;
                max-height: 900px !important;
                height: 90% !important;
                overflow-y: auto !important;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
                border: 1px solid rgba(255, 255, 255, 0.9) !important;
                position: relative !important;
            `;
        }
        
        // Estilos del header
        const modalHeader = modal.querySelector('.comments-modal-header');
        if (modalHeader) {
            modalHeader.style.cssText = `
                padding: 1.5rem !important;
                border-bottom: 1px solid #e9ecef !important;
                border-radius: 16px 16px 0 0 !important;
                background: white !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
            `;
        }
        
        // Estilos del body
        const modalBody = modal.querySelector('.comments-modal-body');
        if (modalBody) {
            modalBody.style.cssText = `
                padding: 1.5rem !important;
                max-height: 60vh !important;
                overflow-y: auto !important;
            `;
        }
        
        // Asegurar que el campo principal de comentarios sea visible
        const newComment = document.getElementById('newComment');
        if (newComment) {
            newComment.style.display = 'block';
        }
        
        // Cargar comentarios
        await loadComments(entryId);
        
        // FORZAR ESTILOS DE IMÁGENES INMEDIATAMENTE DESPUÉS DE CARGAR
        setTimeout(() => {
            forceCommentImageStyles();
        }, 200);
        
        // Suscribirse a cambios en tiempo real de comentarios
        subscribeToComments(entryId);
        
        // No hacer scroll automático - solo mostrar los comentarios
        
    } catch (error) {
        console.error('Error abriendo modal de comentarios:', error);
        showNotification('❌ Error al abrir los comentarios', 'error');
    }
}

// Cerrar modal de comentarios
function closeCommentsModal() {
    const modal = document.getElementById('commentsModal');
    modal.style.display = 'none';
    
    // Limpiar suscripción
    if (commentsSubscription && supabaseClient) {
        supabaseClient.removeChannel(commentsSubscription);
        commentsSubscription = null;
    }
    
    currentBitacoraId = null;
}

// Cargar comentarios de una entrada (versión simplificada)
async function loadComments(bitacoraId) {
    console.log('🔍 Cargando comentarios para bitácora ID:', bitacoraId);
    try {
        currentBitacoraId = bitacoraId;
        console.log('🔍 currentBitacoraId asignado:', currentBitacoraId);
        
        
        // Cargar todos los comentarios de esta bitácora con reintentos
        const { data: allComments, error: commentsError } = await retryWithBackoff(async () => {
            return await supabaseClient
                .from('comentarios')
                .select('*')
                .eq('bitacora_id', bitacoraId)
                .order('created_at', { ascending: true });
        }, 3);
        
        if (commentsError) {
            console.error('Error cargando comentarios:', commentsError);
            if (commentsError.status === 409) {
                showNotification('⚠️ Conflicto al cargar comentarios, por favor intenta de nuevo', 'warning');
            } else {
                showNotification('❌ Error al cargar los comentarios: ' + commentsError.message, 'error');
            }
            return;
        }
        

        
        // Si no hay comentarios, mostrar mensaje y salir
        if (!allComments || allComments.length === 0) {
            displayComments([]);
            return;
        }
        
        // Separar comentarios principales y respuestas
        const mainComments = allComments.filter(c => !c.parent_comment_id);
        const replies = allComments.filter(c => c.parent_comment_id);
        
        // Agrupar respuestas por comentario padre
        const repliesByParent = {};
        replies.forEach(reply => {
            if (!repliesByParent[reply.parent_comment_id]) {
                repliesByParent[reply.parent_comment_id] = [];
            }
            repliesByParent[reply.parent_comment_id].push(reply);
        });
        
        // Combinar comentarios con sus respuestas
        const commentsWithReplies = mainComments.map(comment => ({
            ...comment,
            replies: repliesByParent[comment.id] || []
        }));
        
        // Obtener todos los IDs de usuarios (comentarios y respuestas)
        const userIds = [...new Set(allComments.map(c => c.user_id))];
        
        // Obtener perfiles de todos los usuarios
        const { data: profiles, error: profilesError } = await supabaseClient
            .from('profiles')
            .select('id, email, rol')
            .in('id', userIds);
        
        if (profilesError) {
            console.error('Error cargando perfiles:', profilesError);
            // Mostrar comentarios sin perfiles si hay error
            const commentsWithoutProfiles = commentsWithReplies.map(comment => ({
                ...comment,
                profiles: null,
                replies: comment.replies.map(reply => ({ ...reply, profiles: null }))
            }));
            displayComments(commentsWithoutProfiles);
            return;
        }
        
        // Los archivos están guardados directamente en el campo archivos de cada comentario
        // No necesitamos consultar una tabla separada
        
        // Combinar comentarios y respuestas con sus perfiles y archivos
        const commentsWithProfiles = commentsWithReplies.map(comment => ({
            ...comment,
            profiles: profiles.find(p => p.id === comment.user_id) || null,
            archivos: comment.archivos || [],
            replies: comment.replies.map(reply => ({
                ...reply,
                profiles: profiles.find(p => p.id === reply.user_id) || null,
                archivos: reply.archivos || []
            }))
        }));
        displayComments(commentsWithProfiles);
    } catch (error) {
        console.error('Error cargando comentarios:', error);
        showNotification('❌ Error al cargar los comentarios', 'error');
    }
}

function displayComments(comments) {
    const commentsList = document.getElementById('commentsList');
    
    if (!comments || comments.length === 0) {
        commentsList.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No hay comentarios aún. ¡Sé el primero en comentar!</p>';
        return;
    }
    
    let commentsHtml = '';
    
    comments.forEach(comment => {
        
        const userEmail = comment.profiles?.email || 'Usuario desconocido';
        const userRole = comment.profiles?.rol || 'desconocido';
        const isOwnComment = comment.user_id === currentUser.id;
        const isAdmin = currentUser.role === 'admin';
        
        // Formatear fecha
        const commentDate = new Date(comment.created_at);
        const formattedDate = commentDate.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        commentsHtml += `
            <div class="comment-item" data-comment-id="${comment.id}">
                <div class="comment-header">
                    <div class="comment-user">
                        <strong>${userEmail}</strong>
                        <span class="comment-role">(${getRoleDisplayName(userRole)})</span>
                    </div>
                    <div class="comment-meta">
                        <span class="comment-date">${formattedDate}</span>
                        ${(isOwnComment || isAdmin) ? `
                            <div class="comment-actions">
                                ${isOwnComment ? `<button class="comment-edit-btn" onclick="editComment(${comment.id})">✏️</button>` : ''}
                                ${(isOwnComment || isAdmin) ? `<button class="comment-delete-btn" onclick="deleteComment(${comment.id})">🗑️</button>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="comment-content" id="comment-content-${comment.id}">
                    ${comment.comentario}
                </div>
                
                <!-- Mostrar archivos adjuntos del comentario -->
                ${comment.archivos && comment.archivos.length > 0 ? `
                    <div class="comment-files-list">
                        <div class="comment-files-header">
                            📎 ${comment.archivos.length} ${comment.archivos.length === 1 ? 'archivo adjunto' : 'archivos adjuntos'}:
                        </div>
                        <div class="comment-files-grid">
                            ${comment.archivos.map(file => {
                                const isImage = file.type && file.type.startsWith('image/');
                                const icon = getFileIcon(file.name || 'archivo');
                                
                                return `
                                    <div class="comment-file-item" onclick="downloadCommentFile('${file.url}', '${file.name || 'archivo'}')">
                                        ${isImage ? 
                                            `<img src="${file.url}" alt="${file.name || 'imagen'}" class="comment-file-thumbnail" />` :
                                            `<div class="comment-file-icon-large">${icon}</div>`
                                        }
                                        <div class="comment-file-info">
                                            <div class="comment-file-name-display">${file.name || 'Sin nombre'}</div>
                                            <div class="comment-file-size-display">${formatFileSize(file.size || 0)}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
                <div class="comment-actions-row">
                    <button class="comment-reply-btn" onclick="replyToComment(${comment.id}, '${btoa(userEmail)}')">
                        💬 Responder
                    </button>
                </div>
                <div id="reply-section-${comment.id}" class="reply-section" style="display: none;">
                    <div class="reply-input-container">
                        <textarea id="reply-textarea-${comment.id}" 
                                  class="reply-textarea" 
                                  placeholder="Escribe tu respuesta aquí..." 
                                  rows="3"></textarea>
                        
                        <!-- Sección de archivos para respuestas -->
                        <div class="comment-files-section">
                            <div class="comment-files-label-small">
                                📎 Adjuntar archivos:
                            </div>
                            <input type="file" id="reply-files-${comment.id}" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx">
                            <div id="reply-files-preview-${comment.id}" class="comment-files-preview-small" style="display: none;">
                                <div id="reply-files-preview-grid-${comment.id}" class="comment-files-preview-grid"></div>
                            </div>
                        </div>
                        
                        <div class="reply-buttons">
                            <button class="reply-send-btn" onclick="submitReply(${comment.id})">
                                💬 Enviar Respuesta
                            </button>
                            <button class="reply-cancel-btn" onclick="cancelReply(${comment.id})">
                                ❌ Cancelar
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Mostrar respuestas -->
                ${comment.replies && comment.replies.length > 0 ? `
                    <div class="replies-section">
                        <div class="replies-header">
                            <strong>${comment.replies.length} ${comment.replies.length === 1 ? 'respuesta' : 'respuestas'}</strong>
                        </div>
                        ${comment.replies.map(reply => {
                            const replyUserEmail = reply.profiles?.email || 'Usuario desconocido';
                            const replyUserRole = reply.profiles?.rol || 'desconocido';
                            const isOwnReply = reply.user_id === currentUser.id;
                            const isAdminReply = currentUser.role === 'admin';
                            
                            const replyDate = new Date(reply.created_at);
                            const formattedReplyDate = replyDate.toLocaleString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            
                            return `
                                <div class="comment-item reply-item" data-comment-id="${reply.id}">
                                    <div class="comment-header">
                                        <div class="comment-user">
                                            <strong>${replyUserEmail}</strong>
                                            <span class="comment-role">(${getRoleDisplayName(replyUserRole)})</span>
                                        </div>
                                        <div class="comment-meta">
                                            <span class="comment-date">${formattedReplyDate}</span>
                                            ${(isOwnReply || isAdminReply) ? `
                                                <div class="comment-actions">
                                                    ${isOwnReply ? `<button class="comment-edit-btn" onclick="editComment(${reply.id})">✏️</button>` : ''}
                                                    ${(isOwnReply || isAdminReply) ? `<button class="comment-delete-btn" onclick="deleteComment(${reply.id})">🗑️</button>` : ''}
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                        <div class="comment-content" id="comment-content-${reply.id}">
                                            ${reply.comentario}
                                        </div>
                                        
                                        <!-- Mostrar archivos adjuntos de la respuesta -->
                                        ${reply.archivos && reply.archivos.length > 0 ? `
                                            <div class="comment-files-list-small">
                                                <div class="comment-files-header-small">
                                                    📎 ${reply.archivos.length} ${reply.archivos.length === 1 ? 'archivo' : 'archivos'}:
                                                </div>
                                                <div class="comment-files-grid-small">
                                                    ${reply.archivos.map(file => {
                                                        const isImage = file.type && file.type.startsWith('image/');
                                                        const icon = getFileIcon(file.name);
                                                        
                                                        return `
                                                            <div class="comment-file-item-small" onclick="downloadCommentFile('${file.url}', '${file.name}')">
                                                                ${isImage ? 
                                                                    `<img src="${file.url}" alt="${file.name}" class="comment-file-thumbnail-small" />` :
                                                                    `<div class="comment-file-icon-small">${icon}</div>`
                                                                }
                                                                <div class="comment-file-info-small">
                                                                    <div class="comment-file-name-display-small">${file.name}</div>
                                                                    <div class="comment-file-size-display-small">${formatFileSize(file.size)}</div>
                                                                </div>
                                                            </div>
                                                        `;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    commentsList.innerHTML = commentsHtml;
    
    // FORZAR ESTILOS DE IMÁGENES DESPUÉS DE CARGAR
    setTimeout(() => {
        forceCommentImageStyles();
        // Aplicar estilos directamente a las imágenes recién cargadas
        const newlyAddedImages = document.querySelectorAll('.comment-file-thumbnail');
        newlyAddedImages.forEach(img => {
            if (img && img.src) {
                const isMobile = window.innerWidth <= 480;
                const isTablet = window.innerWidth <= 768 && window.innerWidth > 480;
                
                if (isMobile) {
                    img.style.cssText = 'width: 40px !important; height: 40px !important; max-width: 40px !important; max-height: 40px !important; min-width: 40px !important; min-height: 40px !important; object-fit: cover !important; border: 2px solid #667eea !important; border-radius: 4px !important; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important; background: white !important; padding: 1px !important; box-sizing: border-box !important; display: inline-block !important; vertical-align: middle !important;';
                } else if (isTablet) {
                    img.style.cssText = 'width: 50px !important; height: 50px !important; max-width: 50px !important; max-height: 50px !important; min-width: 50px !important; min-height: 50px !important; object-fit: cover !important; border: 2px solid #667eea !important; border-radius: 6px !important; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2) !important; background: white !important; padding: 2px !important; box-sizing: border-box !important; display: inline-block !important; vertical-align: middle !important;';
                } else {
                    img.style.cssText = 'width: 60px !important; height: 60px !important; max-width: 60px !important; max-height: 60px !important; min-width: 60px !important; min-height: 60px !important; object-fit: cover !important; border: 2px solid #667eea !important; border-radius: 8px !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important; background: white !important; padding: 2px !important; box-sizing: border-box !important; display: inline-block !important; vertical-align: middle !important;';
                }
            }
        });
    }, 100);
    
    // Scroll al final de la lista de comentarios
    commentsList.scrollTop = commentsList.scrollHeight;
    
    // Aplicar estilos a imágenes cuando carguen
    setTimeout(() => {
        const images = document.querySelectorAll('.comment-file-thumbnail');
        images.forEach(img => {
            if (img && img.src && !img.hasAttribute('data-styles-applied')) {
                img.setAttribute('data-styles-applied', 'true');
                img.onload = function() {
                    forceCommentImageStyles();
                };
                // Si la imagen ya está cargada, aplicar estilos inmediatamente
                if (img.complete) {
                    forceCommentImageStyles();
                }
            }
        });
    }, 50);
}


// Mostrar vista previa de archivos para comentarios
function displayCommentFilesPreview(files) {
    const previewContainer = document.getElementById('commentFilesPreview');
    const previewGrid = document.getElementById('commentFilesPreviewGrid');
    
    if (!previewContainer || !previewGrid) return;
    
    let previewHtml = '';
    Array.from(files).forEach(file => {
        const isImage = file.type.startsWith('image/');
        const icon = getFileIcon(file.name);
        
        previewHtml += `
            <div class="comment-file-preview-item">
                ${isImage ? 
                    `<img src="${URL.createObjectURL(file)}" alt="${file.name}" />` :
                    `<div class="comment-file-icon">${icon}</div>`
                }
                <div class="comment-file-name">${file.name}</div>
                <div class="comment-file-size">${formatFileSize(file.size)}</div>
            </div>
        `;
    });
    
    previewGrid.innerHTML = previewHtml;
    previewContainer.style.display = 'block';
}

// Ocultar vista previa de archivos para comentarios
function hideCommentFilesPreview() {
    const previewContainer = document.getElementById('commentFilesPreview');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
}

// Manejar selección de archivos para RESPUESTAS de comentarios
function handleReplyFilesChange(e, commentId) {
    const files = e.target.files;
    console.log('🔍 Archivos de respuesta seleccionados:', files);
    
    if (files.length > 0) {
        displayReplyFilesPreview(files, commentId);
    } else {
        hideReplyFilesPreview(commentId);
    }
}

// Mostrar vista previa de archivos para RESPUESTAS
function displayReplyFilesPreview(files, commentId) {
    const previewContainer = document.getElementById(`reply-files-preview-${commentId}`);
    const previewGrid = document.getElementById(`reply-files-preview-grid-${commentId}`);
    
    if (!previewContainer || !previewGrid) return;
    
    let previewHtml = '';
    Array.from(files).forEach(file => {
        const isImage = file.type.startsWith('image/');
        const icon = getFileIcon(file.name);
        
        previewHtml += `
            <div class="comment-file-preview-item">
                ${isImage ? 
                    `<img src="${URL.createObjectURL(file)}" alt="${file.name}" />` :
                    `<div class="comment-file-icon">${icon}</div>`
                }
                <div class="comment-file-name">${file.name}</div>
                <div class="comment-file-size">${formatFileSize(file.size)}</div>
            </div>
        `;
    });
    
    previewGrid.innerHTML = previewHtml;
    previewContainer.style.display = 'block';
}

// Ocultar vista previa de archivos para RESPUESTAS
function hideReplyFilesPreview(commentId) {
    const previewContainer = document.getElementById(`reply-files-preview-${commentId}`);
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
}

// Subir archivos al almacenamiento
async function uploadCommentFiles(files, commentId) {
    if (!files || files.length === 0) return [];
    
    if (!files || files.length === 0) {
        console.log('🔍 No hay archivos para subir');
        return [];
    }
    
    const uploadedFiles = [];
    
    for (const file of files) {
        try {
            // Validar tipo de archivo
            const validTypes = [
                'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
                'application/pdf', 
                'application/msword', 
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel', 
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint', 
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/zip',
                'application/x-rar-compressed',
                'application/x-7z-compressed',
                'application/x-tar',
                'application/gzip',
                'application/octet-stream' // Para archivos DWG, DXF y otros archivos binarios
            ];
            
            // Validar por MIME type y extensión de archivo
            const fileExtension = file.name.split('.').pop().toLowerCase();
            const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'tar', 'gz', 'dwg', 'dxf', 'dwf'];
            
            if (!validTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
                console.error('Tipo de archivo no permitido en comentario:', file.type, 'Extensión:', fileExtension);
                alert(`El archivo "${file.name}" no es un tipo permitido en comentarios. Tipos permitidos: imágenes (JPG, PNG, GIF), PDF, Word, Excel, PowerPoint, ZIP, RAR, 7Z, TAR, AutoCAD`);
                continue;
            }
            
            
            const uploadData = await uploadFileToR2(file);
            
            uploadedFiles.push({
                name: file.name,
                size: file.size,
                type: file.type,
                url: uploadData.url
            });
            
        } catch (error) {
            console.error('Error procesando archivo:', error);
        }
    }
    
    return uploadedFiles;
}

// Enviar nuevo comentario con archivos
async function submitComment() {
    if (!supabaseClient) {
        showNotification('❌ Comentarios no disponibles en modo offline', 'error');
        return;
    }

    const commentText = document.getElementById('newComment').value.trim();

    console.log('🔍 Enviando comentario:', commentText);
    console.log('🔍 Bitácora ID:', currentBitacoraId);
    console.log('🔍 Usuario ID:', currentUser.id);
    console.log('🔍 Archivos:', commentFiles);
    console.log('🔍 Textarea encontrado:', !!document.getElementById('newComment'));

    if (!commentText) {
        showNotification('❌ Por favor escribe un comentario', 'error');
        return;
    }
    
    if (!currentBitacoraId) {
        showNotification('❌ Error: No se ha seleccionado una entrada', 'error');
        return;
    }
    
    try {
        // Primero subir los archivos
        const uploadedFiles = await uploadCommentFiles(commentFiles, null);
        
        // Luego insertar el comentario con los archivos
        const commentData = {
            bitacora_id: currentBitacoraId,
            user_id: currentUser.id,
            comentario: commentText,
            archivos: uploadedFiles
        };
        
        const { data, error } = await supabaseClient
            .from('comentarios')
            .insert(commentData)
            .select()
            .single();
        
        if (error) {
            console.error('Error guardando comentario:', error);
            showNotification('❌ Error al guardar el comentario: ' + error.message, 'error');
            return;
        }
        
        // Limpiar textarea y archivos
        document.getElementById('newComment').value = '';
        document.getElementById('commentFiles').value = '';
        commentFiles = [];
        hideMainCommentFilesPreview();

        // Marcar como "no leído" para OTROS usuarios (no el actual)
        await supabaseClient.rpc('mark_unread_for_others', {
            bitacora_id_param: currentBitacoraId,
            current_user_id: currentUser.id
        });

        // Mostrar notificación
        showNotification('✅ Comentario enviado exitosamente', 'success');

        // Actualizar contador de comentarios visualmente
        await updateCommentCountVisual(currentBitacoraId);

        // Cargar comentarios manualmente (además del tiempo real)
        await loadComments(currentBitacoraId);
        
    } catch (error) {
        console.error('Error inesperado guardando comentario:', error);
        showNotification('❌ Error al guardar el comentario', 'error');
    }
}

// Editar comentario
async function editComment(commentId) {
    const commentContent = document.getElementById(`comment-content-${commentId}`);
    const currentText = commentContent.textContent.trim();
    
    // Crear textarea para editar
    const textarea = document.createElement('textarea');
    textarea.value = currentText;
    textarea.className = 'comment-edit-textarea';
    textarea.rows = 3;
    
    // Crear botones de acción
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'comment-edit-actions';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'comment-save-btn';
    saveBtn.textContent = '💾 Guardar';
    saveBtn.onclick = () => saveComment(commentId);
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'comment-cancel-btn';
    cancelBtn.textContent = '❌ Cancelar';
    cancelBtn.onclick = () => cancelEditComment(commentId);
    
    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(cancelBtn);
    
    // Reemplazar contenido con textarea y acciones
    commentContent.innerHTML = '';
    commentContent.appendChild(textarea);
    commentContent.appendChild(actionsDiv);
    
    // Enfocar textarea
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

// Guardar comentario editado
async function saveComment(commentId) {
    console.log('🔍 Guardando comentario ID:', commentId);
    
    const commentContent = document.getElementById(`comment-content-${commentId}`);
    const textarea = commentContent.querySelector('textarea');
    const newText = textarea.value.trim();
    
    console.log('🔍 Nuevo texto:', newText);
    
    if (!newText) {
        showNotification('❌ El comentario no puede estar vacío', 'error');
        return;
    }
    
    try {
        console.log('🔍 Enviando UPDATE a Supabase');
        
        const { data, error } = await supabaseClient
            .from('comentarios')
            .update({ comentario: newText })
            .eq('id', commentId)
            .select()
            .single();
        
        console.log('🔍 Respuesta UPDATE:', { data, error });
        
        if (error) {
            console.error('Error actualizando comentario:', error);
            showNotification('❌ Error al actualizar el comentario: ' + error.message, 'error');
            return;
        }
        
        showNotification('✅ Comentario actualizado exitosamente', 'success');
        
        // Cargar comentarios manualmente para actualizar inmediatamente
        await loadComments(currentBitacoraId);
        
    } catch (error) {
        console.error('Error inesperado actualizando comentario:', error);
        showNotification('❌ Error al actualizar el comentario', 'error');
    }
}

// Cancelar edición de comentario
function cancelEditComment(commentId) {
    // Recargar comentarios para restaurar el estado original
    loadComments(currentBitacoraId);
}

// ===== SISTEMA DE RESPUESTAS A COMENTARIOS =====

// Responder a un comentario
function replyToComment(commentId, encodedAuthorName) {
    const authorName = atob(encodedAuthorName);
    console.log('🔍 Respondiendo al comentario:', commentId, 'de:', authorName);
    
    // Prevenir que el evento se propague
    event.stopPropagation();
    
    const replySection = document.getElementById(`reply-section-${commentId}`);
    const replyTextarea = document.getElementById(`reply-textarea-${commentId}`);
    
    console.log('🔍 Buscando reply-section:', `reply-section-${commentId}`);
    console.log('🔍 ReplySection encontrado:', replySection);
    console.log('🔍 ReplyTextarea encontrado:', replyTextarea);
    
    if (!replySection || !replyTextarea) {
        console.error('❌ No se encontraron los elementos de respuesta');
        return;
    }
    
    // Ocultar otras secciones de respuesta
    document.querySelectorAll('.reply-section').forEach(section => {
        if (section.id !== `reply-section-${commentId}`) {
            section.style.display = 'none';
        }
    });
    
    // Ocultar temporalmente el campo principal de comentarios SOLO mientras se responde
    const newComment = document.getElementById('newComment');
    if (newComment) {
        newComment.style.display = 'none';
    }
    
    // Mostrar la sección de respuesta
    replySection.style.display = 'block';
    
    // Configurar el event listener para los archivos de esta respuesta
    const replyFilesInput = document.getElementById(`reply-files-${commentId}`);
    if (replyFilesInput) {
        // Remover listener anterior si existe
        replyFilesInput.removeEventListener('change', handleReplyFilesChange);
        // Añadir nuevo listener con el ID correcto
        replyFilesInput.addEventListener('change', (e) => handleReplyFilesChange(e, commentId));
    }
    
    // Prepend al textarea el nombre del autor
    replyTextarea.value = `@${authorName} `;
    
    // Forzar el foco y scroll al textarea de respuesta
    setTimeout(() => {
        replyTextarea.focus();
        replyTextarea.setSelectionRange(replyTextarea.value.length, replyTextarea.value.length);
        replyTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

// Enviar respuesta
async function submitReply(parentCommentId) {
    if (!supabaseClient) {
        showNotification('❌ Respuestas no disponibles en modo offline', 'error');
        return;
    }

    const replyTextarea = document.getElementById(`reply-textarea-${parentCommentId}`);
    const replyText = replyTextarea.value.trim();
    const filesInput = document.getElementById(`reply-files-${parentCommentId}`);
    const files = filesInput ? filesInput.files : [];
    
    if (!replyText) {
        showNotification('❌ Por favor escribe una respuesta', 'error');
        return;
    }
    
    if (!currentBitacoraId) {
        showNotification('❌ Error: No se ha seleccionado una entrada', 'error');
        return;
    }
    
    console.log('🔍 Enviando respuesta:', { 
        parentCommentId, 
        replyText, 
        files: Array.from(files),
        currentBitacoraId,
        userId: currentUser.id 
    });
    
    try {
        // Primero subir los archivos
        const uploadedFiles = await uploadCommentFiles(Array.from(files), parentCommentId);
        
        // Primero intentar guardar como respuesta (con parent_comment_id)
        let commentData = {
            bitacora_id: currentBitacoraId,
            user_id: currentUser.id,
            comentario: replyText,
            parent_comment_id: parentCommentId,
            archivos: uploadedFiles
        };
        
        console.log('🔍 Datos a insertar (respuesta):', commentData);
        
        let { data, error } = await supabaseClient
            .from('comentarios')
            .insert(commentData)
            .select()
            .single();
        
        // Si falla por la columna parent_comment_id, guardar como comentario normal
        if (error && error.message.includes('column') && error.message.includes('parent_comment_id')) {
            console.log('🔍 La columna parent_comment_id no existe, guardando como comentario normal');
            
            commentData = {
                bitacora_id: currentBitacoraId,
                user_id: currentUser.id,
                comentario: `↳ ${replyText}`,  // Prefijo para indicar que es respuesta
                archivos: uploadedFiles
            };
            
            console.log('🔍 Datos a insertar (comentario normal):', commentData);
            
            const result = await supabaseClient
                .from('comentarios')
                .insert(commentData)
                .select()
                .single();
            
            data = result.data;
            error = result.error;
        }
        
        console.log('🔍 Respuesta INSERT final:', { data, error });
        
        console.log('📧 ========== ANTES DE VERIFICAR ERROR ==========');
        console.log('📧 error existe:', !!error);
        if (error) {
            console.log('📧 error.message:', error.message);
        }

        if (error) {
            console.error('Error guardando:', error);
            alert('Error al guardar: ' + error.message);
        } else {
            console.log('📧 ========== NO HAY ERROR, ENTRANDO A SECCIÓN DE EMAILS ==========');
            // Enviar notificaciones por email a todos los usuarios (solo para nuevas entradas online)
            console.log('📧 ========== LLEGANDO A LA SECCIÓN DE EMAILS ==========');
            console.log('📧 ========== VERIFICANDO CONDICIONES PARA EMAILS ==========');
            console.log('📧 editId:', editId, 'typeof editId:', typeof editId);
            console.log('📧 data:', data, 'data.length:', data?.length);
            console.log('📧 data[0]:', data?.[0]);
            console.log('📧 isOnline:', isOnline);
            console.log('📧 navigator.onLine:', navigator.onLine);
            console.log('📧 offlineMode:', offlineMode);

            const condition1 = !editId;
            const condition2 = data && data[0];
            const condition3 = isOnline;

            console.log('📧 Condición 1 (!editId):', condition1);
            console.log('📧 Condición 2 (data && data[0]):', condition2);
            console.log('📧 Condición 3 (isOnline):', condition3);
            console.log('📧 TODAS las condiciones:', condition1 && condition2 && condition3);

            console.log('📧 ========== EVALUANDO CONDICIONES ==========');
            console.log('📧 if (!editId && data && data[0] && isOnline) {');
            console.log('📧   !editId =', !editId);
            console.log('📧   data =', !!data);
            console.log('📧   data[0] =', !!data?.[0]);
            console.log('📧   isOnline =', isOnline);
            console.log('📧   RESULTADO =', !editId && data && data[0] && isOnline);

            if (!editId && data && data[0] && isOnline) {
                console.log('📧 ✅ CONDICIONES CUMPLIDAS - ENVIANDO NOTIFICACIONES...');
                try {
                    await enviarNotificacionesEmailATodos(data[0]);
                    console.log('📧 ✅ Notificaciones por email enviadas exitosamente');
                } catch (emailError) {
                    console.error('❌ Error enviando emails:', emailError);
                    // No fallar el guardado si hay error en emails
                }
            } else {
                console.log('📧 ❌ CONDICIONES NO CUMPLIDAS - NO SE ENVIAN EMAILS');
                console.log('📧 Razón del fallo:');
                if (editId) console.log('  - Es una edición (editId existe)');
                if (!data) console.log('  - No hay datos');
                if (!data?.[0]) console.log('  - data[0] no existe');
                if (!isOnline) console.log('  - No está online');
            }

            console.log('📧 ========== FIN DE LA SECCIÓN DE EMAILS ==========');
        }
        
        // Limpiar y ocultar sección de respuesta
        replyTextarea.value = '';
        filesInput.value = '';
        document.getElementById(`reply-section-${parentCommentId}`).style.display = 'none';
        
        // Ocultar vista previa de archivos si existe
        const filesPreview = document.getElementById(`reply-files-preview-${parentCommentId}`);
        if (filesPreview) {
            filesPreview.style.display = 'none';
        }

        // Marcar como "no leído" para OTROS usuarios (no el actual)
        await supabaseClient.rpc('mark_unread_for_others', {
            bitacora_id_param: currentBitacoraId,
            current_user_id: currentUser.id
        });

        // Mostrar notificación
        showNotification('✅ Respuesta enviada exitosamente', 'success');

        // Cargar comentarios manualmente para actualizar inmediatamente
        await loadComments(currentBitacoraId);
        
    } catch (error) {
        console.error('Error inesperado guardando respuesta:', error);
        showNotification('❌ Error al guardar la respuesta', 'error');
    }
}

// Cancelar respuesta
function cancelReply(commentId) {
    document.getElementById(`reply-section-${commentId}`).style.display = 'none';
    document.getElementById(`reply-textarea-${commentId}`).value = '';
}

// FORZAR ESTILOS DE IMÁGENES EN COMENTARIOS - VERSIÓN FINAL
function forceCommentImageStyles() {
    // Buscar todas las imágenes posibles en comentarios
    const thumbnailImages = document.querySelectorAll('.comment-file-thumbnail');
    const listImages = document.querySelectorAll('.comment-files-list img');
    const itemImages = document.querySelectorAll('.comment-file-item img');
    const allImages = document.querySelectorAll('#commentsList img');
    const modalImages = document.querySelectorAll('.comments-modal img');
    
    // Unir todas las imágenes encontradas y eliminar duplicados
    const allFoundImages = [...thumbnailImages, ...listImages, ...itemImages, ...allImages, ...modalImages];
    const uniqueImages = [...new Set(allFoundImages)];
    
    uniqueImages.forEach((img, index) => {
        const isMobile = window.innerWidth <= 480;
        const isTablet = window.innerWidth <= 768 && window.innerWidth > 480;
        
        if (isMobile) {
            // Móvil: 40px - Diseño compacto
            img.style.width = '40px';
            img.style.height = '40px';
            img.style.maxWidth = '40px';
            img.style.maxHeight = '40px';
            img.style.minWidth = '40px';
            img.style.minHeight = '40px';
            img.style.border = '1px solid #e9ecef';
            img.style.borderRadius = '4px';
            img.style.objectFit = 'cover';
            img.style.padding = '1px';
            img.style.background = 'white';
            img.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        } else if (isTablet) {
            // Tablet: 50px - Tamaño mediano
            img.style.width = '50px';
            img.style.height = '50px';
            img.style.maxWidth = '50px';
            img.style.maxHeight = '50px';
            img.style.minWidth = '50px';
            img.style.minHeight = '50px';
            img.style.border = '2px solid #667eea';
            img.style.borderRadius = '6px';
            img.style.objectFit = 'cover';
            img.style.padding = '2px';
            img.style.background = 'white';
            img.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
        } else {
            // Desktop: 60px - Tamaño estándar
            img.style.width = '60px';
            img.style.height = '60px';
            img.style.maxWidth = '60px';
            img.style.maxHeight = '60px';
            img.style.minWidth = '60px';
            img.style.minHeight = '60px';
            img.style.border = '1px solid #e9ecef';
            img.style.borderRadius = '8px';
            img.style.objectFit = 'cover';
            img.style.padding = '1px';
            img.style.background = 'white';
            img.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.2)';
        }
        
        // Estilos comunes para todas las versiones
        img.style.boxSizing = 'border-box';
        img.style.display = 'inline-block';
        img.style.verticalAlign = 'middle';
        img.style.cursor = 'pointer';
        img.style.transition = 'all 0.3s ease';
    });
}

// Descargar archivo de comentario
function downloadCommentFile(url, fileName) {
    console.log('🔍 Descargando archivo:', { url, fileName });
    
    // Crear un enlace temporal
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    
    // Simular clic para descargar
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`📥 Descargando ${fileName}...`, 'info');
}

// Event listener para atajos de teclado en respuestas
document.addEventListener('DOMContentLoaded', function() {
    // Para respuestas con Ctrl+Enter
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const replyTextarea = e.target;
            if (replyTextarea && replyTextarea.id && replyTextarea.id.startsWith('reply-textarea-')) {
                const commentId = replyTextarea.id.replace('reply-textarea-', '');
                submitReply(parseInt(commentId));
            }
        }
    });
});

// Eliminar comentario
async function deleteComment(commentId) {
    console.log('🔍 Eliminando comentario ID:', commentId);
    
    if (!confirm('⚠️ ¿Estás seguro de que quieres eliminar este comentario?\n\nEsta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        console.log('🔍 Enviando DELETE a Supabase');
        
        const { data, error } = await supabaseClient
            .from('comentarios')
            .delete()
            .eq('id', commentId)
            .select()
            .single();
        
        console.log('🔍 Respuesta DELETE:', { data, error });
        
        if (error) {
            console.error('Error eliminando comentario:', error);
            showNotification('❌ Error al eliminar el comentario: ' + error.message, 'error');
            return;
        }
        
        showNotification('✅ Comentario eliminado exitosamente', 'success');
        
        // Cargar comentarios manualmente para actualizar inmediatamente
        await loadComments(currentBitacoraId);
        
    } catch (error) {
        console.error('Error inesperado eliminando comentario:', error);
        showNotification('❌ Error al eliminar el comentario', 'error');
    }
}

// Suscribirse a cambios en tiempo real de comentarios
function subscribeToComments(bitacoraId) {
    if (!supabaseClient) {
        console.log('⚠️ Supabase no disponible - comentarios en tiempo real desactivados');
        return;
    }

    if (commentsSubscription) {
        supabaseClient.removeChannel(commentsSubscription);
    }

    commentsSubscription = supabaseClient
        .channel(`comentarios_${bitacoraId}`)
        .on('postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'comentarios',
                filter: `bitacora_id=eq.${bitacoraId}`
            },
            handleRealtimeComment
        )
        .subscribe();
}

// Manejar cambios en tiempo real de comentarios
async function handleRealtimeComment(payload) {
    const { eventType, new: newRecord } = payload;
    
    try {
        // Evitar actualizaciones si no hay un modal abierto
        if (!document.getElementById('commentsModal') || 
            document.getElementById('commentsModal').style.display === 'none') {
            return;
        }
        
        // Usar debounce para evitar múltiples llamadas rápidas
        if (window.realtimeTimeout) {
            clearTimeout(window.realtimeTimeout);
        }
        
        window.realtimeTimeout = setTimeout(async () => {
            if (eventType === 'INSERT') {
                // Nuevo comentario agregado
                showNotification('💬 Nuevo comentario agregado', 'info', 2000);
                await loadComments(currentBitacoraId);
            } else if (eventType === 'UPDATE') {
                // Comentario actualizado
                showNotification('✏️ Comentario actualizado', 'info', 2000);
                await loadComments(currentBitacoraId);
            } else if (eventType === 'DELETE') {
                // Comentario eliminado
                showNotification('🗑️ Comentario eliminado', 'info', 2000);
                await loadComments(currentBitacoraId);
            }
        }, 500); // Esperar 500ms antes de procesar
        
    } catch (error) {
        console.error('❌ Error en handleRealtimeComment:', error);
        // No mostrar error al usuario para no ser molesto
    }
}

// Event listener para enviar comentario con Enter
document.addEventListener('DOMContentLoaded', function() {
    const newCommentTextarea = document.getElementById('newComment');
    if (newCommentTextarea) {
        newCommentTextarea.addEventListener('keydown', function(e) {
            // Enviar con Ctrl+Enter o Cmd+Enter
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                submitComment();
            }
        });
    }
    
    // Event listener para archivos de comentarios principales
    const commentFilesInput = document.getElementById('commentFiles');
    if (commentFilesInput) {
        commentFilesInput.addEventListener('change', handleCommentFilesChange);
    }
});

// Manejar selección de archivos para comentarios PRINCIPALES
function handleCommentFilesChange(e) {
        const files = e.target.files;
    
    if (files.length > 0) {
        // Guardar archivos en la variable global
        commentFiles = Array.from(files);
        displayMainCommentFilesPreview(files);
    } else {
        commentFiles = [];
        hideMainCommentFilesPreview();
    }
}

// Mostrar vista previa de archivos para comentarios PRINCIPALES
function displayMainCommentFilesPreview(files) {
    const previewContainer = document.getElementById('commentFilesPreview');
    const previewGrid = document.getElementById('commentFilesPreviewGrid');
    
    if (!previewContainer || !previewGrid) {
        console.error('❌ No se encontraron los elementos de preview principal');
        return;
    }
    
    console.log('🔍 Mostrando preview de archivos principales:', files.length);
    
    let previewHtml = '';
    Array.from(files).forEach(file => {
        const isImage = file.type.startsWith('image/');
        const icon = getFileIcon(file.name);
        
        previewHtml += `
            <div class="comment-file-preview-item">
                ${isImage ? 
                    `<img src="${URL.createObjectURL(file)}" alt="${file.name}" />` :
                    `<div class="comment-file-icon">${icon}</div>`
                }
                <div class="comment-file-name">${file.name}</div>
                <div class="comment-file-size">${formatFileSize(file.size)}</div>
            </div>
        `;
    });
    
    previewGrid.innerHTML = previewHtml;
    previewContainer.style.display = 'block';
    
    // Forzar estilos de miniaturas después de generar el HTML
    setTimeout(() => {
        forceCommentImageStyles();
    }, 100);
}

// Ocultar vista previa de archivos para comentarios PRINCIPALES
function hideMainCommentFilesPreview() {
    const previewContainer = document.getElementById('commentFilesPreview');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
}

// Función para formatear fechas con zona horaria local
function formatearFechaLocal(fechaString) {
    if (!fechaString) return 'Fecha no disponible';
    
    // console.log('🔍 Fecha original recibida:', fechaString);
    // console.log('🔍 Tipo de dato:', typeof fechaString);
    
    const fecha = new Date(fechaString);
    if (isNaN(fecha.getTime())) {
        // console.log('❌ Fecha inválida al crear Date');
        return 'Fecha inválida';
    }
    
    // console.log('✅ Date object creado:', fecha);
    // console.log('✅ Hora del Date:', fecha.getHours(), ':', fecha.getMinutes());
    
    const zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fechaFormateada = fecha.toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: zonaHoraria
    });
    
    const resultado = fechaFormateada;
    // console.log('🎯 Fecha formateada final:', resultado);
    
    return resultado;
}

// Función para cargar TODAS las entradas filtradas de la base de datos
async function loadAllFilteredEntries() {
    try {
        // Obtener filtros aplicados
        const searchTerm = document.getElementById('searchInput').value.trim();
        const tipoFilter = document.getElementById('tipoFilter').value;
        const ubicacionFilter = document.getElementById('ubicacionFilter').value;
        const fechaInicioFilter = document.getElementById('fechaInicioFilter').value;
        const fechaFinalFilter = document.getElementById('fechaFinalFilter').value;
        
        // Construir consulta base (solo campos necesarios para reducir tamaño de respuesta)
        let query = supabaseClient
            .from('bitacora')
            .select('id, fecha, fecha_hora, titulo, descripcion, tipo_nota, ubicacion, user_id, folio, hora_inicio, hora_final, archivos', { count: 'exact' })
            .limit(5000)
            .order('fecha', { ascending: false });
        
        // Aplicar filtros como en filterAndDisplayEntries
        if (searchTerm) {
            // Para búsqueda en múltiples campos, usamos un enfoque de texto completo
            // Nota: Supabase tiene limitaciones con OR complejos, así que traemos todo y filtramos en JavaScript
        }
        
        if (tipoFilter) {
            query = query.eq('tipo_nota', tipoFilter);
        }
        
        if (ubicacionFilter) {
            query = query.eq('ubicacion', ubicacionFilter);
        }
        
        if (fechaInicioFilter) {
            const inicio = new Date(fechaInicioFilter + 'T00:00:00').toISOString();
            query = query.gte('fecha', inicio);
        }
        
        if (fechaFinalFilter) {
            const fin = new Date(fechaFinalFilter + 'T23:59:59').toISOString();
            query = query.lte('fecha', fin);
        }
        
        // Cargar TODAS las entradas sin límite de paginación
        let allData, queryError, count;
        try {
            const result = await query;
            allData = result.data;
            queryError = result.error;
            count = result.count;
        } catch (e) {
            console.error('Error en consulta Supabase:', e, e.stack);
            showNotification('❌ Error al consultar base de datos: ' + (e.message || e), 'error');
            return [];
        }
        
        if (queryError) {
            console.error('Error cargando todas las entradas para PDF:', queryError);
            showNotification('❌ Error cargando datos para el PDF', 'error');
            return [];
        }
        
        let filteredEntries = allData || [];
        
        // Cargar emails de usuarios para las entradas
        if (filteredEntries.length > 0) {
            const userIds = [...new Set(filteredEntries.map(entry => entry.user_id).filter(id => id))];
            
            if (userIds.length > 0) {
                try {
                    const { data: profiles, error: profilesError } = await supabaseClient
                        .from('profiles')
                        .select('id, email')
                        .in('id', userIds);
                    
                    if (!profilesError && profiles) {
                        const userEmails = {};
                        profiles.forEach(profile => {
                            if (profile.email) {
                                userEmails[profile.id] = profile.email;
                            }
                        });
                        
                        // Asignar emails a las entradas
                        filteredEntries.forEach(entry => {
                            if (userEmails[entry.user_id]) {
                                entry.profiles = { email: userEmails[entry.user_id] };
                            }
                        });
                    }
                } catch (e) {
                    console.warn('No se pudieron cargar perfiles de usuarios:', e.message);
                }
            }
        }
        
        // Aplicar filtro de búsqueda por texto si es necesario
        if (searchTerm) {
            filteredEntries = filteredEntries.filter(entry => {
                const searchFields = [
                    entry.titulo,
                    entry.descripcion,
                    entry.tipo_nota,
                    entry.ubicacion,
                    entry.hora_inicio,
                    entry.hora_final,
                    entry.folio,
                    entry.profiles?.email,
                    entry.user_id
                ].map(field => field?.toLowerCase() || '');
                
                return searchFields.some(field => field.includes(searchTerm.toLowerCase()));
            });
        }
        
        console.log(`📊 Cargadas ${filteredEntries.length} entradas para PDF de un total de ${count || 0}`);
        
        return filteredEntries;
        
    } catch (error) {
        console.error('Error en loadAllFilteredEntries:', error);
        showNotification('❌ Error cargando datos para el PDF', 'error');
        return [];
    }
}

// Función para generar PDF grande por lotes
async function generateLargePDF(entries, filtersText) {
    showNotification(`📄 Generando PDF para ${entries.length} entradas...`, 'info');
    
    const batchSize = 100;
    const batches = Math.ceil(entries.length / batchSize);
    const pdf = new jspdf.jsPDF('l', 'mm', 'a4');
    
    for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, entries.length);
        const batch = entries.slice(start, end);
        
        showNotification(`📄 Procesando lote ${i + 1}/${batches} (${batch.length} entradas)...`, 'info');
        
        // Generar contenido del lote
        const batchHtml = generateBatchHTML(batch, start + 1, filtersText);
        
        // Crear una página por lote
        if (i > 0) {
            pdf.addPage();
        }
        
        try {
            // Usar html2canvas con opciones optimizadas
            const canvas = await html2canvas(batchHtml, {
                scale: 0.8,
                useCORS: true,
                allowTaint: true,
                logging: false,
                windowWidth: 1200,
                windowHeight: 800
            });
            
            if (canvas && canvas.width > 0 && canvas.height > 0) {
                const imgData = canvas.toDataURL('image/jpeg', 0.7);
                if (imgData && imgData.startsWith('data:image/')) {
                    pdf.addImage(imgData, 'JPEG', 10, 10, 277, 190);
                } else {
                    console.warn('Imagen de lote inválida generada');
                }
            } else {
                console.warn('Canvas inválido generado para lote:', i + 1);
            }
            
        } catch (error) {
            console.error('Error en lote', i + 1, ':', error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const fileName = `bitacora_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
    
    showNotification(`✅ PDF generado con ${entries.length} entradas`, 'success');
}

// Función para generar HTML de un lote
function generateBatchHTML(entries, startNumber, filtersText) {
    const headerHtml = filtersText ? `
        <div style="margin-bottom: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 12px; border-radius: 12px; width: 100%; box-sizing: border-box; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; color: #ffffff; font-size: 18px; font-weight: bold; margin-bottom: 8px;">
                📋 BITÁCORA DE OBRA
            </div>
            <div style="text-align: center; color: #f8f9fa; font-size: 11px; margin-bottom: 4px;">
                👤 ${currentUser?.email || 'Usuario desconocido'} | 📊 ${entries.length} entradas
            </div>
            <div style="text-align: center; color: #e8eaf6; font-size: 9px; margin-bottom: 4px;">
                🔍 ${filtersText}
            </div>
            <div style="text-align: center; color: #c5cae9; font-size: 8px;">
                🕐 ${new Date().toLocaleString('es-CO')}
            </div>
        </div>
    ` : '';
    
    function formatDate(fechaUsar) {
        if (!fechaUsar) return '';
        if (fechaUsar.includes('T')) {
            const [datePart, timePart] = fechaUsar.split('T');
            const [year, month, day] = datePart.split('-');
            const [hours, minutes] = timePart.split(':');
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        } else {
            const [year, month, day] = fechaUsar.split('-');
            return `${day}/${month}/${year}`;
        }
    }
    
    const html = `
        <div style="font-family: Arial, Helvetica, sans-serif; padding: 20px; background: white; width: 1160px;">
            ${headerHtml}
            <div style="margin-bottom: 10px; width: 100%; box-sizing: border-box;">
                <table style="width: 100%; border-collapse: collapse; font-size: 7px; table-layout: fixed; background-color: white;">
                    <thead>
                        <tr style="background: #2e7d32; color: white; height: 18px;">
                            <th style="border: 1px solid #1b5e20; padding: 2px; text-align: center; width: 4%; font-weight: bold;">Folio</th>
                            <th style="border: 1px solid #1b5e20; padding: 2px; text-align: center; width: 8%; font-weight: bold;">Fecha y Hora</th>
                            <th style="border: 1px solid #1b5e20; padding: 2px; text-align: center; width: 15%; font-weight: bold;">Título</th>
                            <th style="border: 1px solid #1b5e20; padding: 2px; text-align: center; width: 35%; font-weight: bold;">Descripción</th>
                            <th style="border: 1px solid #1b5e20; padding: 2px; text-align: center; width: 5%; font-weight: bold;">Tipo</th>
                            <th style="border: 1px solid #1b5e20; padding: 2px; text-align: center; width: 10%; font-weight: bold;">Ubicación</th>
                            <th style="border: 1px solid #1b5e20; padding: 2px; text-align: center; width: 10%; font-weight: bold;">Usuario</th>
                            <th style="border: 1px solid #1b5e20; padding: 2px; text-align: center; width: 13%; font-weight: bold;">Comentarios</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
                            try {
                                return entries.map((entry, index) => {
                                    const userEmail = entry.profiles?.email || entry.user_id || 'Usuario desconocido';
                                    
                                    // Formatear comentarios completos con autor y fecha
                                    let comentariosTexto = 'Sin comentarios';
                                    if (entry.comments && entry.comments.length > 0) {
                                        try {
                                            comentariosTexto = entry.comments.map((comment, ci) => {
                                                const commentDate = new Date(comment.created_at).toLocaleString('es-CO', {
                                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
                                                });
                                                const author = comment.profiles?.email || 'Usuario';
                                                return `${ci + 1}. [${commentDate}] ${author}: ${comment.comentario}`;
                                            }).join(' | ');
                                            if (comentariosTexto.length > 50000) {
                                                comentariosTexto = comentariosTexto.substring(0, 50000) + '...';
                                            }
                                        } catch (e) {
                                            console.warn('Error formateando comentarios:', e);
                                            comentariosTexto = '[Error al cargar comentarios]';
                                        }
                                    }
                                    
                                    const rowColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
                                    const fechaFormateada = formatDate(entry.fecha_hora || entry.fecha);
                                    const titulo = entry.titulo || '';
                                    const descripcion = entry.descripcion || '';
                                    const ubicacion = entry.ubicacion || '';
                                    
                                    return `
                                    <tr style="font-size: 7px; background-color: ${rowColor};">
                                        <td style="border: 1px solid #bbdefb; padding: 2px; text-align: center; word-wrap: break-word; font-weight: bold; color: #000000; vertical-align: top;">${entry.folio || startNumber + index}</td>
                                        <td style="border: 1px solid #bbdefb; padding: 2px; text-align: center; word-wrap: break-word; color: #000000; vertical-align: top;">${fechaFormateada}</td>
                                        <td style="border: 1px solid #bbdefb; padding: 2px; text-align: left; word-wrap: break-word; color: #000000; font-weight: bold; vertical-align: top;">${titulo}</td>
                                        <td style="border: 1px solid #bbdefb; padding: 3px; text-align: justify; word-wrap: break-word; color: #000000; vertical-align: top; line-height: 1.2; background-color: #e3f2fd;">${descripcion}</td>
                                        <td style="border: 1px solid #bbdefb; padding: 2px; text-align: center; word-wrap: break-word; color: #000000; vertical-align: top;">${entry.tipo_nota || '-'}</td>
                                        <td style="border: 1px solid #bbdefb; padding: 2px; text-align: left; word-wrap: break-word; color: #000000; vertical-align: top;">${ubicacion}</td>
                                        <td style="border: 1px solid #bbdefb; padding: 2px; text-align: left; word-wrap: break-word; color: #000000; vertical-align: top; font-size: 6px;">${userEmail}</td>
                                        <td style="border: 1px solid #bbdefb; padding: 3px; text-align: left; word-wrap: break-word; color: #000000; vertical-align: top; font-size: 6px; line-height: 1.1;">${comentariosTexto}</td>
                                    </tr>
                                    `;
                                }).join('');
                            } catch (e) {
                                console.error('Error al generar filas del PDF:', e);
                                return '<tr><td colspan="8" style="color: red; padding: 10px;">Error al generar contenido</td></tr>';
                            }
                        })()}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    const container = document.createElement('div');
    container.innerHTML = html;
    return container.firstElementChild;
}

// Función para descargar PDF
async function downloadPDF() {
    console.log('[PDF Debug] 1. Click en Descargar PDF detectado.');
    
    // Función auxiliar para escapar caracteres HTML peligrosos y evitar que rompan la tabla
    const escapeHTML = (str) => {
        if (str === null || str === undefined) return '';
        return str
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    // Iniciando descarga de reporte detallado
    // Verificar que las librerías necesarias estén cargadas
    if (typeof window.jspdf === 'undefined' || typeof html2canvas === 'undefined' || !window.jspdf.jsPDF) {
        console.error('[PDF Debug] Error: Librerías jsPDF o html2canvas no están cargadas en el entorno.');
        showNotification('❌ Error: Las librerías para generar PDF no están disponibles', 'error');
        return;
    }
    
    // Verificar que al menos un filtro esté aplicado
    const searchTerm = document.getElementById('searchInput').value.trim();
    const tipoFilter = document.getElementById('tipoFilter').value;
    const ubicacionFilter = document.getElementById('ubicacionFilter').value;
    const fechaInicioFilter = document.getElementById('fechaInicioFilter').value;
    const fechaFinalFilter = document.getElementById('fechaFinalFilter').value;
    
    console.log('[PDF Debug] 2. Filtros leídos:', { searchTerm, tipoFilter, ubicacionFilter, fechaInicioFilter, fechaFinalFilter });

    if (!searchTerm && !tipoFilter && !ubicacionFilter && !fechaInicioFilter && !fechaFinalFilter) {
        console.warn('[PDF Debug] Advertencia: Intento de descarga sin aplicar ningún filtro.');
        showNotification('⚠️ Para descargar el PDF, debes aplicar al menos un filtro de búsqueda, tipo de nota, ubicación o rango de fechas', 'warning');
        return;
    }
    
    try {
        // Mostrar indicador de carga
        showNotification('📄 Iniciando generación de PDF... cargando entradas', 'info');
        
        // Obtener TODAS las entradas filtradas de la base de datos
        console.log('[PDF Debug] 3. Solicitando entradas filtradas a loadAllFilteredEntries...');
        let filteredEntries;
        try {
            filteredEntries = await loadAllFilteredEntries();
            console.log(`[PDF Debug] 4. Entradas cargadas con éxito. Total: ${filteredEntries ? filteredEntries.length : 0} registros.`);
        } catch (e) {
            console.error('[PDF Debug] Error en loadAllFilteredEntries:', e, e.stack);
            showNotification('❌ Error cargando datos de bitácora: ' + (e.message || e), 'error');
            return;
        }
        
        // Re-aplicar filtros de tipo y ubicación en JavaScript como respaldo
        if (filteredEntries && filteredEntries.length > 0) {
            console.log('[PDF Debug] Re-aplicando filtros JS - tipoFilter:', tipoFilter, 'ubicacionFilter:', ubicacionFilter);
            if (tipoFilter) {
                const before = filteredEntries.length;
                filteredEntries = filteredEntries.filter(entry => entry.tipo_nota === tipoFilter);
                console.log(`[PDF Debug] Filtro tipo: ${before} → ${filteredEntries.length} entradas`);
            }
            if (ubicacionFilter) {
                const before = filteredEntries.length;
                filteredEntries = filteredEntries.filter(entry => entry.ubicacion === ubicacionFilter);
                console.log(`[PDF Debug] Filtro ubicación: ${before} → ${filteredEntries.length} entradas`);
            }
        }
        
        // Crear texto de filtros
        const filtersInfo = [];
        if (searchTerm) filtersInfo.push(`Búsqueda: "${searchTerm}"`);
        if (tipoFilter) filtersInfo.push(`Tipo: ${tipoFilter}`);
        if (ubicacionFilter) filtersInfo.push(`Ubicación: ${ubicacionFilter}`);
        if (fechaInicioFilter && fechaFinalFilter) {
            filtersInfo.push(`Rango: ${new Date(fechaInicioFilter).toLocaleDateString('es-ES')} - ${new Date(fechaFinalFilter).toLocaleDateString('es-ES')}`);
        } else if (fechaInicioFilter) {
            filtersInfo.push(`Desde: ${new Date(fechaInicioFilter).toLocaleDateString('es-ES')}`);
        } else if (fechaFinalFilter) {
            filtersInfo.push(`Hasta: ${new Date(fechaFinalFilter).toLocaleDateString('es-ES')}`);
        }
        const filtersText = filtersInfo.length > 0 ? filtersInfo.join(' | ') : 'Todos los registros';
        
        if (!filteredEntries || filteredEntries.length === 0) {
            console.warn('[PDF Debug] Advertencia: No hay registros que coincidan con los filtros.');
            showNotification('❌ No hay entradas para generar PDF con los filtros actuales', 'error');
            return;
        }
        
        // Generar PDF con jsPDF texto + html2canvas por fila (método que se ve bien)
        showNotification(`📄 Preparando PDF para ${filteredEntries.length} entradas...`, 'info');
        
        const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const marginTop = 15;
        const marginBottom = 15;
        const marginLeft = 10;
        const marginRight = 10;
        const usableWidth = pageWidth - marginLeft - marginRight;
        const usableHeight = pageHeight - marginTop - marginBottom;

        // Cargar perfiles de usuario al inicio para mapear emails rápidamente en memoria
        console.log('[PDF Debug] 5. Cargando perfiles de usuario de Supabase...');
        const profilesMap = {};
        try {
            const { data: allProfiles, error: profilesErr } = await supabaseClient
                .from('profiles')
                .select('id, email');
            if (profilesErr) {
                console.error('[PDF Debug] Error de Supabase al cargar perfiles:', profilesErr);
            }
            if (allProfiles) {
                allProfiles.forEach(p => {
                    if (p.id && p.email) {
                        profilesMap[p.id] = p.email;
                    }
                });
                console.log(`[PDF Debug] Perfiles mapeados con éxito: ${Object.keys(profilesMap).length} perfiles.`);
            }
        } catch (profileErr) {
            console.warn('[PDF Debug] No se pudieron cargar perfiles de usuario para comentarios:', profileErr);
        }

        // Cargar todos los comentarios de las entradas filtradas de una sola vez
        console.log('[PDF Debug] 6. Cargando todos los comentarios en lote...');
        const commentsByEntry = {};
        const entryIds = filteredEntries.map(e => e.id).filter(id => id);
        
        if (entryIds.length > 0) {
            try {
                const { data: allComments, error: commentsErr } = await supabaseClient
                    .from('comentarios')
                    .select('*')
                    .in('bitacora_id', entryIds)
                    .order('created_at', { ascending: true });
                
                if (commentsErr) {
                    console.error('[PDF Debug] Error de Supabase al cargar comentarios en lote:', commentsErr);
                }
                if (allComments) {
                    allComments.forEach(c => {
                        if (!commentsByEntry[c.bitacora_id]) {
                            commentsByEntry[c.bitacora_id] = [];
                        }
                        commentsByEntry[c.bitacora_id].push(c);
                    });
                    console.log(`[PDF Debug] Comentarios cargados y mapeados con éxito en memoria.`);
                }
            } catch (commentsQueryErr) {
                console.warn('[PDF Debug] Error de consulta al cargar todos los comentarios del lote:', commentsQueryErr);
            }
        }

        // Estilos y anchos de columnas (Ajustados según solicitud)
        const colWidths = {
            folio: usableWidth * 0.04,
            fecha: usableWidth * 0.09,
            titulo: usableWidth * 0.12,
            desc: usableWidth * 0.50,
            tipo: usableWidth * 0.05,
            ubica: usableWidth * 0.07,
            usuario: usableWidth * 0.06,
            coment: usableWidth * 0.07
        };

        let currentY = marginTop;
        let currentPage = 1;

        // Función para dibujar el encabezado en cada página
        const drawHeader = (pageNum) => {
            const headerHeight = 25;
            // Fondo del encabezado
            pdf.setDrawColor(30, 58, 138);
            pdf.setFillColor(30, 58, 138);
            pdf.roundedRect(marginLeft, marginTop, usableWidth, headerHeight, 3, 3, 'F');
            
            // Texto del encabezado
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text('BITACORA DE OBRA', pageWidth / 2, marginTop + 10, { align: 'center' });
            
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Usuario: ${currentUser?.email || 'Admin'} | Total: ${filteredEntries.length} entradas`, marginLeft + 5, marginTop + 18);
            pdf.text(`Filtros: ${filtersText}`, marginLeft + 5, marginTop + 22);
            pdf.text(`Página ${pageNum}`, pageWidth - marginRight - 15, marginTop + 22);
            
            currentY = marginTop + headerHeight + 5;

            // Dibujar cabecera de tabla
            pdf.setFillColor(30, 64, 175);
            pdf.rect(marginLeft, currentY, usableWidth, 8, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(6);
            pdf.setFont('helvetica', 'bold');
            
            let x = marginLeft;
            pdf.text('Folio', x + colWidths.folio/2, currentY + 5, { align: 'center' }); x += colWidths.folio;
            pdf.text('Fecha', x + colWidths.fecha/2, currentY + 5, { align: 'center' }); x += colWidths.fecha;
            pdf.text('Título', x + colWidths.titulo/2, currentY + 5, { align: 'center' }); x += colWidths.titulo;
            pdf.text('Descripción', x + colWidths.desc/2, currentY + 5, { align: 'center' }); x += colWidths.desc;
            pdf.text('Tipo', x + colWidths.tipo/2, currentY + 5, { align: 'center' }); x += colWidths.tipo;
            pdf.text('Ubicación', x + colWidths.ubica/2, currentY + 5, { align: 'center' }); x += colWidths.ubica;
            pdf.text('Usuario', x + colWidths.usuario/2, currentY + 5, { align: 'center' }); x += colWidths.usuario;
            pdf.text('Comentarios', x + colWidths.coment/2, currentY + 5, { align: 'center' });
            
            currentY += 8;
        };

        drawHeader(currentPage);

        // Contenedor para renderizar filas individuales (Colocado fuera de la pantalla con opacidad completa para html2canvas)
        const rowMeasure = document.createElement('div');
        rowMeasure.style.cssText = `position: absolute; left: -9999px; top: -9999px; width: ${usableWidth}mm; font-family: Arial; font-size: 7px;`;
        document.body.appendChild(rowMeasure);

        console.log('[PDF Debug] 7. Procesando filas individualmente en bucle...');
        let processedCount = 0;

        for (const entry of filteredEntries) {
            processedCount++;
            console.log(`[PDF Debug] Procesando fila ${processedCount}/${filteredEntries.length} (Folio: ${entry.folio || '-'})...`);
            
            let fecha = '-';
            try {
                const rawFecha = entry.fecha_hora || entry.fecha;
                if (rawFecha) {
                    if (rawFecha.includes('T')) {
                        const parts = rawFecha.split('T');
                        const datePart = parts[0].split('-').reverse().join('/');
                        const timePart = parts[1].split(':');
                        const hours = timePart[0];
                        const minutes = timePart[1] || '00';
                        fecha = `${datePart} ${hours}:${minutes}`;
                    } else {
                        fecha = rawFecha.split('-').reverse().join('/');
                    }
                }
            } catch (fechaErr) {
                console.warn('[PDF Debug] Error al formatear fecha de entrada:', entry.id, fechaErr);
            }
            
            // Obtener comentarios de nuestro mapa en memoria
            let comentarios = 'Sin comentarios';
            const entryComments = commentsByEntry[entry.id];
            
            if (entryComments && entryComments.length > 0) {
                comentarios = entryComments.map(c => {
                    const authorEmail = profilesMap[c.user_id] || c.user_id || 'Usuario';
                    const author = escapeHTML(authorEmail);
                    const comentarioEscapado = escapeHTML(c.comentario || '');
                    return `• [${author}] ${comentarioEscapado}`;
                }).join('<br>');
                if (comentarios.length > 10000) comentarios = comentarios.substring(0, 10000) + '...';
            }
            
            const titulo = entry.titulo || '';
            const descripcion = entry.descripcion || '';
            const ubicacion = entry.ubicacion || '';
            const usuario = entry.profiles?.email || entry.user_id || 'Usuario desconocido';

            // HTML de la fila para medir con escapar de variables y tamaños de fuente unificados
            rowMeasure.innerHTML = `
                <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                    <tr>
                        <td style="width: 4%; border: 0.1pt solid #bfdbfe; padding: 2px; text-align: center; vertical-align: top; word-wrap: break-word; word-break: break-all;">${escapeHTML(entry.folio || '-')}</td>
                        <td style="width: 9%; border: 0.1pt solid #bfdbfe; padding: 2px; text-align: center; vertical-align: top; word-wrap: break-word; word-break: break-all;">${escapeHTML(fecha)}</td>
                        <td style="width: 12%; border: 0.1pt solid #bfdbfe; padding: 2px; font-weight: bold; vertical-align: top; word-wrap: break-word; word-break: break-all;">${escapeHTML(titulo)}</td>
                        <td id="desc-cell" style="width: 50%; border: 0.1pt solid #bfdbfe; padding: 3px; text-align: justify; vertical-align: top; background: #f8fafc; word-wrap: break-word; word-break: break-all;">${escapeHTML(descripcion)}</td>
                        <td style="width: 5%; border: 0.1pt solid #bfdbfe; padding: 2px; text-align: center; vertical-align: top; word-wrap: break-word; word-break: break-all;">${escapeHTML(entry.tipo_nota || '')}</td>
                        <td style="width: 7%; border: 0.1pt solid #bfdbfe; padding: 2px; vertical-align: top; word-wrap: break-word; word-break: break-all;">${escapeHTML(ubicacion)}</td>
                        <td style="width: 6%; border: 0.1pt solid #bfdbfe; padding: 2px; vertical-align: top; word-wrap: break-word; word-break: break-all;">${escapeHTML(usuario)}</td>
                        <td style="width: 7%; border: 0.1pt solid #bfdbfe; padding: 2px; vertical-align: top; word-wrap: break-word; word-break: break-all;">${comentarios}</td>
                    </tr>
                </table>
            `;

            let canvas;
            try {
                // Implementar Timeout en html2canvas con Promise.race para evitar que se quede colgado eternamente
                canvas = await Promise.race([
                    html2canvas(rowMeasure, { 
                        scale: 2, 
                        useCORS: true, 
                        logging: false,
                        allowTaint: true
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout al renderizar html2canvas (3 segundos)')), 3000))
                ]);
            } catch (canvasErr) {
                console.error(`[PDF Debug] Error/Timeout en html2canvas para folio ${entry.folio || '-'}:`, canvasErr);
            }

            // Validación de canvas nulo o vacío
            if (!canvas || canvas.width === 0 || canvas.height === 0) {
                console.warn('[PDF Debug] Canvas inválido o vacío generado para la entrada:', entry.id);
                // Creamos un canvas por defecto para que no rompa la generación
                canvas = document.createElement('canvas');
                canvas.width = 300;
                canvas.height = 30;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, 300, 30);
                ctx.fillStyle = '#FF0000';
                ctx.font = '10px Arial';
                ctx.fillText(`Error de renderizado visual (Folio ${entry.folio || '-'})`, 10, 20);
            }

            // Evitar división por cero
            const rowHeightMM = (canvas.width > 0) ? ((canvas.height * usableWidth) / canvas.width) : 10;

            // ¿Cabe la fila entera en el espacio que queda de la hoja?
            if (currentY + rowHeightMM > (pageHeight - marginBottom)) {
                // Si la fila es más alta que una hoja entera o no cabe
                let remainingRowHeight = rowHeightMM;
                let canvasOffset = 0;
                let loopCount = 0;

                while (remainingRowHeight > 0) {
                    loopCount++;
                    if (loopCount > 50) {
                        console.error('[PDF Debug] Bucle infinito evitado en división de página para fila:', entry.folio);
                        break;
                    }

                    const spaceLeft = (pageHeight - marginBottom) - currentY;
                    
                    // Si el espacio que queda es muy pequeño, saltar página
                    if (spaceLeft < 15 && canvasOffset === 0) {
                        pdf.addPage();
                        currentPage++;
                        drawHeader(currentPage);
                        continue;
                    }

                    // Cuánto de la fila podemos meter en esta página
                    const heightToDraw = Math.min(remainingRowHeight, spaceLeft);
                    
                    if (heightToDraw <= 0) {
                        pdf.addPage();
                        currentPage++;
                        drawHeader(currentPage);
                        currentY = marginTop + 30;
                        continue;
                    }
                    
                    // Ratio para el corte del canvas
                    const sourceY = (canvasOffset * canvas.height) / rowHeightMM;
                    const sourceHeight = (heightToDraw * canvas.height) / rowHeightMM;

                    // Crear un canvas temporal para el trozo
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = Math.max(1, Math.floor(sourceHeight));
                    const ctx = tempCanvas.getContext('2d');
                    
                    // Fondo blanco opaco
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    
                    try {
                        ctx.drawImage(
                            canvas, 
                            0, Math.floor(sourceY), canvas.width, Math.max(1, Math.floor(sourceHeight)), 
                            0, 0, tempCanvas.width, tempCanvas.height
                        );
                    } catch (drawErr) {
                        console.error('[PDF Debug] Error al dibujar segmento de canvas:', drawErr);
                    }

                    const imgData = tempCanvas.toDataURL('image/jpeg', 0.85);
                    if (imgData && imgData.startsWith('data:image/')) {
                        pdf.addImage(imgData, 'JPEG', marginLeft, currentY, usableWidth, heightToDraw);
                    }

                    remainingRowHeight -= heightToDraw;
                    canvasOffset += heightToDraw;

                    if (remainingRowHeight > 0) {
                        pdf.addPage();
                        currentPage++;
                        drawHeader(currentPage);
                    } else {
                        currentY += heightToDraw;
                    }
                }
            } else {
                // Cabe perfectamente
                const imgData = canvas.toDataURL('image/jpeg', 0.85);
                if (imgData && imgData.startsWith('data:image/')) {
                    pdf.addImage(imgData, 'JPEG', marginLeft, currentY, usableWidth, rowHeightMM);
                }
                currentY += rowHeightMM;
            }
        }

        document.body.removeChild(rowMeasure);
        console.log('[PDF Debug] 8. Procesamiento de filas finalizado. Guardando archivo...');

        // Generar nombre de archivo con fecha
        const fechaArchivo = new Date().toISOString().split('T')[0];
        const nombreArchivo = `bitacora_${fechaArchivo}.pdf`;
        
        // Descargar el PDF
        try {
            console.log('[PDF Debug] Intentando pdf.save()...');
            pdf.save(nombreArchivo);
            console.log('✅ PDF guardado exitosamente como:', nombreArchivo);
            
            await new Promise(resolve => setTimeout(resolve, 500));
            showNotification('✅ PDF generado y descargado exitosamente', 'success');
            
        } catch (saveError) {
            console.error('[PDF Debug] Error al guardar PDF con pdf.save():', saveError);
            
            try {
                console.log('[PDF Debug] Intentando Método 2 (Blob)...');
                const pdfBlob = pdf.output('blob');
                const blobUrl = URL.createObjectURL(pdfBlob);
                
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = nombreArchivo;
                downloadLink.style.display = 'none';
                
                document.body.appendChild(downloadLink);
                downloadLink.click();
                
                setTimeout(() => {
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(blobUrl);
                }, 100);
                
                console.log('✅ PDF descargado con método alternativo (Blob)');
                showNotification('✅ PDF generado y descargado exitosamente', 'success');
                
            } catch (alternativeError) {
                console.error('[PDF Debug] Error en Método 2 (Blob):', alternativeError);
                
                try {
                    console.log('[PDF Debug] Intentando Método 3 (Nueva pestaña)...');
                    const pdfDataUri = pdf.output('datauristring');
                    const newWindow = window.open(pdfDataUri, '_blank');
                    
                    if (newWindow) {
                        console.log('✅ PDF abierto en nueva pestaña');
                        showNotification('📄 PDF abierto en nueva pestaña - guarda manualmente', 'info');
                    } else {
                        throw new Error('Nueva pestaña bloqueada por el navegador.');
                    }
                    
                } catch (finalError) {
                    console.error('[PDF Debug] Error en todos los métodos de descarga:', finalError);
                    showNotification('❌ No se pudo descargar el PDF - intenta de nuevo', 'error');
                }
            }
        }
        
    } catch (error) {
        console.error('[PDF Debug] Error crítico al generar PDF:', error);
        console.error('Detalles del error:', error.message, error.stack);
        showNotification('❌ Error al generar PDF: ' + (error.message || 'Error desconocido'), 'error');
    }
}

// Validar entrada antes de guardar
function validateBitacoraEntry(formData) {
    const errors = [];
    
    // Validaciones obligatorias
    if (!formData.titulo || formData.titulo.trim() === '') {
        errors.push('❌ El título es obligatorio');
    }
    
    if (!formData.fecha) {
        errors.push('❌ La fecha y hora son obligatorias');
    }
    
    if (!formData.descripcion || formData.descripcion.trim() === '') {
        errors.push('❌ La descripción es obligatoria');
    }
    
    if (!formData.tipo_nota) {
        errors.push('❌ El tipo de nota es obligatorio');
    }
    

    
    if (!formData.ubicacion) {
        errors.push('❌ La ubicación es obligatoria');
    }
    
    // CAMPOS DE HORA OBLIGATORIOS
    if (!formData.hora_inicio) {
        errors.push('❌ La hora de inicio es obligatoria');
    }
    
    if (!formData.hora_final) {
        errors.push('❌ La hora de final es obligatoria');
    }
    
    // Validar orden lógico de horas
    if (formData.hora_inicio && formData.hora_final) {
        if (formData.hora_inicio >= formData.hora_final) {
            errors.push('⚠️ La hora de inicio debe ser anterior a la hora de final');
        }
        
        // Nota: Se elimina validación de 12 horas máximas ya que un procedimiento
        // puede extenderse por varios días consecutivos sin límite estricto
    }
    
    // Validar longitud mínima
    if (formData.titulo && formData.titulo.length < 5) {
        errors.push('⚠️ El título debe tener al menos 5 caracteres');
    }
    
    if (formData.descripcion && formData.descripcion.length < 10) {
        errors.push('⚠️ La descripción debe tener al menos 10 caracteres');
    }
    

    
    return errors;
}

// Mostrar errores de validación de forma elegante
function showValidationErrors(errors) {
    if (errors.length === 0) return;
    
    // Crear modal de errores
    const errorModal = document.createElement('div');
    errorModal.className = 'validation-error-modal';
    errorModal.innerHTML = `
        <div class="validation-error-content">
            <div class="validation-error-header">
                <h3>⚠️ Por favor corrija los siguientes campos:</h3>
                <button class="validation-error-close" onclick="this.closest('.validation-error-modal').remove()">✕</button>
            </div>
            <div class="validation-error-list">
                ${errors.map(error => `<div class="validation-error-item">${error}</div>`).join('')}
            </div>
            <div class="validation-error-actions">
                <button class="validation-error-ok" onclick="this.closest('.validation-error-modal').remove()">Entendido</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(errorModal);
    
    // Resaltar campos con errores
    highlightInvalidFields(errors);
    
    // Auto-cerrar después de 10 segundos
    setTimeout(() => {
        if (errorModal.parentNode) {
            errorModal.remove();
        }
    }, 10000);
}

// Resaltar campos inválidos en el formulario
function highlightInvalidFields(errors) {
    // Primero limpiar resaltados anteriores
    document.querySelectorAll('.form-group').forEach(group => {
        group.classList.remove('validation-error');
    });
    
    // Resaltar campos específicos con errores
    errors.forEach(error => {
        if (error.includes('título')) {
            document.getElementById('titulo')?.closest('.form-group')?.classList.add('validation-error');
        }
        if (error.includes('descripción')) {
            document.getElementById('descripcion')?.closest('.form-group')?.classList.add('validation-error');
        }
        if (error.includes('fecha')) {
            document.getElementById('fecha')?.closest('.form-group')?.classList.add('validation-error');
        }
        if (error.includes('tipo')) {
            document.getElementById('tipoNota')?.closest('.form-group')?.classList.add('validation-error');
        }
        if (error.includes('ubicación')) {
            document.getElementById('ubicacion')?.closest('.form-group')?.classList.add('validation-error');
        }

        if (error.includes('hora de inicio') || error.includes('inicio') && !error.includes('final')) {
            document.getElementById('horaInicio')?.closest('.form-group')?.classList.add('validation-error');
        }
        if (error.includes('hora de final') || error.includes('final') && !error.includes('inicio')) {
            document.getElementById('horaFinal')?.closest('.form-group')?.classList.add('validation-error');
        }
        if (error.includes('hora') && error.includes('anterior')) {
            // Error lógico de horas - resaltar ambos
            document.getElementById('horaInicio')?.closest('.form-group')?.classList.add('validation-error');
            document.getElementById('horaFinal')?.closest('.form-group')?.classList.add('validation-error');
        }
    });
    
    // Hacer scroll al primer error
    const firstError = document.querySelector('.validation-error');
    if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Hacer funciones disponibles globalmente para onclick
window.openCommentsModal = openCommentsModal;
window.closeCommentsModal = closeCommentsModal;
window.submitComment = submitComment;
window.editComment = editComment;
window.saveComment = saveComment;
window.cancelEditComment = cancelEditComment;
window.deleteComment = deleteComment;
window.diagnoseDeleteIssue = diagnoseDeleteIssue;
window.replyToComment = replyToComment;
window.submitReply = submitReply;
window.cancelReply = cancelReply;
window.deleteEntry = deleteEntry;
window.editEntry = editEntry;

// Funciones de gestión de invitaciones
const manageUsersBtnEl = document.getElementById('manageUsersBtn');
if (manageUsersBtnEl) {
    manageUsersBtnEl.addEventListener('click', function() {
        console.log('👥 Click en botón de gestión de usuarios');
        console.log('👥 Rol del usuario actual:', currentUser.role);
        openInvitationModal();
    });
    console.log('✅ Event listener agregado al botón de gestión de usuarios');
} else {
    console.error('❌ No se encontró el botón manageUsersBtn');
}

function openInvitationModal() {
    console.log('👥 Abriendo modal de invitaciones');
    document.getElementById('invitationModal').style.display = 'flex';
    loadInvitationCodes();
    // Asegurar que el formulario esté inicializado
    initializeGenerateCodeForm();
}

function closeInvitationModal() {
    document.getElementById('invitationModal').style.display = 'none';
    document.getElementById('generatedCodeResult').style.display = 'none';
}

function openRegisterModal() {
    document.getElementById('registerModal').style.display = 'flex';
}

function closeRegisterModal() {
    document.getElementById('registerModal').style.display = 'none';
}

async function loadInvitationCodes() {
    const codesList = document.getElementById('codesList');
    codesList.innerHTML = '<p class="loading-codes">Cargando códigos...</p>';
    
    try {
        const { data: codes, error } = await supabaseClient
            .from('invitation_codes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        if (!codes || codes.length === 0) {
            codesList.innerHTML = '<p class="no-codes">No hay códigos generados</p>';
            return;
        }
        
        codesList.innerHTML = codes.map(code => {
            const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
            const statusText = code.is_used ? 'Usado' : (isExpired ? 'Expirado' : 'Disponible');
            const statusClass = code.is_used ? 'used' : (isExpired ? 'expired' : 'available');
            
            return `
                <div class="code-item ${code.is_used || isExpired ? 'used' : ''}">
                    <div class="code-info">
                        <div class="code-text">${code.code}</div>
                        <div class="code-meta">
                            <span class="code-role ${code.role}">${getRoleDisplayName(code.role)}</span>
                            <span class="code-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="code-meta" style="margin-top: 0.25rem;">
                            ${code.expires_at ? `Expira: ${new Date(code.expires_at).toLocaleString()}` : 'Sin expiración'}
                            ${code.used_at ? ` • Usado: ${new Date(code.used_at).toLocaleString()}` : ''}
                        </div>
                    </div>
                    ${!code.is_used && !isExpired ? `
                        <button class="delete-code-btn" onclick="deleteInvitationCode(${code.id})">🗑️</button>
                    ` : ''}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error cargando códigos:', error);
        codesList.innerHTML = '<p class="no-codes">Error al cargar códigos</p>';
    }
}

// Función para inicializar el formulario de códigos de invitación
function initializeGenerateCodeForm() {
    console.log('🎫 Agregando event listener al formulario generateCodeForm');
    const generateCodeForm = document.getElementById('generateCodeForm');
    console.log('🎫 Elemento generateCodeForm encontrado:', !!generateCodeForm);
    if (generateCodeForm && !generateCodeForm.dataset.listenerAdded) {
        generateCodeForm.dataset.listenerAdded = 'true';
        generateCodeForm.addEventListener('submit', async function(e) {
            console.log('🎫 Formulario de generación de código enviado');

            e.preventDefault();

            const generateCodeBtn = document.getElementById('generateCodeBtn');
            const codeRoleInput = document.getElementById('codeRole');
            const codeExpirationInput = document.getElementById('codeExpiration');
            const generatedCodeEl = document.getElementById('generatedCode');
            const generatedCodeResultEl = document.getElementById('generatedCodeResult');

            console.log('🎫 Elementos encontrados:', {
                generateCodeBtn: !!generateCodeBtn,
                codeRoleInput: !!codeRoleInput,
                codeExpirationInput: !!codeExpirationInput,
                generatedCodeEl: !!generatedCodeEl,
                generatedCodeResultEl: !!generatedCodeResultEl
            });

            if (!codeRoleInput) {
                console.error('❌ Input de rol no encontrado');
                return;
            }

            const role = codeRoleInput.value;
            const expiration = parseInt(codeExpirationInput.value) || 48;

            console.log('🔧 Valores:', {
                role: role,
                expiration: expiration,
                isOnline: isOnline,
                offlineMode: offlineMode
            });

            if (!role) {
                console.error('❌ Rol está vacío');
                showNotification('❌ Por favor selecciona un rol', 'error');
                return;
            }

            try {
                if (!isOnline) {
                    console.error('❌ Sin conexión - No se puede generar código');
                    showNotification('🔴 Sin conexión - Se requiere internet para generar códigos', 'error', 5000);
                    return;
                }

                showNotification('✨ Generando código...', 'info');

                console.log('🔧 Llamando RPC: generate_invitation_code');

                const { data: code, error: codeError } = await supabaseClient
                    .rpc('generate_invitation_code', {
                        p_role: role,
                        p_expires_hours: expiration
                    });

                console.log('🔧 Respuesta del RPC:', { code, error: codeError });

                if (codeError) {
                    console.error('❌ Error en RPC:', codeError);
                    throw codeError;
                }

                if (!code) {
                    console.error('❌ El código es nulo:', code);
                    throw new Error('El código generado es nulo');
                }

                console.log('🔧 Código generado:', code);

                if (generatedCodeEl) {
                    generatedCodeEl.textContent = code;
                    console.log('✅ Código asignado al elemento');
                } else {
                    console.error('❌ Elemento generatedCode no encontrado');
                }

                if (generatedCodeResultEl) {
                    generatedCodeResultEl.style.display = 'block';
                    console.log('✅ Resultado mostrado');
                } else {
                    console.error('❌ Elemento generatedCodeResult no encontrado');
                }

                showNotification('✅ Código generado exitosamente: ' + code, 'success');

                document.getElementById('codeRole').value = '';

                console.log('🔧 Recargando códigos en 500ms...');
                setTimeout(loadInvitationCodes, 500);

            } catch (error) {
                console.error('❌ Error generando código:', error);
                console.error('❌ Detalles:', error.message, error.code, error.hint);
                showNotification('❌ Error al generar código: ' + error.message, 'error');
            }
        });
    }
}

// Inicializar inmediatamente si el DOM ya está listo, o esperar si no
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGenerateCodeForm);
} else {
    initializeGenerateCodeForm();
}

async function deleteInvitationCode(codeId) {
    if (!confirm('¿Estás seguro de eliminar este código?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('invitation_codes')
            .delete()
            .eq('id', codeId);
        
        if (error) throw error;
        
        showNotification('✅ Código eliminado exitosamente', 'success');
        loadInvitationCodes();
        
    } catch (error) {
        console.error('Error eliminando código:', error);
        showNotification('❌ Error al eliminar código', 'error');
    }
}

function copyGeneratedCode() {
    const code = document.getElementById('generatedCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showNotification('📋 Código copiado al portapapeles', 'success');
    }).catch(() => {
        showNotification('❌ Error al copiar código', 'error');
    });
}


// Registrar immediately when app.js loads
(function() {
    console.log('📝 Iniciando registro de event listener para registerWithCodeForm');
    
    function attachRegisterEventListener() {
        const registerWithCodeForm = document.getElementById('registerWithCodeForm');
        console.log('📝 Elemento registerWithCodeForm encontrado:', !!registerWithCodeForm);
        
        if (registerWithCodeForm) {
            console.log('📝 Agregando event listener al formulario registerWithCodeForm');
            
            // Remove any existing listeners to avoid duplicates
            const newForm = registerWithCodeForm.cloneNode(true);
            registerWithCodeForm.parentNode.replaceChild(newForm, registerWithCodeForm);
            
            newForm.addEventListener('submit', async function(e) {
                e.preventDefault();

                const code = document.getElementById('registerInvitationCode').value.trim().toUpperCase();
                const name = document.getElementById('registerName').value.trim();
                const email = document.getElementById('registerEmail').value.trim();
                const password = document.getElementById('registerPassword').value;
                const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

                if (password !== passwordConfirm) {
                    showNotification('❌ Las contraseñas no coinciden', 'error');
                    return;
                }

                if (password.length < 6) {
                    showNotification('❌ La contraseña debe tener al menos 6 caracteres', 'error');
                    return;
                }

                if (name.length < 2) {
                    showNotification('❌ El nombre debe tener al menos 2 caracteres', 'error');
                    return;
                }

                if (!supabaseClient) {
                    showNotification('❌ Registro no disponible en modo offline', 'error');
                    return;
                }

                try {
                    showNotification('📝 Registrando usuario...', 'info');

                    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                        email: email,
                        password: password
                    });

                    console.log('🔐 Respuesta de signUp:', { authData, authError });

                    if (authError) throw authError;

                    if (authData.user) {
                        const { data: roleData, error: roleError } = await supabaseClient
                            .rpc('redeem_invitation_code', {
                                p_code: code,
                                p_user_id: authData.user.id
                            });

                        if (roleError) {
                            showNotification('❌ Error: ' + roleError.message, 'error');
                            return;
                        }

                        const { error: updateError } = await supabaseClient
                            .from('profiles')
                            .update({ nombre: name })
                            .eq('id', authData.user.id);

                        if (updateError) {
                            console.warn('⚠️ Error actualizando nombre:', updateError);
                        }

                        showNotification('✅ Registro exitoso. Ahora puedes iniciar sesión.', 'success');
                        closeRegisterModal();
                        document.getElementById('registerWithCodeForm').reset();

                        setTimeout(() => {
                            document.getElementById('email').value = email;
                            document.getElementById('password').focus();
                        }, 500);
                    }

                } catch (error) {
                    console.error('Error registrando:', error);
                    showNotification('❌ Error al registrar: ' + error.message, 'error');
                }
            });
            
            console.log('✅ Event listener registrado exitosamente');
            return true;
        } else {
            console.log('📝 Elemento registerWithCodeForm NO encontrado, esperando...');
            return false;
        }
    }
    
    // Try immediately
    if (!attachRegisterEventListener()) {
        // If not found, wait for it with a timeout
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max
        
        const intervalId = setInterval(() => {
            attempts++;
            if (attachRegisterEventListener() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                if (attempts >= maxAttempts) {
                    console.warn('⚠️ No se encontró registerWithCodeForm después de 5 segundos');
                }
            }
        }, 100);
    }
})();

window.openInvitationModal = openInvitationModal;
window.closeInvitationModal = closeInvitationModal;
window.openRegisterModal = openRegisterModal;
window.closeRegisterModal = closeRegisterModal;
window.deleteInvitationCode = deleteInvitationCode;
window.copyGeneratedCode = copyGeneratedCode;

// Iniciar
console.log('🚀 Iniciando aplicación...');
checkAuth().then(() => {
    console.log('✅ checkAuth completado exitosamente');
    console.log('🔍 Verificando funciones globales:', {
        deleteEntry: typeof window.deleteEntry,
        diagnoseDeleteIssue: typeof window.diagnoseDeleteIssue
    });
}).catch(error => {
    console.error('❌ Error en checkAuth:', error);
    console.error('Stack trace:', error.stack);
    showNotification('❌ Error al iniciar sesión', 'error');
});