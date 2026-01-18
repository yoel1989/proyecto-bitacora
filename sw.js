// Service Worker para modo offline
const CACHE_NAME = 'bitacora-cache-v1';
const STATIC_CACHE = 'bitacora-static-v1';

// Recursos a cachear (rutas relativas para compatibilidad)
const STATIC_ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './comments-buttons.css',
    './comments-modal.css',
    './config.js',
    // CDN resources (will be cached when requested)
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker instalándose...');
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            console.log('🔧 Cacheando recursos estáticos...');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => {
            console.log('✅ Service Worker instalado');
            return self.skipWaiting();
        }).catch((error) => {
            console.error('❌ Error instalando Service Worker:', error);
        })
    );
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
    console.log('🔧 Service Worker activándose...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== STATIC_CACHE && cacheName !== CACHE_NAME) {
                        console.log('🗑️ Eliminando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker activado');
            return self.clients.claim();
        })
    );
});

// Interceptar requests
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Solo cachear requests GET
    if (event.request.method !== 'GET') return;

    // No cachear requests a Supabase (API calls)
    if (url.hostname.includes('supabase') ||
        url.hostname.includes('bitacora-upload-worker')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Retornar cache si existe
                return cachedResponse;
            }

            // Si no está en cache, hacer request y cachear
            return fetch(event.request).then((response) => {
                // Solo cachear responses exitosas
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // Clonar response para cachear
                const responseToCache = response.clone();

                caches.open(STATIC_CACHE).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch((error) => {
                console.error('❌ Error en fetch:', error);
                // Si falla y es una página HTML, mostrar página offline
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
                throw error;
            });
        })
    );
});

// Manejar mensajes desde el main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});