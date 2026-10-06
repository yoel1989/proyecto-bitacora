// Service Worker para modo offline + ACTUALIZACIÓN AUTOMÁTICA
// Estrategia:
//  - Páginas (HTML): network-first → siempre intenta la red para recibir la última
//    versión; la caché solo se usa si no hay conexión.
//  - Assets del propio sitio (app.js, styles.css, etc.): stale-while-revalidate →
//    se responde rápido desde caché y se refresca en segundo plano, así nunca queda
//    una versión vieja para siempre.
//  - Combinado con skipWaiting + clients.claim() y el listener controllerchange de
//    la página, cada nueva versión se aplica sola, SIN que el usuario limpie caché.

const CACHE_VERSION = 'v3';
const CACHE_NAME = `bitacora-cache-${CACHE_VERSION}`;
const STATIC_CACHE = `bitacora-static-${CACHE_VERSION}`;

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
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('🔧 Cacheando recursos estáticos...');
                return cache.addAll(STATIC_ASSETS);
            })
            // Limpiar entradas con query strings (versiones viejas de app.js?v=... etc.)
            .then(() => caches.open(STATIC_CACHE))
            .then((cache) => cache.keys().then((keys) =>
                Promise.all(keys.map((req) => {
                    const url = new URL(req.url);
                    if (url.origin === self.location.origin && url.search) {
                        return cache.delete(req);
                    }
                }))
            ))
            .then(() => {
                console.log('✅ Service Worker instalado');
                return self.skipWaiting();
            })
            .catch((error) => {
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
        }).then(() => {
            // Recargar todas las pestañas/ventanas abiertas para aplicar la nueva
            // versión automáticamente (funciona incluso con la versión anterior de la app).
            return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clients) => {
                    return Promise.all(clients.map((client) => {
                        if (client.url && /^https?:/.test(client.url)) {
                            return client.navigate(client.url).catch(() => {});
                        }
                        return Promise.resolve();
                    }));
                });
        })
    );
});

// Interceptar requests
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Solo cachear requests GET
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // No cachear requests a Supabase ni al worker de subida (API calls)
    if (url.hostname.includes('supabase') ||
        url.hostname.includes('bitacora-upload-worker')) {
        return;
    }

    // Navegaciones (HTML): network-first -> siempre la versión más reciente
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then((response) => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        }).catch(() => {});
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(request).then((cached) => {
                        if (cached) return cached;
                        return caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // Assets del propio sitio (app.js, styles.css, etc.): stale-while-revalidate
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                // Lanzar la actualización de red en segundo plano
                const networkUpdate = fetch(request)
                    .then((response) => {
                        if (response && response.status === 200 && response.type === 'basic') {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, responseToCache);
                            }).catch(() => {});
                        }
                        return response;
                    })
                    .catch(() => undefined);

                // Si hay copia en caché, devolverla ya (rápido); si no, esperar la red
                return cachedResponse || networkUpdate;
            })
        );
        return;
    }

    // Cross-origin (CDNs e imágenes): siempre red (las CDN ya se precachean en install)
    event.respondWith(fetch(request));
});

// Manejar mensajes desde el main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});