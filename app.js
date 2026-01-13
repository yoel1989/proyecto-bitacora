// Supabase client está configurado en config.js
// Asegúrate de que config.js se cargue antes que app.js

// Importar servicio de email (solo en servidor)
// const { notificarATodosUsuarios } = require('./email-service.js');

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

// Función de notificaciones por email
async function enviarNotificacionesEmailATodos(entrada) {
    try {
        // Obtener todos los usuarios activos
        const { data: usuarios, error } = await supabaseClient
            .from('usuarios')
            .select('email, nombre')
            .eq('activo', true);
        
        if (error) throw error;
        
        console.log(`📧 Preparando notificación para ${usuarios.length} usuarios...`);
        
        // Enviar email usando EmailJS (funciona en frontend sin backend)
        for (const usuario of usuarios) {
            await enviarEmailConEmailJS(usuario, entrada);
        }
        
        
        
    } catch (error) {
        console.error('❌ Error en notificaciones por email:', error);
        throw error;
    }
}

// Enviar email individual con EmailJS
async function enviarEmailConEmailJS(usuario, entrada) {
    const templateParams = {
        to_email: usuario.email,
        to_name: usuario.nombre || 'Usuario',
        from_name: 'Bitácora de Obra',
        entry_title: entrada.titulo,
        entry_description: entrada.descripcion || 'Sin descripción',
        entry_location: entrada.ubicacion,
        entry_type: entrada.tipo_nota,
        entry_date: new Date(entrada.fecha).toLocaleString('es-ES'),
        entry_folio: entrada.folio,
        reply_to: 'noreply@bitacora.com'
    };
    
    try {
        await emailjs.send(
            'service_tu_service_id',    // Reemplazar con tu Service ID
            'template_tu_template_id',  // Reemplazar con tu Template ID
            templateParams,
            'tu_public_key'              // Reemplazar con tu Public Key
        );
        
    } catch (error) {
        console.error(`❌ Error enviando a ${usuario.email}:`, error);
        throw error;
    }
}

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
    
    await supabaseClient.auth.signOut();
    currentUser = null;
    showLogin();
}

// Obtener perfil del usuario
async function getUserProfile() {
    if (!currentUser) return;
    
    try {
        // Consulta optimizada con timeout para obtener rol
        const { data, error } = await Promise.race([
            supabaseClient
                .from('profiles')
                .select('rol, email')
                .eq('id', currentUser.id)
                .single(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 3000)
            )
        ]);
        
        // Asegurar que el email siempre se muestre desde el auth de Supabase
        const userEmail = currentUser.email || 'Usuario desconocido';
        document.getElementById('userName').textContent = userEmail;
        
        if (data) {
            currentUser.role = data.rol; // Guardar el rol
            console.log('👤 Rol del usuario:', data.rol);
            // Usar email del perfil si existe, sino el del auth
            const displayEmail = data.email || userEmail;
            document.getElementById('userName').textContent = displayEmail;
            document.getElementById('userRole').textContent = '(' + getRoleDisplayName(data.rol) + ')';
            
            // Mostrar botón de invitaciones solo para admin
            if (data.rol === 'admin') {
                console.log('✅ Usuario es admin, mostrando botón de gestión');
                document.getElementById('manageUsersBtn').style.display = 'block';
            } else {
                console.log('ℹ️ Usuario no es admin, ocultando botón de gestión');
                document.getElementById('manageUsersBtn').style.display = 'none';
            }
        } else {
            currentUser.role = 'contratista'; // Rol por defecto
            console.log('⚠️ No se encontró perfil, usando rol por defecto: contratista');
            document.getElementById('userRole').textContent = '(' + getRoleDisplayName('contratista') + ')';
            // Ocultar botón de admin por defecto
            const manageUsersBtn = document.getElementById('manageUsersBtn');
            if (manageUsersBtn) {
                manageUsersBtn.style.display = 'none';
            }
        }
    } catch (error) {
        // Si hay error, asegurar que el email se muestre igual
        const userEmail = currentUser.email || 'Usuario desconocido';
        document.getElementById('userName').textContent = userEmail;
        currentUser.role = 'contratista';
        document.getElementById('userRole').textContent = '(' + getRoleDisplayName('contratista') + ')';
        console.warn('Error cargando perfil, usando datos por defecto:', error.message);
        // Ocultar botón de admin en caso de error
        const manageUsersBtn = document.getElementById('manageUsersBtn');
        if (manageUsersBtn) {
            manageUsersBtn.style.display = 'none';
        }
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
    
    const form = document.getElementById('bitacoraForm');
    const editId = form.dataset.editId;
    const keepPhotosCheckbox = document.getElementById('keepPhotosCheckbox');
    
    const fotoFiles = allSelectedFiles.length > 0 ? allSelectedFiles : document.getElementById('fotos').files;
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
                
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('archivos-obra')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: file.type
                    });
                
                if (uploadError) {
                    console.error('Error subiendo archivo:', uploadError);
                    alert(`Error al subir el archivo "${file.name}": ${uploadError.message}`);
                    continue; // Importante: no procesar este archivo si hubo error
                } else {
                    const { data: urlData } = supabaseClient.storage
                        .from('archivos-obra')
                        .getPublicUrl(fileName);
                    
                    newArchivoUrls.push({
                        url: urlData.publicUrl,
                        name: file.name,
                        type: file.type,
                        size: file.size
                    });
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
                
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('archivos-obra')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: file.type
                    });
                
                if (uploadError) {
                    console.error('Error subiendo archivo:', uploadError);
                    alert(`Error al subir el archivo "${file.name}": ${uploadError.message}`);
                    continue; // Importante: no procesar este archivo si hubo error
                } else {
                    const { data: urlData } = supabaseClient.storage
                        .from('archivos-obra')
                        .getPublicUrl(fileName);
                    
                    archivoUrls.push({
                        url: urlData.publicUrl,
                        name: file.name,
                        type: file.type,
                        size: file.size
                    });
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
        const { data: updateData, error: updateError } = await supabaseClient
            .from('bitacora')
            .update(formData)
            .eq('id', editId)
            .select();
        
data = updateData;
        error = updateError;
    } else {
        // Crear nueva entrada
        const { data: insertData, error: insertError } = await supabaseClient
            .from('bitacora')
            .insert(formData)
            .select();
        
        data = insertData;
        error = insertError;
    }
    
    if (error) {
        console.error('Error guardando:', error);
        alert('Error al guardar: ' + error.message);
} else {
        
        
        // Enviar notificaciones por email a todos los usuarios (solo para nuevas entradas)
        if (!editId && data && data[0]) {
            try {
                await enviarNotificacionesEmailATodos(data[0]);
                console.log('📧 Notificaciones por email enviadas');
            } catch (emailError) {
                console.error('❌ Error enviando emails:', emailError);
                // No fallar el guardado si hay error en emails
            }
        }
        
        // Notificar a otros usuarios (el realtime se encargará automáticamente)
        showNotification('✅ Entrada guardada exitosamente', 'success');
        
        document.getElementById('bitacoraForm').reset();
        await loadBitacoraEntries(1, false); // Recargar desde la primera página
        hideForm();
        
        if (editId) {
            if (fotoFiles.length > 0 && keepPhotosCheckbox && !keepPhotosCheckbox.checked) {
                alert('⚠️ Entrada actualizada: Las fotos existentes fueron reemplazadas por las nuevas fotos.');
            } else if (fotoFiles.length > 0 && keepPhotosCheckbox && keepPhotosCheckbox.checked) {
                alert(`✅ Entrada actualizada: Se mantuvieron ${JSON.parse(form.dataset.existingPhotos || '[]').length} fotos existentes y se agregaron ${fotoFiles.length} nuevas.`);
            } else {
                alert('✅ Entrada actualizada exitosamente');
            }
        } else {
            alert('✅ Entrada guardada exitosamente');
        }
    }
}

// Cargar entradas con paginación y optimización
async function loadBitacoraEntries(page = 1, append = false) {
    if (isLoadingEntries) return;
    
    isLoadingEntries = true;
    showLoadingIndicator();
    
    try {
        const offset = (page - 1) * ENTRIES_PER_PAGE;
        
        // Consulta optimizada con timeout
        const result = await Promise.race([
            supabaseClient
                .from('bitacora')
                .select('*', { count: 'exact' })
                .order('fecha', { ascending: false })
                .range(offset, offset + ENTRIES_PER_PAGE - 1),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 5000)
            )
        ]);
        
        const { data: bitacoraData, error, count } = result;
        
        if (error) {
            console.error('Error al cargar entradas:', error);
            showNotification('❌ Error al cargar las entradas', 'error');
            return;
        }
        
        // Procesar entradas inmediatamente sin esperar perfiles
        const processedEntries = bitacoraData.map(entry => {
            // Determinar el email a mostrar
            let email = entry.user_id || 'Usuario desconocido';
            
            // Si la entrada es del usuario actual, usar su email directamente
            if (currentUser && entry.user_id === currentUser.id && currentUser.email) {
                email = currentUser.email;
            }
            
            return {
                ...entry,
                profiles: {
                    email: email
                }
            };
        });
        
        // Actualizar datos globales
        if (append && page > 1) {
            allEntries = [...allEntries, ...processedEntries];
        } else {
            allEntries = processedEntries;
            currentPage = page;
        }
        
        totalEntries = count || 0;
        
        updatePaginationInfo();
        
        // Actualizar UI primero con los datos disponibles
        filterAndDisplayEntries();
        
        // Luego cargar emails de usuarios en segundo plano y actualizar solo los elementos existentes
        if (bitacoraData.length > 0) {
            loadUserEmailsInBackground(processedEntries).catch(err => {
                console.warn('Error cargando emails en segundo plano:', err);
            });
        }
        
        // Ocultar botón de cargar más si no hay más entradas
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = allEntries.length >= totalEntries ? 'none' : 'block';
        }
        
    } catch (error) {
        console.error('Error inesperado al cargar entradas:', error);
        showNotification('❌ Error al cargar las entradas', 'error');
    } finally {
        isLoadingEntries = false;
        hideLoadingIndicator();
    }
}

// Obtener email de usuario desde auth (función admin)
async function getUserEmailFromAuth(userId) {
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
                // Actualizar el array global allEntries con los datos modificados
                allEntries = entries;
                console.log('🔄 Actualizando vista con emails correctos...');
                
                // Reconstruir índice de búsqueda
                searchIndex = buildSearchIndex(allEntries);
                // Solo actualizar los elementos existentes sin duplicar
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
                const userCell = element.querySelector('td:nth-child(10)'); // Columna Usuario (10ª)
                if (userCell && entry.profiles?.email) {
                    userCell.textContent = entry.profiles.email;
                }
                
                // También actualizar en cards móviles si existen
                const mobileUserLabel = element.querySelector('.mobile-entry-row:last-child .mobile-entry-content');
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
function filterAndDisplayEntries() {
    if (isFiltering) {
        console.log('⏳ Ya se está filtrando, omitiendo...');
        return;
    }
    
    console.log('🔍 filterAndDisplayEntries iniciado');
    console.log('🔍 allEntries:', allEntries.length, 'entradas');
    
    isFiltering = true;
    
    let filteredEntries = [...allEntries];
    
    // Filtrar por búsqueda (usando índice optimizado)
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    console.log('🔍 searchTerm:', searchTerm);
    if (searchTerm) {
        filteredEntries = optimizedSearch(searchTerm, filteredEntries);
        console.log('🔍 Después de search:', filteredEntries.length);
    }
    
    // Filtrar por tipo de nota
    const tipoFilter = document.getElementById('tipoFilter').value;
    console.log('🔍 tipoFilter:', tipoFilter);
    if (tipoFilter) {
        filteredEntries = filteredEntries.filter(entry => entry.tipo_nota === tipoFilter);
        console.log('🔍 Después de tipo:', filteredEntries.length);
    }
    
    // Filtrar por ubicación
    const ubicacionFilter = document.getElementById('ubicacionFilter').value;
    console.log('🔍 ubicacionFilter:', ubicacionFilter);
    if (ubicacionFilter) {
        filteredEntries = filteredEntries.filter(entry => entry.ubicacion === ubicacionFilter);
        console.log('🔍 Después de ubicación:', filteredEntries.length);
    }
    
    // Filtrar por rango de fechas
    const fechaInicioFilter = document.getElementById('fechaInicioFilter').value;
    const fechaFinalFilter = document.getElementById('fechaFinalFilter').value;
    
    if (fechaInicioFilter && fechaFinalFilter) {
        filteredEntries = filteredEntries.filter(entry => {
            // Debug: console.log('Entrada fecha:', entry.fecha, 'Tipo:', typeof entry.fecha);
            const entryDate = new Date(entry.fecha || entry.fecha_hora);
            const fechaInicio = new Date(fechaInicioFilter);
            const fechaFinal = new Date(fechaFinalFilter);
            
            // Extraer componentes de fecha directamente del string para evitar problemas de timezone
            const entryDateString = (entry.fecha || entry.fecha_hora).split('T')[0];
            const entryDateOnly = new Date(entryDateString + 'T00:00:00');
            const fechaInicioOnly = new Date(fechaInicioFilter + 'T00:00:00');
            const fechaFinalOnly = new Date(fechaFinalFilter + 'T23:59:59');
            
            // Debug: console.log('Comparación:', entryDateOnly.toISOString(), '>=', fechaInicioOnly.toISOString(), '&& <=', fechaFinalOnly.toISOString());
            
            return entryDateOnly >= fechaInicioOnly && entryDateOnly <= fechaFinalOnly;
        });
    } else if (fechaInicioFilter) {
        // Si solo hay fecha de inicio, filtrar desde esa fecha en adelante
        filteredEntries = filteredEntries.filter(entry => {
            const entryDate = new Date(entry.fecha || entry.fecha_hora);
            const fechaInicio = new Date(fechaInicioFilter);
            // Normalizar fechas para comparar solo el día
            const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
            const fechaInicioOnly = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), fechaInicio.getDate());
            return entryDateOnly >= fechaInicioOnly;
        });
    } else if (fechaFinalFilter) {
        // Si solo hay fecha final, filtrar hasta esa fecha (incluyendo todo el día)
        filteredEntries = filteredEntries.filter(entry => {
            const entryDate = new Date(entry.fecha || entry.fecha_hora);
            const fechaFinal = new Date(fechaFinalFilter);
            // Normalizar fechas para comparar solo el día
            const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
            const fechaFinalOnly = new Date(fechaFinal.getFullYear(), fechaFinal.getMonth(), fechaFinal.getDate());
            return entryDateOnly <= fechaFinalOnly;
        });
    }
    
    // Usar await para asegurar que displayEntries se complete antes de continuar
    displayEntries(filteredEntries).then(() => {
        isFiltering = false;
    });
}

// Debounce para búsqueda (mejora rendimiento)
let searchTimeout;
function debouncedFilter() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterAndDisplayEntries, 300);
}

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
    if (isRenderingEntries && append) {
        console.log('⏳ Ya se están renderizando entradas, omitiendo...');
        return;
    }
    
    const entriesList = document.getElementById('entriesList');
    
    if (!entriesList) {
        console.error('❌ No se encontró el elemento entriesList');
        return;
    }
    
    if (!append) {
        entriesList.innerHTML = '';
    }
    
    isRenderingEntries = true;
    
    // Actualizar contador
    updateEntriesCounter(entries);
    
    if (!entries || entries.length === 0) {
        if (!append) {
            entriesList.innerHTML = '<p>No hay entradas de bitácora aún.</p>';
        }
        return;
    }

    // Agregar conteos de comentarios y estado de lectura ANTES de renderizar
    console.log('🔍 Entradas originales:', entries.map(e => ({id: e.id, hasCommentCount: !!e.commentCount})));
    
    const entriesWithCounts = await Promise.all(
        entries.map(async (entry) => {
            const commentCount = await countComments(entry.id);
            const isRead = await checkIfCommentsRead(entry.id);
            console.log(`🔍 Entrada ${entry.id}: ${commentCount} comentarios, leído: ${isRead}`);
            const entryWithCount = { ...entry, commentCount, isCommentsRead: isRead };
            return entryWithCount;
        })
    );
    
    // Usar las entradas con conteos y estado de lectura
    const entriesToRender = entriesWithCounts;
    console.log('🔍 Entradas a renderizar:', entriesToRender.map(e => ({id: e.id, commentCount: e.commentCount, isRead: e.isCommentsRead})));

    // Detectar si es móvil y mostrar el formato apropiado (cacheado para mejor rendimiento)
    const isMobile = window.innerWidth <= 768;
    
    // Crear fragmento para mejor rendimiento
    const fragment = document.createDocumentFragment();
    
    if (isMobile) {
        // Versión móvil: cards con botones en columna
        entriesToRender.forEach(entry => {
            const card = createMobileEntryCard(entry);
            fragment.appendChild(card);
        });
    } else {
        // Versión desktop: tabla con encabezados fijos separados
        const tableWrapper = createDesktopTable(entriesToRender);
        fragment.appendChild(tableWrapper);
    }
    
    // Agregar todo de una sola vez para mejor rendimiento
    entriesList.appendChild(fragment);
    
    // Inicializar lazy loading para imágenes después de renderizar
    setTimeout(initializeLazyLoading, 100);
    
    // Resetear bandera de renderizado
    isRenderingEntries = false;
}

// Crear tarjeta móvil con lazy loading
function createMobileEntryCard(entry) {
    console.log('📱 CREANDO MOBILE ENTRY CARD para entrada:', entry.id, 'commentCount:', entry.commentCount, 'typeof:', typeof entry.commentCount);
    const card = document.createElement('div');
    card.className = 'mobile-entry-card';
    card.setAttribute('data-entry-id', entry.id); // Para actualizaciones en tiempo real
    
    // Formatear fecha con zona horaria local
    const fechaFormateada = formatearFechaLocal(entry.fecha_hora || entry.fecha);
    
    // Crear archivos HTML para móvil
    // Mejorar detección de archivos con múltiples formatos posibles
    let archivos = [];
    
    if (entry.archivos && Array.isArray(entry.archivos) && entry.archivos.length > 0) {
        archivos = entry.archivos;
    } else if (entry.fotos && Array.isArray(entry.fotos) && entry.fotos.length > 0) {
        archivos = entry.fotos;
    } else if (typeof entry.archivos === 'string' && entry.archivos.trim() !== '') {
        // Si es un string JSON, intentar parsearlo
        try {
            archivos = JSON.parse(entry.archivos);
        } catch (e) {
            // Si no es JSON, tratar como URL simple
            archivos = [entry.archivos];
        }
    } else if (typeof entry.fotos === 'string' && entry.fotos.trim() !== '') {
        try {
            archivos = JSON.parse(entry.fotos);
        } catch (e) {
            archivos = [entry.fotos];
        }
    }
    
    
    
    let archivosHtml = '';
    
    if (archivos && archivos.length > 0) {
        archivosHtml = '<div class="mobile-archivos-container">';
        
        archivos.slice(0, 5).forEach(archivo => {
            const url = typeof archivo === 'string' ? archivo : archivo.url;
            const name = typeof archivo === 'string' ? '' : archivo.name;
            const type = typeof archivo === 'string' ? '' : archivo.type;
            
            if (type && type.startsWith('image/')) {
                // Si es imagen, mostrar placeholder con lazy loading
                archivosHtml += `
                    <div class="mobile-foto-container">
                        <div class="image-placeholder">📷</div>
                        <img class="mobile-foto lazy-image" data-src="${url}" onclick="window.open('${url}', '_blank')" title="${name}" />
                    </div>
                `;
            } else {
                // Si es otro tipo de archivo, mostrar icono
                const icon = getFileIcon(name || url);
                archivosHtml += `<div class="mobile-file-icon" onclick="window.open('${url}', '_blank')" title="${name}">${icon}</div>`;
            }
        });
        
        // Siempre mostrar botón de más archivos si hay más de 5
        if (archivos.length > 5) {
            archivosHtml += `
                <span class="mobile-more-photos" onclick="showAllArchivos('${entry.id}')" title="Ver todos los ${archivos.length} archivos">
                    +${archivos.length - 5}
                </span>
            `;
        }
        
        archivosHtml += '</div>';
    } else {
        archivosHtml = '<div class="no-fotos-mobile">Sin archivos</div>';
    }
    
    // Botones de acción según rol
    let actionButtons = '';
    
    // Botón de comentarios (siempre visible para todos los usuarios autenticados)
    const commentCount = entry.commentCount || 0;
    const isRead = entry.isCommentsRead || false;
    console.log(`🔨 Creando botón para entrada ${entry.id}, commentCount: ${commentCount}, leído: ${isRead}`);
actionButtons += `
        <button class="mobile-action-btn comments-btn ${isRead ? 'comments-read' : ''}" onclick="openCommentsModal(${entry.id})" title="Ver y responder comentarios">
            Responder <span class="comment-count">${commentCount}</span>
        </button>
    `;
    
    // Botón de editar siempre visible (la validación está en la función)
    actionButtons += `
        <button class="mobile-action-btn mobile-edit-btn" onclick="editEntry(${entry.id})">✏️ Editar</button>
    `;

    // Solo admin puede eliminar
    if (currentUser.role === 'admin') {
        actionButtons += `
            <button class="mobile-action-btn mobile-delete-btn" onclick="deleteEntry(${entry.id})">🗑️ Eliminar</button>
        `;
    }

    card.innerHTML = `
        <div class="mobile-entry-header">
            <div class="mobile-entry-date">
                <strong>Folio: ${entry.folio || '-'}</strong><br>
                ${fechaFormateada}
            </div>
        </div>
        
        <div class="mobile-entry-row">
            <div class="mobile-entry-label">Título:</div>
            <div class="mobile-entry-content">${entry.titulo}</div>
        </div>
        
        ${entry.descripcion ? `
            <div class="mobile-entry-row">
                <div class="mobile-entry-label">Descripción:</div>
                <div class="mobile-entry-content">${entry.descripcion}</div>
            </div>
        ` : ''}
        
        ${entry.hora_inicio || entry.hora_final ? `
            <div class="mobile-entry-row">
                <div class="mobile-entry-label">Horas:</div>
                <div class="mobile-entry-content">
                    ${entry.hora_inicio || '-'} ${entry.hora_inicio && entry.hora_final ? 'a' : ''} ${entry.hora_final || '-'}
                </div>
            </div>
        ` : ''}
        
        ${entry.tipo_nota ? `
            <div class="mobile-entry-row">
                <div class="mobile-entry-label">Tipo Nota:</div>
                <div class="mobile-entry-content">${entry.tipo_nota}</div>
            </div>
        ` : ''}
        
        ${entry.ubicacion ? `
            <div class="mobile-entry-row">
                <div class="mobile-entry-label">Ubicación:</div>
                <div class="mobile-entry-content">${entry.ubicacion}</div>
            </div>
        ` : ''}
        
        <div class="mobile-entry-row">
            <div class="mobile-entry-label">Usuario:</div>
            <div class="mobile-entry-content">${entry.profiles?.email || entry.user_id || 'Usuario desconocido'}</div>
        </div>
        
        ${archivosHtml}
        
        ${actionButtons ? `
            <div class="mobile-actions">
                <div class="mobile-actions-container">${actionButtons}</div>
            </div>
        ` : ''}
    `;
    
    return card;
}

// Crear tabla desktop
function createDesktopTable(entries) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    
    // Crear tabla de encabezados
    const headerContainer = document.createElement('div');
    headerContainer.className = 'table-header';
    const headerTable = document.createElement('table');
    headerTable.className = 'excel-table desktop-table';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Folio</th>
            <th>Fecha y Hora</th>
            <th>Título</th>
            <th>Descripción</th>
            <th>Hora Inicio</th>
            <th>Hora Final</th>
            <th>Tipo Nota</th>
            <th>Ubicación</th>
            <th>Usuario</th>
            <th>Adjuntos</th>
            <th>Acciones</th>
        </tr>
    `;
    headerTable.appendChild(thead);
    headerContainer.appendChild(headerTable);
    
    // Crear contenedor del cuerpo
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'table-body-container';
    const bodyTable = document.createElement('table');
    bodyTable.className = 'excel-table desktop-table';
    
    // Header vacío para mantener estructura
    const emptyHead = document.createElement('thead');
    emptyHead.innerHTML = `
        <tr>
            <th>Folio</th>
            <th>Fecha y Hora</th>
            <th>Título</th>
            <th>Descripción</th>
            <th>Hora Inicio</th>
            <th>Hora Final</th>
            <th>Tipo Nota</th>
            <th>Ubicación</th>
            <th>Usuario</th>
            <th>Adjuntos</th>
            <th>Acciones</th>
        </tr>
    `;
    bodyTable.appendChild(emptyHead);
    
    // Body con los datos
    const tbody = document.createElement('tbody');
    entries.forEach(entry => {
        const row = document.createElement('tr');
        row.setAttribute('data-entry-id', entry.id); // Para actualizaciones en tiempo real
        
        let archivosHtml = '';
        
        // Mejorar detección de archivos para desktop también
        let archivos = [];
        
        if (entry.archivos && Array.isArray(entry.archivos) && entry.archivos.length > 0) {
            archivos = entry.archivos;
        } else if (entry.fotos && Array.isArray(entry.fotos) && entry.fotos.length > 0) {
            archivos = entry.fotos;
        } else if (typeof entry.archivos === 'string' && entry.archivos.trim() !== '') {
            try {
                archivos = JSON.parse(entry.archivos);
            } catch (e) {
                archivos = [entry.archivos];
            }
        } else if (typeof entry.fotos === 'string' && entry.fotos.trim() !== '') {
            try {
                archivos = JSON.parse(entry.fotos);
            } catch (e) {
                archivos = [entry.fotos];
            }
        }
        
        
        
        if (archivos && archivos.length > 0) {
            const archivosParaMostrar = archivos.slice(0, 3);
            archivosHtml = '<div class="archivos-container">';
            
            archivosParaMostrar.forEach(archivo => {
                const url = typeof archivo === 'string' ? archivo : archivo.url;
                const name = typeof archivo === 'string' ? '' : archivo.name;
                const type = typeof archivo === 'string' ? '' : archivo.type;
                
                if (type && type.startsWith('image/')) {
                    // Si es imagen, mostrar placeholder con lazy loading
                    archivosHtml += `
                        <div class="mini-photo-container">
                            <div class="mini-image-placeholder">📷</div>
                            <img class="mini-photo lazy-image" data-src="${url}" onclick="window.open('${url}', '_blank')" title="${name}" />
                        </div>
                    `;
                } else {
                    // Si es otro tipo de archivo, mostrar icono
                    const icon = getFileIcon(name || url);
                    archivosHtml += `<div class="file-icon-preview" onclick="window.open('${url}', '_blank')" title="${name}">${icon}</div>`;
                }
            });
            
            // Siempre mostrar botón de más archivos si hay más de 3 en desktop
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
        
        // Botones de acción según rol
        let actionButtons = '';
        
        // Botón de comentarios (siempre visible para todos los usuarios autenticados)
        actionButtons += `
            <button class="comments-btn ${entry.isCommentsRead ? 'comments-read' : ''}" onclick="openCommentsModal(${entry.id})" title="Ver y responder comentarios">
                Responder <span class="comment-count">${entry.commentCount || 0}</span>
            </button>
        `;
        
        // Botón de editar siempre visible (la validación está en la función)
        actionButtons += `
            <button class="edit-btn" onclick="editEntry(${entry.id})">✏️ Editar</button>
        `;

        // Solo admin puede eliminar
        if (currentUser.role === 'admin') {
            actionButtons += `
                <button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️ Eliminar</button>
            `;
        }

        // Formatear fecha directamente desde datetime-local
        const fechaUsar = entry.fecha_hora || entry.fecha;
        let fechaFormateada = '';
        
        if (fechaUsar.includes('T')) {
            const [datePart, timePart] = fechaUsar.split('T');
            const [year, month, day] = datePart.split('-');
            const [hours, minutes] = timePart.split(':');
            
            // Formatear como DD/MM/YYYY HH:MM
            fechaFormateada = `${day}/${month}/${year} ${hours}:${minutes}`;
        } else {
            // Si no tiene hora, mostrar solo fecha
            const [year, month, day] = fechaUsar.split('-');
            fechaFormateada = `${day}/${month}/${year}`;
        }
        
        row.innerHTML = `
            <td><strong>${entry.folio || '-'}</strong></td>
            <td>${fechaFormateada}</td>
            <td>${entry.titulo}</td>
            <td>${entry.descripcion || ''}</td>
            <td>${entry.hora_inicio || '-'}</td>
            <td>${entry.hora_final || '-'}</td>
            <td>${entry.tipo_nota || '-'}</td>
            <td>${entry.ubicacion || ''}</td>
            <td>${entry.profiles?.email || entry.user_id || 'Usuario desconocido'}</td>
            <td>${archivosHtml}</td>
            <td>${actionButtons}</td>
        `;
        
        row.dataset.archivos = JSON.stringify(entry.archivos || entry.fotos || []);
        tbody.appendChild(row);
    });
    bodyTable.appendChild(tbody);
    
    // Ensamblar todo
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
        
        let modalContent = '<div class="modal-content">';
        modalContent += `
            <div class="modal-header">
                <h3>Todos los archivos (${archivos.length})</h3>
                <button class="close-modal" onclick="this.closest('.photo-modal').remove()">✕</button>
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
        // console.log('Modal de archivos agregado');
} else {
        // console.log('No hay archivos para mostrar');
    }
}

// Mantener compatibilidad con función anterior
function showAllPhotos(entryId) {
    showAllArchivos(entryId);
}

// Editar entrada
async function editEntry(entryId) {
    try {
        const { data, error } = await supabaseClient
            .from('bitacora')
            .select('*')
            .eq('id', entryId)
            .single();

        if (error) {
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

            // 1. Primero obtener la entrada para ver si tiene archivos
            const { data: entry, error: fetchError } = await supabaseClient
                .from('bitacora')
                .select('*')
                .eq('id', entryId)
                .single();

            if (fetchError) {
                console.error('❌ Error obteniendo entrada:', fetchError);
                throw new Error('No se pudo obtener la entrada: ' + fetchError.message);
            }

            // 2. Eliminar archivos del storage si existen
            const archivos = entry.archivos || entry.fotos || [];
            if (archivos.length > 0) {
                console.log('🗂️ Eliminando', archivos.length, 'archivos del storage...');
                for (const archivo of archivos) {
                    try {
                        // El archivo puede ser un objeto {url, name, ...} o un string
                        const archivoUrl = typeof archivo === 'string' ? archivo : archivo.url;
                        if (!archivoUrl) continue;

                        // Extraer el path del archivo desde la URL
                        const urlParts = archivoUrl.split('/storage/v1/object/public/');
                        if (urlParts.length > 1) {
                            const pathParts = urlParts[1].split('/');
                            const bucket = pathParts[0];
                            const filePath = pathParts.slice(1).join('/');
                            await supabaseClient.storage.from(bucket).remove([filePath]);
                            console.log('✅ Archivo eliminado:', filePath);
                        }
                    } catch (storageError) {
                        console.warn('⚠️ No se pudo eliminar archivo:', storageError.message);
                    }
                }
            }

            // 3. Eliminar archivos de comentarios
            const { data: comentarios } = await supabaseClient
                .from('comentarios')
                .select('archivos')
                .eq('bitacora_id', entryId);

            if (comentarios) {
                for (const comentario of comentarios) {
                    const archivosComentario = comentario.archivos || [];
                    for (const archivo of archivosComentario) {
                        try {
                            const archivoUrl = typeof archivo === 'string' ? archivo : archivo.url;
                            if (!archivoUrl) continue;

                            const urlParts = archivoUrl.split('/storage/v1/object/public/');
                            if (urlParts.length > 1) {
                                const pathParts = urlParts[1].split('/');
                                const bucket = pathParts[0];
                                const filePath = pathParts.slice(1).join('/');
                                await supabaseClient.storage.from(bucket).remove([filePath]);
                            }
                        } catch (e) {
                            console.warn('⚠️ Error eliminando archivo de comentario:', e.message);
                        }
                    }
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
                await supabaseClient.from('bitacora_read').delete().eq('bitacora_id', entryId);

                const { error: deleteError } = await supabaseClient
                    .from('bitacora')
                    .delete()
                    .eq('id', entryId);

                if (deleteError) {
                    console.error('❌ Error eliminando entrada:', deleteError);
                    throw new Error('No se pudo eliminar: ' + deleteError.message);
                }
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
    console.log('🔍 Iniciando checkAuth...');
    const { data: { session } } = await supabaseClient.auth.getSession();
    console.log('🔍 Session obtenida:', !!session);
    
    if (session) {
        console.log('🔍 Usuario encontrado:', session.user.email);
        
        // Asignar usuario básico primero
        currentUser = session.user;
        
        // Obtener el perfil completo con el rol
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('rol')
            .eq('id', session.user.id)
            .single();
        
        if (profile) {
            currentUser.role = profile.rol; // Usar 'rol' de la tabla profiles
            console.log('🔍 Rol del usuario:', currentUser.role);
            console.log('🔍 ¿Es admin?:', currentUser.role === 'admin');
        } else {
            console.log('🔍 No se encontró perfil, asignando rol por defecto');
            currentUser.role = 'user';
        }
        
        // Establecer información básica inmediatamente
        document.getElementById('userName').textContent = currentUser.email || 'Sin email';
        document.getElementById('userRole').textContent = '(Cargando...)';
        
        // Mostrar aplicación principal inmediatamente
        showMain();
        
        // Verificar estructura de base de datos en paralelo
        checkDatabaseStructure().then(dbOk => {
            if (!dbOk) {
                showNotification('❌ Error crítico en la base de datos. Contacta al administrador.', 'error');
            }
        }).catch(err => console.warn('Error verificando estructura:', err));
        
        // Cargar todo en paralelo para mejor rendimiento
        Promise.all([
            getUserProfile().catch(err => console.warn('Error cargando perfil:', err)),
            loadBitacoraEntries().catch(err => console.warn('Error cargando entradas:', err))
        ]).then(() => {
            // Inicializar notificaciones después de cargar todo
            initializeRealtimeNotifications().catch(err => console.warn('Error inicializando notificaciones:', err));
        });
    } else {
        showLogin();
    }
}

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
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const placeholder = img.previousElementSibling;
                
                // Cargar imagen
                img.onload = () => {
                    if (placeholder) {
                        placeholder.style.display = 'none';
                    }
                    img.style.opacity = '1';
                };
                
                img.src = img.dataset.src;
                img.classList.remove('lazy-image');
                observer.unobserve(img);
            }
        });
    }, {
        rootMargin: '50px' // Cargar 50px antes de que sea visible
    });
    
    // Observar todas las imágenes lazy
    document.querySelectorAll('.lazy-image').forEach(img => {
        imageObserver.observe(img);
    });
}

// Event listeners para filtros con debounce
document.getElementById('searchInput')?.addEventListener('input', debouncedFilter);
document.getElementById('tipoFilter')?.addEventListener('change', filterAndDisplayEntries);
document.getElementById('ubicacionFilter')?.addEventListener('change', filterAndDisplayEntries);
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
                (payload) => handleNewEntryNotification(payload)
            )
            .subscribe();

        // Suscribirse a nuevos comentarios
        const commentsChannel = supabaseClient
            .channel('new-comments-global')
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'comentarios'
                },
                (payload) => handleNewCommentNotification(payload)
            )
            .subscribe();

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
}

// Agregar notificación a la lista
function addNotification(notification) {
    notifications.unshift(notification);
    unreadNotificationCount++;

    // Limitar a 50 notificaciones
    if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
    }

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

    // Actualizar contador
    if (countElement) {
        if (unreadNotificationCount > 0) {
            countElement.textContent = unreadNotificationCount > 99 ? '99+' : unreadNotificationCount;
            countElement.style.display = 'flex';
        } else {
            countElement.style.display = 'none';
        }
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
    if (notificationSubscription) {
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
        
        // Obtener el último folio registrado
        const { data, error } = await supabaseClient
            .from('bitacora')
            .select('folio')
            .not('folio', 'is', null)
            .order('folio', { ascending: false })
            .limit(1)
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 es "no rows returned"
            console.error('Error al obtener último folio:', error);
            return '0001'; // Fallback al primer folio
        }
        
        let nuevoFolio;
        if (data && data.folio) {
            // Convertir folio a número, incrementar y formatear
            const ultimoNumero = parseInt(data.folio) + 1;
            nuevoFolio = String(ultimoNumero).padStart(4, '0');
        } else {
            // Si no hay folios previos, empezar desde 0001
            nuevoFolio = '0001';
        }
        
        // console.log('🔢 Nuevo folio generado:', nuevoFolio);
        return nuevoFolio;
    } catch (error) {
        console.error('Error en generarFolioConsecutivo:', error);
        return '0001'; // Fallback
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
    if (commentsSubscription) {
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
            
            // Generar nombre único
            const fileExt = file.name.split('.').pop();
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 9);
            const fileName = `comentario_${timestamp}_${random}.${fileExt}`;
            const filePath = `comentarios/${fileName}`;
            
            // Subir a Supabase Storage - Usar bucket específico para comentarios
            const { data, error } = await supabaseClient.storage
                .from('comentarios-archivos')
                .upload(filePath, file);
            
            if (error) {
                console.error('Error subiendo archivo:', error);
                continue;
            }
            
            // Obtener URL pública
            const { data: { publicUrl } } = supabaseClient.storage
                .from('comentarios-archivos')
                .getPublicUrl(filePath);
            
            uploadedFiles.push({
                name: file.name,
                size: file.size,
                type: file.type,
                url: publicUrl,
                path: filePath
            });
            
        } catch (error) {
            console.error('Error procesando archivo:', error);
        }
    }
    
    return uploadedFiles;
}

// Enviar nuevo comentario con archivos
async function submitComment() {
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
        
        if (error) {
            console.error('Error guardando respuesta:', error);
            showNotification('❌ Error al guardar la respuesta: ' + error.message, 'error');
            return;
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
        
        // Construir consulta base
        let query = supabaseClient
            .from('bitacora')
            .select('*', { count: 'exact' })
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
        const { data: allData, error, count } = await query;
        
        if (error) {
            console.error('Error cargando todas las entradas para PDF:', error);
            showNotification('❌ Error cargando datos para el PDF', 'error');
            return [];
        }
        
        let filteredEntries = allData || [];
        
        // Cargar emails de usuarios para las entradas
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
                    
                    // Asignar emails a las entradas
                    filteredEntries.forEach(entry => {
                        if (userEmails[entry.user_id]) {
                            entry.profiles = { email: userEmails[entry.user_id] };
                        }
                    });
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
        
        // Obtener conteos de comentarios para todas las entradas
        if (filteredEntries.length > 0) {
            const { data: commentsData, error: commentsError } = await supabaseClient
                .from('comentarios')
                .select('bitacora_id, id')
                .in('bitacora_id', filteredEntries.map(e => e.id));
            
            if (!commentsError && commentsData) {
                const commentCounts = {};
                commentsData.forEach(comment => {
                    commentCounts[comment.bitacora_id] = (commentCounts[comment.bitacora_id] || 0) + 1;
                });
                
                filteredEntries.forEach(entry => {
                    entry.commentCount = commentCounts[entry.id] || 0;
                    entry.isCommentsRead = true; // Marcamos como leídos para el PDF
                });
            }
        }
        
        return filteredEntries;
        
    } catch (error) {
        console.error('Error en loadAllFilteredEntries:', error);
        showNotification('❌ Error cargando datos para el PDF', 'error');
        return [];
    }
}

// Función para generar PDF grande por lotes
async function generateLargePDF(entries) {
    showNotification(`📄 Generando PDF para ${entries.length} entradas (procesando por lotes)...`, 'info');
    
    const batchSize = 100;
    const batches = Math.ceil(entries.length / batchSize);
    const pdf = new jspdf.jsPDF('l', 'mm', 'a4');
    
    for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, entries.length);
        const batch = entries.slice(start, end);
        
        showNotification(`📄 Procesando lote ${i + 1}/${batches} (${batch.length} entradas)...`, 'info');
        
        // Generar contenido del lote
        const batchHtml = generateBatchHTML(batch, start + 1);
        
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
            
            const imgData = canvas.toDataURL('image/png', 0.7);
            pdf.addImage(imgData, 'PNG', 10, 10, 277, 190);
            
        } catch (error) {
            console.error('Error en lote', i + 1, ':', error);
            // Continuar con el siguiente lote
        }
        
        // Pequeña pausa para no sobrecargar el navegador
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Descargar el PDF
    const fileName = `bitacora_${new Date().toISOString().split('T')[0]}_lote.pdf`;
    pdf.save(fileName);
    
    showNotification(`✅ PDF generado con ${entries.length} entradas en ${batches} lotes`, 'success');
}

// Función para generar HTML de un lote
function generateBatchHTML(entries, startNumber) {
    const html = `
        <div style="font-family: Arial; padding: 20px; background: white;">
            <h2 style="color: #2c3e50; margin-bottom: 20px;">
                Bitácora - Entradas ${startNumber}-${startNumber + entries.length - 1}
            </h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                <thead>
                    <tr style="background: #667eea; color: white;">
                        <th style="border: 1px solid #ddd; padding: 5px;">#</th>
                        <th style="border: 1px solid #ddd; padding: 5px;">Fecha</th>
                        <th style="border: 1px solid #ddd; padding: 5px;">Título</th>
                        <th style="border: 1px solid #ddd; padding: 5px;">Descripción</th>
                        <th style="border: 1px solid #ddd; padding: 5px;">Tipo</th>
                        <th style="border: 1px solid #ddd; padding: 5px;">Ubicación</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map((entry, index) => `
                        <tr style="${index % 2 === 0 ? 'background: #f9f9f9;' : ''}">
                            <td style="border: 1px solid #ddd; padding: 5px;">${entry.folio || startNumber + index}</td>
                            <td style="border: 1px solid #ddd; padding: 5px;">${formatearFechaLocal(entry.fecha_hora || entry.fecha)}</td>
                            <td style="border: 1px solid #ddd; padding: 5px; max-width: 150px; word-wrap: break-word;">${entry.titulo || ''}</td>
                            <td style="border: 1px solid #ddd; padding: 5px; max-width: 200px; word-wrap: break-word;">${entry.descripcion || ''}</td>
                            <td style="border: 1px solid #ddd; padding: 5px;">${entry.tipo_nota || ''}</td>
                            <td style="border: 1px solid #ddd; padding: 5px; max-width: 100px; word-wrap: break-word;">${entry.ubicacion || ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    const container = document.createElement('div');
    container.innerHTML = html;
    return container.firstElementChild;
}

// Función para descargar PDF
async function downloadPDF() {
    // Verificar que las librerías necesarias estén cargadas
    if (typeof window.jspdf === 'undefined' || typeof html2canvas === 'undefined' || !window.jspdf.jsPDF) {
        showNotification('❌ Error: Las librerías para generar PDF no están disponibles', 'error');
        return;
    }
    
    // Verificar que al menos un filtro esté aplicado
    const searchTerm = document.getElementById('searchInput').value.trim();
    const tipoFilter = document.getElementById('tipoFilter').value;
    const ubicacionFilter = document.getElementById('ubicacionFilter').value;
    const fechaInicioFilter = document.getElementById('fechaInicioFilter').value;
    const fechaFinalFilter = document.getElementById('fechaFinalFilter').value;
    
    if (!searchTerm && !tipoFilter && !ubicacionFilter && !fechaInicioFilter && !fechaFinalFilter) {
        showNotification('⚠️ Para descargar el PDF, debes aplicar al menos un filtro de búsqueda, tipo de nota, ubicación o rango de fechas', 'warning');
        return;
    }
    
    try {
        // Mostrar indicador de carga
        showNotification('📄 Generando PDF... (cargando todas las entradas filtradas)', 'info');
        
        // Obtener TODAS las entradas filtradas de la base de datos
        let filteredEntries = await loadAllFilteredEntries();
        
        // Si hay muchas entradas, procesar por lotes
        if (filteredEntries.length > 200) {
            return await generateLargePDF(filteredEntries);
        }
        
        if (tipoFilter) {
            filteredEntries = filteredEntries.filter(entry => entry.tipo_nota === tipoFilter);
        }
        
        if (ubicacionFilter) {
            filteredEntries = filteredEntries.filter(entry => entry.ubicacion === ubicacionFilter);
        }
        
        // Filtrar por rango de fechas (mismo código que filterAndDisplayEntries)
        if (fechaInicioFilter && fechaFinalFilter) {
            filteredEntries = filteredEntries.filter(entry => {
                // Debug: console.log('Entrada fecha:', entry.fecha, 'Tipo:', typeof entry.fecha);
                const entryDate = new Date(entry.fecha || entry.fecha_hora);
                const fechaInicio = new Date(fechaInicioFilter);
                const fechaFinal = new Date(fechaFinalFilter);
                
                // Extraer componentes de fecha directamente del string para evitar problemas de timezone
                const entryDateString = (entry.fecha || entry.fecha_hora).split('T')[0];
                const entryDateOnly = new Date(entryDateString + 'T00:00:00');
                const fechaInicioOnly = new Date(fechaInicioFilter + 'T00:00:00');
                const fechaFinalOnly = new Date(fechaFinalFilter + 'T23:59:59');
                
                // Debug: console.log('Comparación:', entryDateOnly.toISOString(), '>=', fechaInicioOnly.toISOString(), '&& <=', fechaFinalOnly.toISOString());
                
                return entryDateOnly >= fechaInicioOnly && entryDateOnly <= fechaFinalOnly;
            });
        } else if (fechaInicioFilter) {
            // Si solo hay fecha de inicio, filtrar desde esa fecha en adelante
            filteredEntries = filteredEntries.filter(entry => {
                const entryDate = new Date(entry.fecha || entry.fecha_hora);
                const fechaInicio = new Date(fechaInicioFilter);
                // Normalizar fechas para comparar solo el día
                const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
                const fechaInicioOnly = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), fechaInicio.getDate());
                return entryDateOnly >= fechaInicioOnly;
            });
        } else if (fechaFinalFilter) {
            // Si solo hay fecha final, filtrar hasta esa fecha (incluyendo todo el día)
            filteredEntries = filteredEntries.filter(entry => {
                const entryDate = new Date(entry.fecha || entry.fecha_hora);
                const fechaFinal = new Date(fechaFinalFilter);
                // Normalizar fechas para comparar solo el día
                const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
                const fechaFinalOnly = new Date(fechaFinal.getFullYear(), fechaFinal.getMonth(), fechaFinal.getDate());
                return entryDateOnly <= fechaFinalOnly;
            });
        }
        

        
        if (tipoFilter) {
            filteredEntries = filteredEntries.filter(entry => entry.tipo_nota === tipoFilter);
        }
        
        if (filteredEntries.length === 0) {
            showNotification('❌ No hay entradas para generar PDF', 'error');
            return;
        }
        
        // Pre-cargar todos los comentarios para las entradas filtradas
        const entriesWithComments = await Promise.all(
            filteredEntries.map(async (entry) => {
                try {
                    // Cargar comentarios de esta entrada
                    const { data: comments, error } = await supabaseClient
                        .from('comentarios')
                        .select('*')
                        .eq('bitacora_id', entry.id)
                        .order('created_at', { ascending: true });
                    
                    if (error) {
                        console.warn(`Error cargando comentarios para entrada ${entry.id}:`, error);
                        return { ...entry, comments: [] };
                    }
                    
                    if (!comments || comments.length === 0) {
                        return { ...entry, comments: [] };
                    }
                    
                    // Obtener todos los IDs de usuarios únicos de los comentarios
                    const userIds = [...new Set(comments.map(c => c.user_id))];
                    
                    // Cargar perfiles de esos usuarios
                    const { data: profiles, error: profilesError } = await supabaseClient
                        .from('profiles')
                        .select('id, email')
                        .in('id', userIds);
                    
                    if (profilesError) {
                        console.warn(`Error cargando perfiles para comentarios de entrada ${entry.id}:`, profilesError);
                        // Usar comentarios sin perfiles
                        return { ...entry, comments: comments || [] };
                    }
                    
                    // Combinar comentarios con sus perfiles
                    const commentsWithProfiles = comments.map(comment => ({
                        ...comment,
                        profiles: profiles.find(p => p.id === comment.user_id) || null
                    }));
                    
                    return { ...entry, comments: commentsWithProfiles };
                    
                } catch (error) {
                    console.warn(`Error inesperado cargando comentarios para entrada ${entry.id}:`, error);
                    return { ...entry, comments: [] };
                }
            })
        );
        
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
        
        // Crear un contenedor temporal para el PDF
        let pdfContainer = document.createElement('div');
        pdfContainer.style.cssText = `
            position: fixed;
            top: -9999px;
            left: -9999px;
            width: 210mm;
            background: white;
            padding: 10mm;
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.2;
            box-sizing: border-box;
            z-index: -9999;
        `;
        
        document.body.appendChild(pdfContainer);
        
        // Crear HTML para el PDF (método original con todas las entradas)
        let pdfHTML = `
            <div style="margin-bottom: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 12px; border-radius: 12px; width: calc(100% - 6px); box-sizing: border-box; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);">
                <div style="text-align: center; color: #ffffff; font-size: 18px; font-weight: bold; margin-bottom: 8px;">
                    📋 BITÁCORA DE OBRA
                </div>
                <div style="text-align: center; color: #f8f9fa; font-size: 11px; margin-bottom: 4px;">
                    👤 ${currentUser?.email || 'Usuario desconocido'} | 📊 ${entriesWithComments.length} entradas
                </div>
                <div style="text-align: center; color: #e8eaf6; font-size: 9px; margin-bottom: 4px;">
                    🔍 ${filtersText}
                </div>
                <div style="text-align: center; color: #c5cae9; font-size: 8px;">
                    🕐 ${new Date().toLocaleString('es-CO')}
                </div>
            </div>
            <div style="margin-bottom: 10px; width: calc(100% - 6px); box-sizing: border-box;">
                <table style="width: 100%; max-width: 100%; border-collapse: collapse; font-size: 7px; table-layout: fixed; margin: 0 auto; page-break-inside: auto;">
                    <thead>
                        <tr style="background-color: #1976d2; color: white; height: 18px;">
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 4%; font-weight: bold;">Folio</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 8%; font-weight: bold;">Fecha y Hora</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 10%; font-weight: bold;">Título</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 20%; font-weight: bold;">Descripción</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 5%; font-weight: bold;">H. Inicio</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 5%; font-weight: bold;">H. Final</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 6%; font-weight: bold;">Tipo</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 10%; font-weight: bold;">Ubicación</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 12%; font-weight: bold;">Usuario</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 20%; font-weight: bold;">Comentarios</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // Agregar filas de datos
        entriesWithComments.forEach((entry, entryIndex) => {
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
            
            // Truncar texto largo ajustado a nuevos anchos
            const titulo = (entry.titulo || '').substring(0, 60) + ((entry.titulo || '').length > 60 ? '...' : '');
            const descripcion = (entry.descripcion || '').substring(0, 120) + ((entry.descripcion || '').length > 120 ? '...' : '');
            const userEmail = (entry.profiles?.email || entry.user_id || 'Usuario desconocido'); // Sin truncar para que se vea completo
            
            // Formatear comentarios para mostrar en el PDF (completos)
            let comentariosTexto = '';
            if (entry.comments && entry.comments.length > 0) {
                comentariosTexto = entry.comments.map((comment, index) => {
                    const commentDate = new Date(comment.created_at).toLocaleString('es-CO', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    const author = comment.profiles?.email || `Usuario ${comment.user_id}`;
                    return `${index + 1}. [${commentDate}] ${author}: ${comment.comentario}`;
                }).join(' | ');
            } else {
                comentariosTexto = 'Sin comentarios';
            }
            
            const rowColor = entryIndex % 2 === 0 ? '#ffffff' : '#f8f9fa';
            const ubicacion = (entry.ubicacion || '').substring(0, 30) + ((entry.ubicacion || '').length > 30 ? '...' : '');
            pdfHTML += `
                <tr style="font-size: 7px; height: 15px; background-color: ${rowColor};">
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; font-weight: bold; color: #000000;">${entry.folio || '-'}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000;">${fechaFormateada}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000; font-weight: bold;">${titulo}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000;">${descripcion}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; overflow: hidden; color: #000000;">${entry.hora_inicio || '-'}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; overflow: hidden; color: #000000;">${entry.hora_final || '-'}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000;">${entry.tipo_nota || '-'}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000;">${ubicacion}</td>
                    <td style="border: 1px solid #bbdefb; padding: 2px; text-align: left; word-wrap: break-word; overflow: visible; color: #000000; white-space: normal;">${userEmail}</td>
                    <td style="border: 1px solid #bbdefb; padding: 2px; text-align: left; word-wrap: break-word; overflow: visible; color: #000000; white-space: normal; font-size: 6px;">${comentariosTexto}</td>
                </tr>
            `;
        });
        
        pdfHTML += `
                    </tbody>
                </table>
            </div>
            <div style="margin-top: 15px; text-align: center; color: #000000; font-size: 9px; clear: both;">
                <hr style="border: 1px solid #90caf9; margin: 5px 0;">
                Bitácora de Obra - Sistema de Registro Digital
            </div>
        `;
        
        console.log('🔍 Debug PDF - HTML generado, length:', pdfHTML.length);
        console.log('🔍 Debug PDF - entriesWithComments length:', entriesWithComments.length);
        
        pdfContainer.innerHTML = pdfHTML;
        
        console.log('🔍 Debug PDF - Container HTML asignado');
        
        // Esperar a que se renderice el contenido
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('🔍 Debug PDF - Después de renderizar');
        console.log('🔍 Debug PDF - Container scrollWidth actual:', pdfContainer.scrollWidth);
        console.log('🔍 Debug PDF - Container scrollHeight actual:', pdfContainer.scrollHeight);
        console.log('🔍 Debug PDF - Container innerHTML length:', pdfContainer.innerHTML.length);
        
        console.log('🔍 Debug PDF - Después de esperar');
        console.log('🔍 Debug PDF - Container existe:', !!pdfContainer);
        console.log('🔍 Debug PDF - Container en DOM:', !!pdfContainer.parentNode);
        
        if (!pdfContainer || !pdfContainer.parentNode) {
            console.error('❌ Error: Container no existe o no está en el DOM');
            showNotification('❌ Error: No se pudo generar el contenedor del PDF', 'error');
            return;
        }
        
        // Convertir a canvas con configuración optimizada para texto
        console.log('🔍 Debug PDF - Iniciando html2canvas...');
        const canvas = await html2canvas(pdfContainer, {
            scale:2, // Reducir escala para evitar problemas
            useCORS: true,
            allowTaint: true,
            logging: true, // Activar logging para ver qué pasa
            width: pdfContainer.scrollWidth,
            height: pdfContainer.scrollHeight,
            windowWidth: pdfContainer.scrollWidth,
            windowHeight: pdfContainer.scrollHeight,
            backgroundColor: '#ffffff'
        });
        
        console.log('🔍 Debug PDF - Canvas creado:', !!canvas);
        console.log('🔍 Debug PDF - Canvas width:', canvas.width);
        console.log('🔍 Debug PDF - Canvas height:', canvas.height);
        
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
            console.error('❌ Error: Canvas vacío o inválido');
            showNotification('❌ Error: No se pudo generar el contenido del PDF', 'error');
            return;
        }
        
        const imgData = canvas.toDataURL('image/png');
        console.log('🔍 Debug PDF - imgData generado, length:', imgData.length);
        
        // Crear PDF con paginación automática
        const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');  // 'p' = portrait (vertical)
        
        const imgWidth = 210;  // Ancho de página A4 en vertical
        const pageHeight = 297;  // Alto de página A4 en vertical
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        // Agregar la primera página
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        // Agregar páginas adicionales si es necesario
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        
        // Limpiar el contenedor
        document.body.removeChild(pdfContainer);

        
        // Limpiar el contenedor si existe
        if (pdfContainer && pdfContainer.parentNode) {
            document.body.removeChild(pdfContainer);
        }
        pdfContainer = null;
        
        // Generar nombre de archivo con fecha
        const fechaArchivo = new Date().toISOString().split('T')[0];
        const nombreArchivo = `bitacora_${fechaArchivo}.pdf`;
        
        // Descargar el PDF
        try {
            // Guardar directamente
            pdf.save(nombreArchivo);
            console.log('✅ PDF guardado exitosamente como:', nombreArchivo);
            
            // Pequeña espera para asegurar que el archivo se guarde
            await new Promise(resolve => setTimeout(resolve, 500));
            
            showNotification('✅ PDF generado y descargado exitosamente', 'success');
            
        } catch (saveError) {
            console.error('Error al guardar PDF con pdf.save():', saveError);
            
            // Método 2: Alternativa usando blob y descarga manual
            try {
                console.log('🔄 Intentando método alternativo de descarga...');
                
                // Convertir PDF a blob
                const pdfBlob = pdf.output('blob');
                
                // Crear URL temporal
                const blobUrl = URL.createObjectURL(pdfBlob);
                
                // Crear enlace de descarga
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = nombreArchivo;
                downloadLink.style.display = 'none';
                
                // Agregar al DOM, hacer clic y limpiar
                document.body.appendChild(downloadLink);
                downloadLink.click();
                
                // Esperar un poco antes de limpiar
                setTimeout(() => {
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(blobUrl);
                }, 100);
                
                console.log('✅ PDF descargado con método alternativo');
                
                // Limpiar referencias
                if (pdfContainer && pdfContainer.parentNode) {
                    pdfContainer.parentNode.removeChild(pdfContainer);
                }
                pdfContainer = null;
                
                showNotification('✅ PDF generado y descargado exitosamente', 'success');
                
            } catch (alternativeError) {
                console.error('Error también con método alternativo:', alternativeError);
                
                // Método 3: Abrir en nueva pestaña como último recurso
                try {
                    console.log('🔄 Intentando abrir en nueva pestaña...');
                    
                    const pdfDataUri = pdf.output('datauristring');
                    const newWindow = window.open(pdfDataUri, '_blank');
                    
                    if (newWindow) {
                        console.log('✅ PDF abierto en nueva pestaña');
                        showNotification('📄 PDF abierto en nueva pestaña - guarda manualmente', 'info');
                    } else {
                        throw new Error('No se pudo abrir nueva pestaña');
                    }
                    
                } catch (finalError) {
                    console.error('Error con todos los métodos:', finalError);
                    showNotification('❌ No se pudo descargar el PDF - intenta de nuevo', 'error');
                }
                
            }
        }
        
    } catch (error) {
        console.error('Error al generar PDF:', error);
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
const manageUsersBtn = document.getElementById('manageUsersBtn');
if (manageUsersBtn) {
    manageUsersBtn.addEventListener('click', function() {
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

document.getElementById('generateCodeForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const role = document.getElementById('codeRole').value;
    const expiration = parseInt(document.getElementById('codeExpiration').value) || 48;
    
    if (!role) {
        showNotification('❌ Por favor selecciona un rol', 'error');
        return;
    }
    
    try {
        showNotification('✨ Generando código...', 'info');
        
        const { data: code, error: codeError } = await supabaseClient
            .rpc('generate_invitation_code', {
                p_role: role,
                p_expires_hours: expiration
            });
        
        if (codeError) throw codeError;
        
        document.getElementById('generatedCode').textContent = code;
        document.getElementById('generatedCodeResult').style.display = 'block';
        
        showNotification('✅ Código generado exitosamente: ' + code, 'success');
        
        document.getElementById('codeRole').value = '';
        
        setTimeout(loadInvitationCodes, 500);
        
    } catch (error) {
        console.error('Error generando código:', error);
        showNotification('❌ Error al generar código: ' + error.message, 'error');
    }
});

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

document.getElementById('registerWithCodeForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const code = document.getElementById('registerInvitationCode').value.trim().toUpperCase();
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
    
    try {
        showNotification('📝 Registrando usuario...', 'info');
        
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password
        });
        
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
});