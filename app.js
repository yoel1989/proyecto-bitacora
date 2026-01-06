// Supabase client está configurado en config.js
// Asegúrate de que config.js se cargue antes que app.js

// Importar servicio de email (solo en servidor)
// const { notificarATodosUsuarios } = require('./email-service.js');

let currentUser = null;
let allEntries = [];
let currentPage = 1;
const ENTRIES_PER_PAGE = 50;
let isLoadingEntries = false;
let totalEntries = 0;
let commentFiles = []; // Archivos para el comentario principal
let replyFiles = {}; // Archivos para respuestas (key: commentId)

// Sistema de notificaciones en tiempo real
let notificationSubscription = null;
let notificationChannel = null;

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
        
        console.log(`✅ ${usuarios.length} notificaciones enviadas`);
        
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
        entry_status: entrada.estado,
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
        console.log(`✅ Email enviado a: ${usuario.email}`);
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
            // Usar email del perfil si existe, sino el del auth
            const displayEmail = data.email || userEmail;
            document.getElementById('userName').textContent = displayEmail;
            document.getElementById('userRole').textContent = '(' + getRoleDisplayName(data.rol) + ')';
        } else {
            currentUser.role = 'contratista'; // Rol por defecto
            document.getElementById('userRole').textContent = '(' + getRoleDisplayName('contratista') + ')';
        }
    } catch (error) {
        // Si hay error, asegurar que el email se muestre igual
        const userEmail = currentUser.email || 'Usuario desconocido';
        document.getElementById('userName').textContent = userEmail;
        currentUser.role = 'contratista';
        document.getElementById('userRole').textContent = '(' + getRoleDisplayName('contratista') + ')';
        console.warn('Error cargando perfil, usando datos por defecto:', error.message);
    }
}

// Funciones del formulario
function showForm() {
    const formSection = document.getElementById('formSection');
    const entriesSection = document.querySelector('.entries-section');
    
    // Ocultar entradas y mostrar formulario
    entriesSection.style.display = 'none';
    formSection.style.display = 'block';
    
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
    
    // Mostrar entradas y ocultar formulario
    formSection.style.display = 'none';
    entriesSection.style.display = 'block';
    form.reset();
    delete form.dataset.editId;
    delete form.dataset.existingPhotos;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Guardar Entrada';
    submitBtn.classList.remove('update-mode');
    
    // Limpiar preview y reset de fotos
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('photoPreviewGrid').innerHTML = '';
    
    // Ocultar advertencia de actualización
    const updateWarning = document.getElementById('updateWarning');
    if (updateWarning) {
        updateWarning.style.display = 'none';
    }
    
    // Resetear checkbox
    const keepPhotosCheckbox = document.getElementById('keepPhotosCheckbox');
    if (keepPhotosCheckbox) {
        keepPhotosCheckbox.checked = true;
    }
}

// Guardar entrada
async function handleBitacoraSubmit(e) {
    e.preventDefault();
    
    const form = document.getElementById('bitacoraForm');
    const editId = form.dataset.editId;
    const keepPhotosCheckbox = document.getElementById('keepPhotosCheckbox');
    
    const fotoFiles = document.getElementById('fotos').files;
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
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                ];
                
                if (!validTypes.includes(file.type)) {
                    console.error('Tipo de archivo no permitido:', file.type);
                    alert(`El archivo "${file.name}" no es un tipo permitido. Tipos permitidos: imágenes (JPG, PNG, GIF), PDF, Word, Excel, PowerPoint`);
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
    } else {
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
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                ];
                
                if (!validTypes.includes(file.type)) {
                    console.error('Tipo de archivo no permitido:', file.type);
                    alert(`El archivo "${file.name}" no es un tipo permitido. Tipos permitidos: imágenes (JPG, PNG, GIF), PDF, Word, Excel, PowerPoint`);
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
        estado: document.getElementById('estado').value,
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
        console.log('✅ Entrada guardada exitosamente');
        
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
        
        // Cargar emails de usuarios inmediatamente
        if (bitacoraData.length > 0) {
            console.log('📧 Iniciando carga de emails para', processedEntries.length, 'entradas');
            await loadUserEmailsInBackground(processedEntries);
        }
        
        // Actualizar UI después de cargar emails
        console.log('🔄 Actualizando UI final');
        filterAndDisplayEntries();
        
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
        console.log('🔍 IDs de usuarios encontrados:', userIds);
        
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
            
            // Actualizar la vista solo si hubo cambios
            if (updatedAny) {
                // Actualizar el array global allEntries con los datos modificados
                allEntries = entries;
                console.log('🔄 Llamando a filterAndDisplayEntries...');
                filterAndDisplayEntries();
                console.log('✅ Vista actualizada con emails correctos');
            } else {
                console.log('ℹ️ No se actualizaron emails, llamando filterAndDisplayEntries igualmente');
                filterAndDisplayEntries();
            }
        } else {
            console.log('ℹ️ No hay IDs de usuarios para procesar');
        }
    } catch (error) {
        console.error('❌ Error cargando emails:', error);
    }
}

// Filtrar y mostrar entradas con debounce para mejor rendimiento
function filterAndDisplayEntries() {
    let filteredEntries = [...allEntries];
    
    // Filtrar por búsqueda (ahora busca en todos los campos)
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (searchTerm) {
        filteredEntries = filteredEntries.filter(entry => {
            const searchFields = [
                entry.titulo,
                entry.descripcion,
                entry.tipo_nota,
                entry.ubicacion,
                entry.estado,
                entry.hora_inicio,
                entry.hora_final,
                entry.folio,
                entry.profiles?.email,
                entry.user_id
            ].filter(field => field); // Filtrar campos nulos/undefined
            
            return searchFields.some(field => 
                field.toLowerCase().includes(searchTerm)
            );
        });
    }
    
    // Filtrar por estado
    const estadoFilter = document.getElementById('estadoFilter').value;
    if (estadoFilter) {
        filteredEntries = filteredEntries.filter(entry => entry.estado === estadoFilter);
    }
    
    // Filtrar por tipo de nota
    const tipoFilter = document.getElementById('tipoFilter').value;
    if (tipoFilter) {
        filteredEntries = filteredEntries.filter(entry => entry.tipo_nota === tipoFilter);
    }
    
    // Filtrar por fecha
    const fechaFilter = document.getElementById('fechaFilter').value;
    if (fechaFilter) {
        filteredEntries = filteredEntries.filter(entry => {
            const entryDate = new Date(entry.fecha || entry.fecha_hora).toISOString().split('T')[0];
            return entryDate === fechaFilter;
        });
    }
    
    displayEntries(filteredEntries);
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

// Función para actualizar contadores de comentarios en los botones
async function updateCommentCounts(entries) {
    try {
        // Actualizar contadores para todas las entradas
        const entriesWithCounts = await Promise.all(
            entries.map(async (entry) => {
                const commentCount = await countComments(entry.id);
                return { ...entry, commentCount };
            })
        );
        
        // Actualizar los botones en el DOM
        entriesWithCounts.forEach(entry => {
            // Actualizar botones en versión desktop (tabla)
            const desktopButtons = document.querySelectorAll(`.comments-btn[onclick*="${entry.id}"]`);
            desktopButtons.forEach(btn => {
                const countSpan = btn.querySelector('.comment-count');
                if (countSpan) {
                    countSpan.textContent = entry.commentCount;
                    countSpan.style.display = entry.commentCount > 0 ? 'inline-block' : 'none';
                }
            });
            
            // Actualizar botones en versión móvil (cards)
            const mobileButtons = document.querySelectorAll(`.mobile-comments-btn[onclick*="${entry.id}"]`);
            mobileButtons.forEach(btn => {
                const countSpan = btn.querySelector('.comment-count');
                if (countSpan) {
                    countSpan.textContent = entry.commentCount;
                    countSpan.style.display = entry.commentCount > 0 ? 'inline-block' : 'none';
                }
            });
        });
        
    } catch (error) {
        console.error('Error actualizando contadores de comentarios:', error);
    }
}

// Cargar más entradas (paginación infinita)
async function loadMoreEntries() {
    if (isLoadingEntries || allEntries.length >= totalEntries) return;
    
    currentPage++;
    await loadBitacoraEntries(currentPage, true);
}

// Mostrar entradas con renderizado optimizado
function displayEntries(entries, append = false) {
    const entriesList = document.getElementById('entriesList');
    
    if (!append) {
        entriesList.innerHTML = '';
    }
    
    // Actualizar contador
    updateEntriesCounter(entries);
    
    if (!entries || entries.length === 0) {
        if (!append) {
            entriesList.innerHTML = '<p>No hay entradas de bitácora aún.</p>';
        }
        return;
    }

    // Detectar si es móvil y mostrar el formato apropiado (cacheado para mejor rendimiento)
    const isMobile = window.innerWidth <= 768;
    
    // Crear fragmento para mejor rendimiento
    const fragment = document.createDocumentFragment();
    
    if (isMobile) {
        // Versión móvil: cards con botones en columna
        entries.forEach(entry => {
            const card = createMobileEntryCard(entry);
            fragment.appendChild(card);
        });
    } else {
        // Versión desktop: tabla normal
        const table = createDesktopTable(entries);
        fragment.appendChild(table);
    }
    
    // Agregar todo de una sola vez para mejor rendimiento
    entriesList.appendChild(fragment);
    
    // Inicializar lazy loading para imágenes después de renderizar
    setTimeout(initializeLazyLoading, 100);
}

// Crear tarjeta móvil con lazy loading
function createMobileEntryCard(entry) {
    const card = document.createElement('div');
    card.className = 'mobile-entry-card';
    card.setAttribute('data-entry-id', entry.id); // Para actualizaciones en tiempo real
    
    // Formatear fecha con zona horaria local
    const fechaFormateada = formatearFechaLocal(entry.fecha_hora || entry.fecha);
    
    // Crear archivos HTML para móvil
    const archivos = entry.archivos || entry.fotos || []; // Mantener compatibilidad
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
        
        if (archivos.length > 5) {
            archivosHtml += `
                <span class="mobile-more-photos" onclick="showAllArchivos('${entry.id}')">
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
    actionButtons += `
        <button class="mobile-action-btn mobile-comments-btn" onclick="openCommentsModal(${entry.id})" title="Ver y responder comentarios">
            💬 Comentar <span class="comment-count">0</span>
        </button>
    `;
    
    // Admin puede editar y eliminar cualquier entrada
    if (currentUser.role === 'admin') {
        actionButtons += `
            <button class="mobile-action-btn mobile-edit-btn" onclick="editEntry(${entry.id})">✏️ Editar</button>
            <button class="mobile-action-btn mobile-delete-btn" onclick="deleteEntry(${entry.id})">🗑️ Eliminar</button>
        `;
    } 
    // Otros roles (interventoria, supervision, ordenador_gasto, contratista) solo pueden editar sus propias entradas
    else if (entry.user_id === currentUser.id) {
        actionButtons += `
            <button class="mobile-action-btn mobile-edit-btn" onclick="editEntry(${entry.id})">✏️ Editar</button>
        `;
    }
    
    card.innerHTML = `
        <div class="mobile-entry-header">
            <div class="mobile-entry-date">
                <strong>Folio: ${entry.folio || '-'}</strong><br>
                ${fechaFormateada}
            </div>
            <span class="entry-state state-${entry.estado}">${entry.estado}</span>
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
    const table = document.createElement('table');
    table.className = 'excel-table desktop-table';
    
    // Header
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
            <th>Estado</th>
            <th>Usuario</th>
            <th>Fotos</th>
            <th>Acciones</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    entries.forEach(entry => {
        const row = document.createElement('tr');
        row.setAttribute('data-entry-id', entry.id); // Para actualizaciones en tiempo real
        
        let archivosHtml = '';
        const archivos = entry.archivos || entry.fotos || []; // Mantener compatibilidad con datos antiguos
        
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
            
            if (archivos.length > 3) {
                archivosHtml += `
                    <span class="more-photos" onclick="showAllArchivos('${entry.id}')" title="Ver todos los archivos">
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
            <button class="comments-btn" onclick="openCommentsModal(${entry.id})" title="Ver y responder comentarios">
                💬 Comentar <span class="comment-count">0</span>
            </button>
        `;
        
        // Admin puede editar y eliminar cualquier entrada
        if (currentUser.role === 'admin') {
            actionButtons += `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️ Editar</button>
                <button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️ Eliminar</button>
            `;
        } 
        // Otros roles (interventoria, supervision, ordenador_gasto, contratista) solo pueden editar sus propias entradas
        else if (entry.user_id === currentUser.id) {
            actionButtons += `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️ Editar</button>
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
            <td><span class="entry-state state-${entry.estado}">${entry.estado}</span></td>
            <td>${entry.profiles?.email || entry.user_id || 'Usuario desconocido'}</td>
            <td>${archivosHtml}</td>
            <td>${actionButtons}</td>
        `;
        
        row.dataset.archivos = JSON.stringify(entry.archivos || entry.fotos || []);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    return table;
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
    
    const ubicacionTextarea = document.getElementById('ubicacion');
    ubicacionTextarea.value = data.ubicacion || '';
    autoResize(ubicacionTextarea);
    
    document.getElementById('estado').value = data.estado;
    
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

// Eliminar entrada
async function deleteEntry(entryId) {
    if (confirm('⚠️ ¿Estás seguro de que quieres eliminar esta entrada?\n\nEsta acción no se puede deshacer y se perderán todos los datos asociados.')) {
        try {
            const { error } = await supabaseClient
                .from('bitacora')
                .delete()
                .eq('id', entryId);
            
            if (error) {
                showNotification('❌ Error al eliminar la entrada', 'error');
            } else {
                // Recargar la página actual para mantener paginación
                await loadBitacoraEntries(currentPage, false);
                showNotification('✅ Entrada eliminada exitosamente', 'success');
            }
        } catch (err) {
            showNotification('❌ Ocurrió un error inesperado', 'error');
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
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        
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

document.getElementById('ubicacion')?.addEventListener('DOMContentLoaded', function() {
    setupTextarea(document.getElementById('ubicacion'));
});

// Configurar inmediatamente si ya están cargados
if (document.getElementById('titulo')) {
    setupTextarea(document.getElementById('titulo'));
}
if (document.getElementById('descripcion')) {
    setupTextarea(document.getElementById('descripcion'));
}
if (document.getElementById('ubicacion')) {
    setupTextarea(document.getElementById('ubicacion'));
}

// Preview de archivos
document.getElementById('fotos')?.addEventListener('change', function(e) {
    const files = e.target.files;
    const preview = document.getElementById('photoPreview');
    const grid = document.getElementById('photoPreviewGrid');
    const form = document.getElementById('bitacoraForm');
    const isEditMode = form.dataset.editId;
    
    if (files.length > 0) {
        preview.style.display = 'block';
        grid.innerHTML = '';
        
        Array.from(files).forEach((file, index) => {
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
        
        // Si estamos en modo edición, actualizar el texto informativo
        const fileInfo = preview.querySelector('.file-info');
        if (isEditMode && fileInfo) {
            const keepPhotosCheckbox = document.getElementById('keepPhotosCheckbox');
            if (keepPhotosCheckbox && keepPhotosCheckbox.checked) {
                fileInfo.textContent = `ℹ️ ${files.length} archivos nuevos se agregarán a los existentes`;
            } else {
                fileInfo.textContent = `⚠️ ${files.length} archivos nuevos reemplazarán los existentes`;
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
document.getElementById('estadoFilter')?.addEventListener('change', filterAndDisplayEntries);
document.getElementById('tipoFilter')?.addEventListener('change', filterAndDisplayEntries);
document.getElementById('fechaFilter')?.addEventListener('change', filterAndDisplayEntries);
document.getElementById('downloadPdf')?.addEventListener('click', downloadPDF);
document.getElementById('clearFilters')?.addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('estadoFilter').value = '';
    document.getElementById('tipoFilter').value = '';
    document.getElementById('fechaFilter').value = '';
    document.getElementById('photosPreview').style.display = 'none';
    currentPage = 1; // Resetear paginación
    loadBitacoraEntries(1, false);
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
    try {
        // Suscribirse a cambios en la tabla bitacora
        notificationSubscription = supabaseClient
            .channel('bitacora_changes')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'bitacora' 
                }, 
                handleRealtimeNotification
            )
            .subscribe();
            
        console.log('✅ Sistema de notificaciones en tiempo real activado');
        
    } catch (error) {
        console.error('❌ Error al inicializar notificaciones en tiempo real:', error);
        showNotification('⚠️ Las notificaciones en tiempo real no están disponibles', 'warning');
    }
}

// Manejar notificaciones en tiempo real
async function handleRealtimeNotification(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    try {
        // Obtener información del usuario que hizo el cambio
        const userInfo = await getUserInfo(newRecord.user_id || oldRecord.user_id);
        
        let message = '';
        let type = 'info';
        
        if (eventType === 'INSERT') {
            message = `📝 Nueva entrada creada por ${userInfo.email}`;
            type = 'success';
            
            // Si no somos nosotros, mostrar notificación más prominente
            if (newRecord.user_id !== currentUser.id) {
                showNotification(message, type, 5000);
                
                // Opcional: Actualizar la lista automáticamente
                if (document.visibilityState === 'visible') {
                    await loadBitacoraEntries(1, false);
                }
            }
            
        } else if (eventType === 'UPDATE') {
            message = `✏️ Entrada actualizada por ${userInfo.email}`;
            type = 'info';
            
            // Si no somos nosotros, mostrar notificación
            if (newRecord.user_id !== currentUser.id) {
                showNotification(message, type, 4000);
                
                // Actualizar la entrada específica si estamos viendo la lista
                updateEntryInList(newRecord);
            }
            
        } else if (eventType === 'DELETE') {
            message = `🗑️ Entrada eliminada por ${userInfo.email}`;
            type = 'warning';
            
            if (oldRecord.user_id !== currentUser.id) {
                showNotification(message, type, 4000);
                
                // Remover la entrada de la lista
                removeEntryFromList(oldRecord.id);
            }
        }
        
        // Actualizar contador de notificaciones no leídas
        updateNotificationBadge();
        
    } catch (error) {
        console.error('Error procesando notificación en tiempo real:', error);
    }
}

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
    
    if (stateElement) {
        stateElement.textContent = entry.estado;
        stateElement.className = `entry-state state-${entry.estado}`;
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
    if (cells[7]) cells[7].innerHTML = `<span class="entry-state state-${entry.estado}">${entry.estado}</span>`; // Estado
    
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

// Abrir modal de comentarios
function openCommentsModal(bitacoraId) {
    currentBitacoraId = bitacoraId;
    
    // Mostrar información del usuario actual
    const commentUserName = document.getElementById('commentUserName');
    commentUserName.textContent = currentUser.email || 'Usuario';
    
    // Limpiar textarea
    document.getElementById('newComment').value = '';
    
    // Mostrar modal
    const modal = document.getElementById('commentsModal');
    modal.style.display = 'flex';
    
    // Cargar comentarios (usar versión simple temporalmente para debug)
    loadComments(bitacoraId);
    
    // Suscribirse a cambios en tiempo real de comentarios
    subscribeToComments(bitacoraId);
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
    try {
        console.log('🔍 Cargando comentarios para bitácora:', bitacoraId);
        
        // Cargar todos los comentarios de esta bitácora
        const { data: allComments, error: commentsError } = await supabaseClient
            .from('comentarios')
            .select('*')
            .eq('bitacora_id', bitacoraId)
            .order('created_at', { ascending: true });
        
        if (commentsError) {
            console.error('Error cargando comentarios:', commentsError);
            showNotification('❌ Error al cargar los comentarios: ' + commentsError.message, 'error');
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
        
        // Combinar comentarios y respuestas con sus perfiles
        const commentsWithProfiles = commentsWithReplies.map(comment => ({
            ...comment,
            profiles: profiles.find(p => p.id === comment.user_id) || null,
            replies: comment.replies.map(reply => ({
                ...reply,
                profiles: profiles.find(p => p.id === reply.user_id) || null
            }))
        }));
        
        console.log('🔍 Respuesta comentarios con perfiles y respuestas:', commentsWithProfiles);
        displayComments(commentsWithProfiles);
        
    } catch (error) {
        console.error('Error inesperado cargando comentarios:', error);
        showNotification('❌ Error al cargar los comentarios', 'error');
    }
}

// Mostrar comentarios en el modal
function displayComments(comments) {
    const commentsList = document.getElementById('commentsList');
    
    console.log('🔍 Mostrando comentarios:', comments);
    
    if (!comments || comments.length === 0) {
        commentsList.innerHTML = '<p class="no-comments">Aún no hay comentarios. ¡Sé el primero en comentar!</p>';
        console.log('🔍 No hay comentarios para mostrar');
        return;
    }
    
    console.log('🔍 Procesando', comments.length, 'comentarios');
    
    let commentsHtml = '';
    comments.forEach(comment => {
        console.log('🔍 Procesando comentario:', comment);
        
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
                                const icon = getFileIcon(file.name);
                                
                                return `
                                    <div class="comment-file-item" onclick="downloadCommentFile('${file.url}', '${file.name}')">
                                        ${isImage ? 
                                            `<img src="${file.url}" alt="${file.name}" class="comment-file-thumbnail" />` :
                                            `<div class="comment-file-icon-large">${icon}</div>`
                                        }
                                        <div class="comment-file-info">
                                            <div class="comment-file-name-display">${file.name}</div>
                                            <div class="comment-file-size-display">${formatFileSize(file.size)}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
                <div class="comment-actions-row">
                    <button class="comment-reply-btn" onclick="replyToComment(${comment.id}, '${userEmail.replace(/'/g, "\\'")}')">
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
    
    console.log('🔍 HTML generado:', commentsHtml);
    commentsList.innerHTML = commentsHtml;
}

// Manejar selección de archivos para comentarios
function handleCommentFilesChange(e) {
    const files = e.target.files;
    console.log('🔍 Archivos seleccionados:', files);
    
    if (files.length > 0) {
        commentFiles = Array.from(files);
        displayCommentFilesPreview(files);
    } else {
        commentFiles = [];
        hideCommentFilesPreview();
    }
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

// Subir archivos al almacenamiento
async function uploadCommentFiles(files, commentId) {
    if (!files || files.length === 0) return [];
    
    const uploadedFiles = [];
    
    for (const file of files) {
        try {
            // Generar nombre único
            const fileExt = file.name.split('.').pop();
            const fileName = `comentario_${commentId}_${Date.now()}.${fileExt}`;
            const filePath = `comentarios/${fileName}`;
            
            // Subir a Supabase Storage
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
        const uploadedFiles = await uploadCommentFiles(commentFiles);
        
        // Luego insertar el comentario con los archivos
        const { data, error } = await supabaseClient
            .from('comentarios')
            .insert({
                bitacora_id: currentBitacoraId,
                user_id: currentUser.id,
                comentario: commentText,
                archivos: uploadedFiles
            })
            .select()
            .single();
        
        console.log('🔍 Respuesta INSERT:', { data, error });
        
        if (error) {
            console.error('Error guardando comentario:', error);
            showNotification('❌ Error al guardar el comentario: ' + error.message, 'error');
            return;
        }
        
        // Limpiar textarea y archivos
        document.getElementById('newComment').value = '';
        document.getElementById('commentFiles').value = '';
        commentFiles = [];
        hideCommentFilesPreview();
        
        // Mostrar notificación
        showNotification('✅ Comentario enviado exitosamente', 'success');
        
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
function replyToComment(commentId, authorName) {
    console.log('🔍 Respondiendo al comentario:', commentId, 'de:', authorName);
    
    const replySection = document.getElementById(`reply-section-${commentId}`);
    const replyTextarea = document.getElementById(`reply-textarea-${commentId}`);
    
    // Ocultar otras secciones de respuesta
    document.querySelectorAll('.reply-section').forEach(section => {
        if (section.id !== `reply-section-${commentId}`) {
            section.style.display = 'none';
        }
    });
    
    // Mostrar la sección de respuesta
    replySection.style.display = 'block';
    
    // Prepend al textarea el nombre del autor
    replyTextarea.value = `@${authorName} `;
    replyTextarea.focus();
    replyTextarea.setSelectionRange(replyTextarea.value.length, replyTextarea.value.length);
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
    } catch (error) {
        console.error('Error procesando cambio en tiempo real de comentario:', error);
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

// Función para descargar PDF
async function downloadPDF() {
    // Verificar que las librerías necesarias estén cargadas
    if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
        showNotification('❌ Error: Las librerías para generar PDF no están disponibles', 'error');
        return;
    }
    
    try {
        // Mostrar indicador de carga
        showNotification('📄 Generando PDF...', 'info');
        
        // Obtener las entradas filtradas actuales
        let filteredEntries = [...allEntries];
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const estadoFilter = document.getElementById('estadoFilter').value;
        const tipoFilter = document.getElementById('tipoFilter').value;
        const fechaFilter = document.getElementById('fechaFilter').value;
        
        // Aplicar filtros (mismo código que filterAndDisplayEntries)
        if (searchTerm) {
            filteredEntries = filteredEntries.filter(entry => {
                const searchFields = [
                    entry.titulo,
                    entry.descripcion,
                    entry.tipo_nota,
                    entry.ubicacion,
                    entry.estado,
                    entry.hora_inicio,
                    entry.hora_final,
                    entry.folio,
                    entry.profiles?.email,
                    entry.user_id
                ].filter(field => field);
                
                return searchFields.some(field => 
                    field.toLowerCase().includes(searchTerm)
                );
            });
        }
        
        if (estadoFilter) {
            filteredEntries = filteredEntries.filter(entry => entry.estado === estadoFilter);
        }
        
        if (tipoFilter) {
            filteredEntries = filteredEntries.filter(entry => entry.tipo_nota === tipoFilter);
        }
        
        if (fechaFilter) {
            filteredEntries = filteredEntries.filter(entry => {
                const entryDate = new Date(entry.fecha || entry.fecha_hora).toISOString().split('T')[0];
                return entryDate === fechaFilter;
            });
        }
        
        if (filteredEntries.length === 0) {
            showNotification('❌ No hay entradas para generar PDF', 'error');
            return;
        }
        
        // Crear un contenedor temporal para el PDF
        const pdfContainer = document.createElement('div');
        pdfContainer.style.cssText = `
            position: fixed;
            top: -9999px;
            left: -9999px;
            width: 190mm;
            background: white;
            padding: 15px;
            font-family: Arial, sans-serif;
            font-size: 8px;
            margin: 0;
            text-align: center;
            box-sizing: border-box;
        `;
        
        // Generar encabezado
        let filtersInfo = [];
        if (searchTerm) filtersInfo.push(`Búsqueda: "${searchTerm}"`);
        if (estadoFilter) filtersInfo.push(`Estado: ${estadoFilter}`);
        if (tipoFilter) filtersInfo.push(`Tipo: ${tipoFilter}`);
        if (fechaFilter) filtersInfo.push(`Fecha: ${fechaFilter}`);
        
        const filtersText = filtersInfo.length > 0 ? filtersInfo.join(' | ') : 'Todos los registros';
        
        // Crear HTML para el PDF
        let pdfHTML = `
            <div style="margin-bottom: 15px; background-color: #e3f2fd; padding: 8px; border: 2px solid #1976d2; border-radius: 8px; width: calc(100% - 6px); box-sizing: border-box;">
                <h1 style="text-align: center; color: #000000; margin: 5px 0; font-size: 14px; font-weight: bold;">📋 Bitácora de Obra</h1>
                <div style="text-align: center; color: #000000; margin: 5px 0; font-size: 11px;">
                    📅 Generado: ${new Date().toLocaleString('es-CO')}<br>
                    👤 Usuario: ${currentUser.email}<br>
                    🔍 Filtros: ${filtersText}<br>
                    📊 Total: ${filteredEntries.length} entradas
                </div>
                <hr style="border: 1px solid #90caf9; margin: 10px 0;">
            </div>
        `;
        
        // Crear tabla para el PDF - formato vertical centrado y ajustado
        pdfHTML += `
            <div style="width: calc(100% - 6px); overflow: hidden; margin: 0 auto;">
                <table style="width: 100%; max-width: 100%; border-collapse: collapse; font-size: 8px; table-layout: fixed; margin: 0 auto; page-break-inside: auto;">
                    <thead>
                        <tr style="background-color: #1976d2; color: white; height: 20px;">
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 4%; font-weight: bold;">Folio</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 8%; font-weight: bold;">Fecha y Hora</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 10%; font-weight: bold;">Título</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 25%; font-weight: bold;">Descripción</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 5%; font-weight: bold;">H. Inicio</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 5%; font-weight: bold;">H. Final</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 7%; font-weight: bold;">Tipo</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 6%; font-weight: bold;">Estado</th>
                            <th style="border: 1px solid #0d47a1; padding: 1px; text-align: center; width: 13%; font-weight: bold;">Usuario</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // Agregar filas de datos
        filteredEntries.forEach(entry => {
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
            
            // Combinar horas en una sola columna para ahorrar espacio
            const horas = `${entry.hora_inicio || '-'} ${entry.hora_inicio && entry.hora_final ? '-' : ''} ${entry.hora_final || ''}`;
            const horasFin = entry.hora_final || '-';
            
            // Truncar texto largo ajustado a nuevos anchos - sin truncar email
            const titulo = (entry.titulo || '').substring(0, 60) + ((entry.titulo || '').length > 60 ? '...' : '');
            const descripcion = (entry.descripcion || '').substring(0, 80) + ((entry.descripcion || '').length > 80 ? '...' : '');
            const userEmail = (entry.profiles?.email || entry.user_id || 'Usuario desconocido'); // Sin truncar para que se vea completo
            
            const rowColor = filteredEntries.indexOf(entry) % 2 === 0 ? '#ffffff' : '#f8f9fa';
            pdfHTML += `
                <tr style="font-size: 8px; height: 16px; background-color: ${rowColor};">
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; font-weight: bold; color: #000000;">${entry.folio || '-'}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000;">${fechaFormateada}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000; font-weight: bold;">${titulo}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000;">${descripcion}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; overflow: hidden; color: #000000;">${entry.hora_inicio || '-'}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; overflow: hidden; color: #000000;">${entry.hora_final || '-'}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; word-wrap: break-word; overflow: hidden; color: #000000;">${entry.tipo_nota || '-'}</td>
                    <td style="border: 1px solid #bbdefb; padding: 1px; text-align: center; overflow: hidden; color: #000000;">${entry.estado || ''}</td>
                    <td style="border: 1px solid #bbdefb; padding: 2px; text-align: left; word-wrap: break-word; overflow: visible; color: #000000; white-space: normal;">${userEmail}</td>
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
        
        pdfContainer.innerHTML = pdfHTML;
        document.body.appendChild(pdfContainer);
        
        // Forzar un pequeño retraso para que los estilos se apliquen completamente
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Generar PDF usando html2canvas y jsPDF - orientación vertical
        let canvas;
        try {
            canvas = await html2canvas(pdfContainer, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',  // Fondo blanco profesional
                logging: false,
                width: 740,  // Ancho con bordes
                height: Math.max(1000, filteredEntries.length * 20 + 250),  // Altura dinámica
                scrollX: 0,
                scrollY: 0,
                allowTaint: true,
                useCORS: true,
                letterRendering: true,
                timeout: 10000  // Timeout de 10 segundos
            });
            console.log('✅ Canvas generado exitosamente');
        } catch (canvasError) {
            console.error('Error generando canvas:', canvasError);
            throw new Error('Error al generar la imagen del PDF: ' + canvasError.message);
        }
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jspdf.jsPDF('p', 'mm', 'a4');  // 'p' = portrait (vertical)
        
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
        
        // Generar nombre de archivo con fecha
        const fechaArchivo = new Date().toISOString().split('T')[0];
        const nombreArchivo = `bitacora_${fechaArchivo}.pdf`;
        
        // Descargar el PDF - método alternativo para evitar errores
        try {
            // Método 1: Intentar guardar directamente
            pdf.save(nombreArchivo);
            console.log('✅ PDF guardado exitosamente como:', nombreArchivo);
            
            // Pequeña espera para asegurar que el archivo se guarde
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Limpiar referencias para evitar memory leaks
            if (pdfContainer && pdfContainer.parentNode) {
                pdfContainer.parentNode.removeChild(pdfContainer);
            }
            pdfContainer = null;
            
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
                
                // Limpiar referencias en todos los casos
                if (pdfContainer && pdfContainer.parentNode) {
                    pdfContainer.parentNode.removeChild(pdfContainer);
                }
                pdfContainer = null;
            }
        }
        
    } catch (error) {
        console.error('Error al generar PDF:', error);
        console.error('Detalles del error:', error.message, error.stack);
        
        // Verificar si el error es crítico o solo una advertencia
        if (error.message && error.message.includes('PDF generado exitosamente')) {
            // Si el PDF se generó pero hay un error menor, no mostrar error
            showNotification('✅ PDF generado exitosamente', 'success');
        } else {
            showNotification('❌ Error al generar PDF: ' + (error.message || 'Error desconocido'), 'error');
        }
        
        // Limpiar el contenedor si existe
        if (typeof pdfContainer !== 'undefined' && pdfContainer && pdfContainer.parentNode) {
            pdfContainer.parentNode.removeChild(pdfContainer);
        }
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
    
    if (!formData.estado) {
        errors.push('❌ El estado es obligatorio');
    }
    
    if (!formData.ubicacion || formData.ubicacion.trim() === '') {
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
    
    if (formData.ubicacion && formData.ubicacion.length < 3) {
        errors.push('⚠️ La ubicación debe tener al menos 3 caracteres');
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
        if (error.includes('estado')) {
            document.getElementById('estado')?.closest('.form-group')?.classList.add('validation-error');
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
window.replyToComment = replyToComment;
window.submitReply = submitReply;
window.cancelReply = cancelReply;

// Iniciar
checkAuth();