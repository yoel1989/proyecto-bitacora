// Supabase client está configurado en config.js

let currentUser = null;
let allEntries = [];

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
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) {
            throw error;
        }
        
        currentUser = data.user;
        await getUserProfile();
        showMain();
        await loadBitacoraEntries();
        
    } catch (error) {
        document.getElementById('loginError').textContent = 'Error: ' + error.message;
    }
}

// Logout
async function handleLogout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    showLogin();
}

// Obtener perfil del usuario
async function getUserProfile() {
    if (!currentUser) return;
    
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (data) {
        currentUser.role = data.rol; // Guardar el rol
        // Usar email del auth de Supabase como fuente principal
        document.getElementById('userName').textContent = currentUser.email;
        document.getElementById('userRole').textContent = '(' + getRoleDisplayName(data.rol) + ')';
        console.log('👤 Usuario logueado:', currentUser.email, 'Rol:', data.rol);
    } else {
        currentUser.role = 'contratista'; // Rol por defecto
        document.getElementById('userName').textContent = currentUser.email;
        console.log('👤 Usuario sin perfil, usando email del auth:', currentUser.email);
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
        
        console.log('📍 Zona horaria detectada:', Intl.DateTimeFormat().resolvedOptions().timeZone);
        console.log('🕒 Fecha y hora local establecida:', localDateTime);
        console.log('⏰ Hora actual:', `${hours}:${minutes}`);
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
            console.log('⚠️ Advertencia: Los archivos existentes serán reemplazados');
        } else if (keepPhotosCheckbox && keepPhotosCheckbox.checked) {
            // Mantener archivos existentes y agregar nuevos si los hay
            archivoUrls = [...existingArchivos];
            console.log('ℹ️ Manteniendo archivos existentes:', existingArchivos.length, 'archivos');
        } else if (fotoFiles.length === 0) {
            // No hay archivos nuevos, mantener los existentes
            archivoUrls = [...existingArchivos];
            console.log('ℹ️ Sin archivos nuevos, manteniendo archivos existentes');
        } else {
            // Hay archivos nuevos y no se quiere mantener los existentes
            archivoUrls = [];
            console.log('⚠️ Archivos existentes eliminados, solo nuevos archivos se guardarán');
        }
        
        // Subir nuevos archivos si hay
        if (fotoFiles.length > 0) {
            const newArchivoUrls = [];
            for (let i = 0; i < fotoFiles.length; i++) {
                const file = fotoFiles[i];
                
                // Validar tipo de archivo
                const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 
                                  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
                
                if (!validTypes.includes(file.type) && !file.type.startsWith('image/')) {
                    console.error('Tipo de archivo no permitido:', file.type);
                    alert(`El archivo "${file.name}" no es un tipo permitido`);
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
                
                // Validar tipo de archivo
                const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 
                                  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
                
                if (!validTypes.includes(file.type) && !file.type.startsWith('image/')) {
                    console.error('Tipo de archivo no permitido:', file.type);
                    alert(`El archivo "${file.name}" no es un tipo permitido`);
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
    console.log('Fecha del input:', fechaInput);
    console.log('📍 Zona horaria actual:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    if (!fechaInput) {
        alert('⚠️ Por favor selecciona una fecha y hora');
        return;
    }
    
    // Guardar fecha completa con hora - convertir a ISO string para mantener zona horaria
    console.log('🕒 Fecha local original:', fechaInput);
    console.log('📍 Zona horaria actual:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    
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
        console.log('🔄 Manteniendo folio existente:', folio);
    } else {
        // Si es nueva entrada, generar folio nuevo
        folio = await generarFolioConsecutivo();
        console.log('🆕 Nuevo folio generado:', folio);
    }
    
    // Guardar directamente el datetime-local sin conversión UTC
    console.log('🕒 Fecha local original:', fechaInput);
    console.log('📍 Zona horaria actual:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    const formData = {
        folio: folio, // Agregar folio (existente o nuevo)
        user_id: currentUser.id,
        fecha: fechaInput, // Guardar directamente como datetime-local
        titulo: document.getElementById('titulo').value,
        descripcion: document.getElementById('descripcion').value,
        hora_inicio: document.getElementById('horaInicio').value,
        hora_final: document.getElementById('horaFinal').value,
        tipo_nota: document.getElementById('tipoNota').value,
        ubicacion: document.getElementById('ubicacion').value,
        estado: document.getElementById('estado').value,
        archivos: archivoUrls
    };
    
console.log('FormData a guardar:', formData);
    console.log('Archivos finales:', archivoUrls.length, 'archivos');
    
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
        console.log('✅ Entrada guardada en DB:', data);
        console.log('🕒 Fecha guardada en DB:', data[0]?.fecha);
        document.getElementById('bitacoraForm').reset();
        await loadBitacoraEntries();
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

// Cargar entradas
async function loadBitacoraEntries() {
    const { data, error } = await supabaseClient
        .from('bitacora')
        .select('*')
        .order('fecha', { ascending: false });
    
    if (error) {
        console.error('Error al cargar entradas:', error);
    } else {
        console.log('📥 Entradas cargadas desde DB:', data);
        data.forEach((entry, index) => {
            console.log(`📋 Entrada ${index}:`, {
                id: entry.id,
                titulo: entry.titulo,
                fecha: entry.fecha,
                tipo: typeof entry.fecha,
                longitud: entry.fecha?.length
            });
        });
        allEntries = data;
        
        // Buscar emails en la tabla profiles
        const userIds = [...new Set(data.map(entry => entry.user_id))];
        const userEmails = {};
        
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseClient
                .from('profiles')
                .select('id, email')
                .in('id', userIds);
            
            // Mapear los emails encontrados
            profiles.forEach(profile => {
                if (profile.email) {
                    userEmails[profile.id] = profile.email;
                }
            });
        }
        
        // Asignar emails a las entradas
        allEntries = data.map(entry => ({
            ...entry,
            profiles: {
                email: userEmails[entry.user_id] || entry.user_id
            }
        }));
        
        console.log('📋 Entradas procesadas con emails de profiles:', allEntries.length);
        console.log('📧 Emails mapeados:', userEmails);
        
        filterAndDisplayEntries();
    }
}

// Filtrar y mostrar entradas
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

// Actualizar contador de entradas
function updateEntriesCounter(entries) {
    const counter = document.getElementById('entriesCounter');
    if (counter) {
        const count = entries ? entries.length : 0;
        counter.innerHTML = `
            <span class="counter-number">${count}</span>
            <span class="counter-text">${count === 1 ? 'entrada' : 'entradas'}</span>
        `;
    }
}

// Mostrar entradas
function displayEntries(entries) {
    const entriesList = document.getElementById('entriesList');
    entriesList.innerHTML = '';
    
    // Actualizar contador
    updateEntriesCounter(entries);
    
    if (!entries || entries.length === 0) {
        entriesList.innerHTML = '<p>No hay entradas de bitácora aún.</p>';
        return;
    }

    // Detectar si es móvil y mostrar el formato apropiado
    console.log('Ancho de ventana:', window.innerWidth, 'Modo:', window.innerWidth <= 768 ? 'móvil' : 'desktop');
    if (window.innerWidth <= 768) {
        // Versión móvil: cards con botones en columna
        entries.forEach(entry => {
            const card = createMobileEntryCard(entry);
            entriesList.appendChild(card);
        });
    } else {
        // Versión desktop: tabla normal
        console.log('Usando createDesktopTable para desktop');
        const table = createDesktopTable(entries);
        entriesList.appendChild(table);
    }
}

// Crear tarjeta móvil
function createMobileEntryCard(entry) {
    const card = document.createElement('div');
    card.className = 'mobile-entry-card';
    
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
                // Si es imagen, mostrar miniatura
                archivosHtml += `<img src="${url}" class="mobile-foto" onclick="window.open('${url}', '_blank')" title="${name}" />`;
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
    
    // Admin puede editar y eliminar cualquier entrada
    if (currentUser.role === 'admin') {
        actionButtons = `
            <button class="mobile-action-btn mobile-edit-btn" onclick="editEntry(${entry.id})">✏️</button>
            <button class="mobile-action-btn mobile-delete-btn" onclick="deleteEntry(${entry.id})">🗑️</button>
        `;
    } 
    // Otros roles (interventoria, supervision, ordenador_gasto, contratista) solo pueden editar sus propias entradas
    else if (entry.user_id === currentUser.id) {
        actionButtons = `
            <button class="mobile-action-btn mobile-edit-btn" onclick="editEntry(${entry.id})">✏️</button>
        `;
    } else {
        actionButtons = '<span class="no-delete">-</span>';
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
    console.log('Creando tabla desktop con', entries.length, 'entradas');
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
                    // Si es imagen, mostrar miniatura
                    archivosHtml += `<img src="${url}" class="mini-photo" onclick="window.open('${url}', '_blank')" title="${name}" />`;
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
        
        // Admin puede editar y eliminar cualquier entrada
        if (currentUser.role === 'admin') {
            actionButtons = `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️</button>
                <button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️</button>
            `;
        } 
        // Otros roles (interventoria, supervision, ordenador_gasto, contratista) solo pueden editar sus propias entradas
        else if (entry.user_id === currentUser.id) {
            actionButtons = `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️</button>
            `;
        } else {
            actionButtons = '<span class="no-delete">-</span>';
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
    console.log('Buscando archivos para entryId:', entryId);
    
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
    console.log('Archivos encontrados:', archivos);
    
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
        console.log('Modal de archivos agregado');
    } else {
        console.log('No hay archivos para mostrar');
    }
}

// Mantener compatibilidad con función anterior
function showAllPhotos(entryId) {
    showAllArchivos(entryId);
}

// Editar entrada
async function editEntry(entryId) {
    const { data, error } = await supabaseClient
        .from('bitacora')
        .select('*')
        .eq('id', entryId)
        .single();
    
    if (error) {
        alert('Error al cargar la entrada para editar');
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
    
    // Ajustar altura de textareas según su contenido
    const tituloTextarea = document.getElementById('titulo');
    tituloTextarea.value = data.titulo;
    tituloTextarea.style.height = 'auto';
    tituloTextarea.style.height = tituloTextarea.scrollHeight + 'px';
    
    const descripcionTextarea = document.getElementById('descripcion');
    descripcionTextarea.value = data.descripcion || '';
    descripcionTextarea.style.height = 'auto';
    descripcionTextarea.style.height = descripcionTextarea.scrollHeight + 'px';
    
    document.getElementById('horaInicio').value = data.hora_inicio || '';
    document.getElementById('horaFinal').value = data.hora_final || '';
    document.getElementById('tipoNota').value = data.tipo_nota || '';
    
    const ubicacionTextarea = document.getElementById('ubicacion');
    ubicacionTextarea.value = data.ubicacion || '';
    ubicacionTextarea.style.height = 'auto';
    ubicacionTextarea.style.height = ubicacionTextarea.scrollHeight + 'px';
    
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
                await loadBitacoraEntries();
                showNotification('✅ Entrada eliminada exitosamente', 'success');
            }
        } catch (err) {
            showNotification('❌ Ocurrió un error inesperado', 'error');
        }
    }
}

// Verificar sesión
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        await getUserProfile();
        showMain();
        await loadBitacoraEntries();
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

// Función para auto-ajustar altura de textareas
function autoResize(textarea) {
    // Guardar el scroll actual
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(44, textarea.scrollHeight) + 'px';
    
    // Restaurar scroll para evitar saltos en móvil
    window.scrollTo(0, scrollTop);
}

// Event listeners
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('bitacoraForm').addEventListener('submit', handleBitacoraSubmit);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('newEntryBtn').addEventListener('click', showForm);
document.getElementById('cancelFormBtn').addEventListener('click', hideForm);

// Auto-ajustar textareas al escribir
document.getElementById('titulo')?.addEventListener('input', function() {
    autoResize(this);
});

document.getElementById('descripcion')?.addEventListener('input', function() {
    autoResize(this);
});

document.getElementById('ubicacion')?.addEventListener('input', function() {
    autoResize(this);
});

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

// Event listeners para filtros
document.getElementById('searchInput')?.addEventListener('input', filterAndDisplayEntries);
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
    filterAndDisplayEntries();
});

// Sistema de notificaciones
function showNotification(message, type = 'info') {
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
    `;
    
    if (type === 'success') {
        notification.style.background = 'linear-gradient(135deg, #27ae60, #229954)';
    } else if (type === 'error') {
        notification.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
    } else {
        notification.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Animaciones CSS
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
`;
document.head.appendChild(style);



// Función para generar folio consecutivo
async function generarFolioConsecutivo(resetear = false) {
    try {
        if (resetear) {
            // Reiniciar foliado - solo para desarrollo/despliegue
            console.log('🔄 Reiniciando foliado desde 0001');
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
        
        console.log('🔢 Nuevo folio generado:', nuevoFolio);
        return nuevoFolio;
    } catch (error) {
        console.error('Error en generarFolioConsecutivo:', error);
        return '0001'; // Fallback
    }
}

// Función para formatear fechas con zona horaria local
function formatearFechaLocal(fechaString) {
    if (!fechaString) return 'Fecha no disponible';
    
    console.log('🔍 Fecha original recibida:', fechaString);
    console.log('🔍 Tipo de dato:', typeof fechaString);
    
    const fecha = new Date(fechaString);
    if (isNaN(fecha.getTime())) {
        console.log('❌ Fecha inválida al crear Date');
        return 'Fecha inválida';
    }
    
    console.log('✅ Date object creado:', fecha);
    console.log('✅ Hora del Date:', fecha.getHours(), ':', fecha.getMinutes());
    
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
    console.log('🎯 Fecha formateada final:', resultado);
    
    return resultado;
}

// Función para descargar PDF
async function downloadPDF() {
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
        const canvas = await html2canvas(pdfContainer, {
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
            letterRendering: true
        });
        
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
        
        // Descargar el PDF
        pdf.save(nombreArchivo);
        
        // Limpiar
        document.body.removeChild(pdfContainer);
        
        showNotification('✅ PDF generado exitosamente', 'success');
        
    } catch (error) {
        console.error('Error al generar PDF:', error);
        showNotification('❌ Error al generar PDF', 'error');
    }
}

// Iniciar
checkAuth();