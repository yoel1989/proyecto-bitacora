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
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (data) {
        currentUser.role = data.rol; // Guardar el rol
        document.getElementById('userName').textContent = data.nombre || data.email;
        document.getElementById('userRole').textContent = '(' + data.rol + ')';
    } else {
        currentUser.role = 'contratista'; // Rol por defecto
    }
}

// Funciones del formulario
function showForm() {
    const formSection = document.getElementById('formSection');
    formSection.style.display = 'block';
    
    // Esperar un frame para asegurar que el elemento está visible
    requestAnimationFrame(() => {
        // Establecer fecha y hora actual primero
        const fechaInput = document.getElementById('fecha');
        if (fechaInput && !fechaInput.value) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            
            const localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
            fechaInput.value = localDateTime;
        }
        
        // Luego hacer scroll
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function hideForm() {
    const formSection = document.getElementById('formSection');
    const form = document.getElementById('bitacoraForm');
    
    formSection.style.display = 'none';
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
    let fotoUrls = [];
    
    if (editId) {
        // Estamos actualizando una entrada existente
        const existingPhotos = JSON.parse(form.dataset.existingPhotos || '[]');
        
        // Verificar si hay fotos nuevas y si el checkbox está marcado
        if (fotoFiles.length > 0 && keepPhotosCheckbox && !keepPhotosCheckbox.checked) {
            // No se mantiene fotos existentes y se suben nuevas
            console.log('⚠️ Advertencia: Las fotos existentes serán reemplazadas');
        } else if (keepPhotosCheckbox && keepPhotosCheckbox.checked) {
            // Mantener fotos existentes y agregar nuevas si las hay
            fotoUrls = [...existingPhotos];
            console.log('ℹ️ Manteniendo fotos existentes:', existingPhotos.length, 'fotos');
        } else if (fotoFiles.length === 0) {
            // No hay fotos nuevas, mantener las existentes
            fotoUrls = [...existingPhotos];
            console.log('ℹ️ Sin fotos nuevas, manteniendo fotos existentes');
        } else {
            // Hay fotos nuevas y no se quiere mantener las existentes
            fotoUrls = [];
            console.log('⚠️ Fotos existentes eliminadas, solo nuevas fotos se guardarán');
        }
        
        // Subir nuevas fotos si hay
        if (fotoFiles.length > 0) {
            const newFotoUrls = [];
            for (let i = 0; i < fotoFiles.length; i++) {
                const file = fotoFiles[i];
                // Limpiar el nombre del archivo para evitar caracteres problemáticos
                const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const fileName = `${Date.now()}_${cleanFileName}`;
                
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('fotos-obra')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });
                
                if (uploadError) {
                    console.error('Error subiendo foto:', uploadError);
                } else {
                    const { data: urlData } = supabaseClient.storage
                        .from('fotos-obra')
                        .getPublicUrl(fileName);
                    
                    newFotoUrls.push(urlData.publicUrl);
                }
            }
            
            if (keepPhotosCheckbox && keepPhotosCheckbox.checked) {
                // Agregar nuevas fotos a las existentes
                fotoUrls = [...fotoUrls, ...newFotoUrls];
            } else {
                // Reemplazar completamente con nuevas fotos
                fotoUrls = newFotoUrls;
            }
        }
    } else {
        // Es una nueva entrada, solo subir las fotos nuevas
        if (fotoFiles.length > 0) {
            for (let i = 0; i < fotoFiles.length; i++) {
                const file = fotoFiles[i];
                // Limpiar el nombre del archivo para evitar caracteres problemáticos
                const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const fileName = `${Date.now()}_${cleanFileName}`;
                
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('fotos-obra')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });
                
                if (uploadError) {
                    console.error('Error subiendo foto:', uploadError);
                } else {
                    const { data: urlData } = supabaseClient.storage
                        .from('fotos-obra')
                        .getPublicUrl(fileName);
                    
                    fotoUrls.push(urlData.publicUrl);
                }
            }
        }
    }
    
    const fechaInput = document.getElementById('fecha').value;
    console.log('Fecha del input:', fechaInput);
    
    // Guardar como string completo de datetime-local para preservar hora
    let fechaGuardada = fechaInput;
    
    const formData = {
        user_id: currentUser.id,
        fecha: fechaGuardada, // Mantener para compatibilidad
        fecha_hora: fechaInput, // Nueva columna con hora completa
        titulo: document.getElementById('titulo').value,
        descripcion: document.getElementById('descripcion').value,
        ubicacion: document.getElementById('ubicacion').value,
        estado: document.getElementById('estado').value,
        fotos: fotoUrls
    };
    
    console.log('FormData a guardar:', formData);
    console.log('Fecha guardada como UTC:', fechaGuardada);
    console.log('Fotos finales:', fotoUrls.length, 'fotos');
    
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
            .insert([formData]);
        
        data = insertData;
        error = insertError;
    }
    
    if (error) {
        console.error('Error guardando:', error);
        alert('Error al guardar: ' + error.message);
    } else {
        console.log('Entrada guardada en DB:', data);
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
        allEntries = data;
        filterAndDisplayEntries();
    }
}

// Filtrar y mostrar entradas
function filterAndDisplayEntries() {
    let filteredEntries = [...allEntries];
    
    // Filtrar por búsqueda
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (searchTerm) {
        filteredEntries = filteredEntries.filter(entry => 
            entry.titulo.toLowerCase().includes(searchTerm) ||
            (entry.descripcion && entry.descripcion.toLowerCase().includes(searchTerm))
        );
    }
    
    // Filtrar por estado
    const estadoFilter = document.getElementById('estadoFilter').value;
    if (estadoFilter) {
        filteredEntries = filteredEntries.filter(entry => entry.estado === estadoFilter);
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
    if (window.innerWidth <= 768) {
        // Versión móvil: cards con botones en columna
        entries.forEach(entry => {
            const card = createMobileEntryCard(entry);
            entriesList.appendChild(card);
        });
    } else {
        // Versión desktop: tabla normal
        const table = createDesktopTable(entries);
        entriesList.appendChild(table);
    }
}

// Crear tarjeta móvil
function createMobileEntryCard(entry) {
    const card = document.createElement('div');
    card.className = 'mobile-entry-card';
    
    // Formatear fecha
    const fechaUsar = entry.fecha_hora || entry.fecha;
    let fechaMostrar;
    let horaFormateada = '';
    
    if (fechaUsar.includes('T')) {
        const [datePart, timePart] = fechaUsar.split('T');
        const [year, month, day] = datePart.split('-');
        const [hours, minutes] = timePart.split(':');
        fechaMostrar = new Date(year, month - 1, day, hours, minutes);
        horaFormateada = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    } else {
        fechaMostrar = new Date(fechaUsar + 'T00:00:00');
        horaFormateada = '00:00';
    }
    const fechaFormateada = `${String(fechaMostrar.getDate()).padStart(2, '0')}/${String(fechaMostrar.getMonth() + 1).padStart(2, '0')}/${fechaMostrar.getFullYear()} ${horaFormateada}`;
    
    // Generar HTML de fotos
    let fotosHtml = '';
    if (entry.fotos && entry.fotos.length > 0) {
        fotosHtml = `
            <div class="mobile-fotos-container">
                ${entry.fotos.slice(0, 5).map(url => `
                    <img src="${url}" class="mobile-foto" onclick="window.open('${url}', '_blank')" />
                `).join('')}
                ${entry.fotos.length > 5 ? `
                    <span class="mobile-more-photos" onclick="showAllPhotos('${entry.id}')">
                        +${entry.fotos.length - 5}
                    </span>
                ` : ''}
            </div>
        `;
    } else {
        fotosHtml = '<div class="no-fotos-mobile">Sin fotos</div>';
    }
    
    // Generar botones de acción
    let actionButtons = '';
    if (currentUser.role === 'admin') {
        actionButtons = `
            <button class="mobile-action-btn mobile-edit-btn" onclick="editEntry(${entry.id})">✏️</button>
            <button class="mobile-action-btn mobile-delete-btn" onclick="deleteEntry(${entry.id})">🗑️</button>
        `;
    } else if (entry.user_id === currentUser.id) {
        actionButtons = `<button class="mobile-action-btn mobile-edit-btn" onclick="editEntry(${entry.id})">✏️</button>`;
    }
    
    card.innerHTML = `
        <div class="mobile-entry-header">
            <div class="mobile-entry-date">${fechaFormateada}</div>
            <span class="entry-state state-${entry.estado}">${entry.estado}</span>
        </div>
        
        <div class="mobile-entry-title">${entry.titulo}</div>
        
        ${entry.descripcion ? `
            <div class="mobile-entry-description">${entry.descripcion}</div>
        ` : ''}
        
        ${entry.ubicacion ? `
            <div class="mobile-entry-row">
                <div class="mobile-entry-label">Ubicación:</div>
                <div class="mobile-entry-content">${entry.ubicacion}</div>
            </div>
        ` : ''}
        
        <div class="mobile-entry-row">
            <div class="mobile-entry-label">Usuario:</div>
            <div class="mobile-entry-content">${currentUser ? currentUser.email : 'Usuario desconocido'}</div>
        </div>
        
        ${fotosHtml}
        
        ${actionButtons ? `
            <div class="mobile-actions">
                <div class="mobile-actions-container">${actionButtons}</div>
            </div>
        ` : ''}
    `;
    
    return card;
}

// Crear tabla unificada
function createUnifiedTable(entries) {
    const table = document.createElement('table');
    table.className = 'excel-table';
    
    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Fecha y Hora</th>
            <th>Título</th>
            <th>Descripción</th>
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
        
        let fotosHtml = '';
        if (entry.fotos && entry.fotos.length > 0) {
            fotosHtml = `
                <div class="fotos-container">
                    ${entry.fotos.slice(0, 3).map(url => `
                        <img src="${url}" class="mini-photo" onclick="window.open('${url}', '_blank')" />
                    `).join('')}
                    ${entry.fotos.length > 3 ? `
                        <span class="more-photos" onclick="showAllPhotos('${entry.id}')" title="Ver todas las fotos">
                            +${entry.fotos.length - 3}
                        </span>
                    ` : ''}
                </div>
            `;
        } else {
            fotosHtml = '<span class="no-photos">Sin fotos</span>';
        }
        
        // Botones de acción según rol
        let actionButtons = '';
        
        if (currentUser.role === 'admin') {
            actionButtons = `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️</button>
                <button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️</button>
            `;
        } else if (entry.user_id === currentUser.id) {
            actionButtons = `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️</button>
                <button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️</button>
            `;
        } else {
            actionButtons = '<span class="no-delete">-</span>';
        }
        
        // Formatear fecha
        const fechaUsar = entry.fecha_hora || entry.fecha;
        let fechaMostrar;
        let horaFormateada = '';
        
        if (fechaUsar.includes('T')) {
            const [datePart, timePart] = fechaUsar.split('T');
            const [year, month, day] = datePart.split('-');
            const [hours, minutes] = timePart.split(':');
            fechaMostrar = new Date(year, month - 1, day, hours, minutes);
            horaFormateada = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
        } else {
            fechaMostrar = new Date(fechaUsar + 'T00:00:00');
            horaFormateada = '00:00';
        }
        const fechaFormateada = `${String(fechaMostrar.getDate()).padStart(2, '0')}/${String(fechaMostrar.getMonth() + 1).padStart(2, '0')}/${fechaMostrar.getFullYear()} ${horaFormateada}`;
        
        row.innerHTML = `
            <td>${fechaFormateada}</td>
            <td>${entry.titulo}</td>
            <td>${entry.descripcion || ''}</td>
            <td>${entry.ubicacion || ''}</td>
            <td><span class="entry-state state-${entry.estado}">${entry.estado}</span></td>
            <td>${currentUser ? currentUser.email : 'Usuario desconocido'}</td>
            <td>${fotosHtml}</td>
            <td>${actionButtons}</td>
        `;
        
        row.dataset.fotos = JSON.stringify(entry.fotos || []);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    return table;
}

// Crear tabla desktop
function createDesktopTable(entries) {
    const table = document.createElement('table');
    table.className = 'excel-table desktop-table';
    
    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Fecha y Hora</th>
            <th>Título</th>
            <th>Descripción</th>
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
        
        let fotosHtml = '';
        if (entry.fotos && entry.fotos.length > 0) {
            fotosHtml = `
                <div class="fotos-container">
                    ${entry.fotos.slice(0, 3).map(url => `
                        <img src="${url}" class="mini-photo" onclick="window.open('${url}', '_blank')" />
                    `).join('')}
                    ${entry.fotos.length > 3 ? `
                        <span class="more-photos" onclick="showAllPhotos('${entry.id}')" title="Ver todas las fotos">
                            +${entry.fotos.length - 3}
                        </span>
                    ` : ''}
                </div>
            `;
        } else {
            fotosHtml = '<span class="no-photos">Sin fotos</span>';
        }
        
        // Botones de acción según rol
        let actionButtons = '';
        
        if (currentUser.role === 'admin') {
            actionButtons = `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️</button>
                <button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️</button>
            `;
        } else if (entry.user_id === currentUser.id) {
            actionButtons = `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️</button>
                <button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️</button>
            `;
        } else {
            actionButtons = '<span class="no-delete">-</span>';
        }
        
        // Formatear fecha
        const fechaUsar = entry.fecha_hora || entry.fecha;
        let fechaMostrar;
        let horaFormateada = '';
        
        if (fechaUsar.includes('T')) {
            const [datePart, timePart] = fechaUsar.split('T');
            const [year, month, day] = datePart.split('-');
            const [hours, minutes] = timePart.split(':');
            fechaMostrar = new Date(year, month - 1, day, hours, minutes);
            horaFormateada = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
        } else {
            fechaMostrar = new Date(fechaUsar + 'T00:00:00');
            horaFormateada = '00:00';
        }
        const fechaFormateada = `${String(fechaMostrar.getDate()).padStart(2, '0')}/${String(fechaMostrar.getMonth() + 1).padStart(2, '0')}/${fechaMostrar.getFullYear()} ${horaFormateada}`;
        
        row.innerHTML = `
            <td>${fechaFormateada}</td>
            <td>${entry.titulo}</td>
            <td>${entry.descripcion || ''}</td>
            <td>${entry.ubicacion || ''}</td>
            <td><span class="entry-state state-${entry.estado}">${entry.estado}</span></td>
            <td>${currentUser ? currentUser.email : 'Usuario desconocido'}</td>
            <td>${fotosHtml}</td>
            <td>${actionButtons}</td>
        `;
        
        row.dataset.fotos = JSON.stringify(entry.fotos || []);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    return table;
}

// Mostrar todas las fotos de una entrada
function showAllPhotos(entryId) {
    console.log('Buscando fotos para entryId:', entryId);
    
    // Buscar la fila correcta
    const rows = document.querySelectorAll('.excel-table tbody tr');
    let targetRow = null;
    
    for (let row of rows) {
        const editBtn = row.querySelector('.edit-btn');
        if (editBtn && editBtn.getAttribute('onclick') && editBtn.getAttribute('onclick').includes(entryId.toString())) {
            targetRow = row;
            break;
        }
    }
    
    if (!targetRow) {
        console.error('No se encontró la fila para entryId:', entryId);
        return;
    }
    
    const fotos = JSON.parse(targetRow.dataset.fotos || '[]');
    console.log('Fotos encontradas:', fotos);
    
    if (fotos.length > 0) {
        const modal = document.createElement('div');
        modal.className = 'photo-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Todas las fotos (${fotos.length})</h3>
                    <button class="close-modal" onclick="this.closest('.photo-modal').remove()">✕</button>
                </div>
                <div class="photos-grid">
                    ${fotos.map(url => `
                        <img src="${url}" onclick="window.open('${url}', '_blank')" />
                    `).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        console.log('Modal agregado');
    } else {
        console.log('No hay fotos para mostrar');
    }
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
    
    // Llenar formulario con datos existentes
    document.getElementById('fecha').value = data.fecha;
    document.getElementById('titulo').value = data.titulo;
    document.getElementById('descripcion').value = data.descripcion || '';
    document.getElementById('ubicacion').value = data.ubicacion || '';
    document.getElementById('estado').value = data.estado;
    
    // Cambiar el comportamiento del formulario para actualizar
    const form = document.getElementById('bitacoraForm');
    form.dataset.editId = entryId;
    
    // Guardar fotos existentes para referencia
    form.dataset.existingPhotos = JSON.stringify(data.fotos || []);
    
    // Cambiar texto del botón y estilo
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Actualizar Entrada';
    submitBtn.classList.add('update-mode');
    
    // Ocultar preview de fotos al editar
    document.getElementById('photoPreview').style.display = 'none';
    
    // Mostrar advertencia de actualización si hay fotos existentes
    const updateWarning = document.getElementById('updateWarning');
    if (data.fotos && data.fotos.length > 0) {
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

// Event listeners
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('bitacoraForm').addEventListener('submit', handleBitacoraSubmit);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('newEntryBtn').addEventListener('click', showForm);
document.getElementById('cancelFormBtn').addEventListener('click', hideForm);

// Preview de fotos
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
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const item = document.createElement('div');
                    item.className = 'photo-preview-item';
                    item.innerHTML = `<img src="${e.target.result}" alt="Foto ${index + 1}">`;
                    grid.appendChild(item);
                };
                reader.readAsDataURL(file);
            }
        });
        
        // Si estamos en modo edición, actualizar el texto informativo
        const photoInfo = preview.querySelector('.photo-info');
        if (isEditMode && photoInfo) {
            const keepPhotosCheckbox = document.getElementById('keepPhotosCheckbox');
            if (keepPhotosCheckbox && keepPhotosCheckbox.checked) {
                photoInfo.textContent = `ℹ️ ${files.length} fotos nuevas se agregarán a las existentes`;
            } else {
                photoInfo.textContent = `⚠️ ${files.length} fotos nuevas reemplazarán las fotos existentes`;
            }
        }
    } else {
        preview.style.display = 'none';
        
        // Restaurar texto original si no hay fotos
        const photoInfo = preview.querySelector('.photo-info');
        if (photoInfo) {
            photoInfo.textContent = 'ℹ️ Las fotos seleccionadas se agregarán al guardar';
        }
    }
});

// Event listeners para filtros
document.getElementById('searchInput')?.addEventListener('input', filterAndDisplayEntries);
document.getElementById('estadoFilter')?.addEventListener('change', filterAndDisplayEntries);
document.getElementById('fechaFilter')?.addEventListener('change', filterAndDisplayEntries);
document.getElementById('clearFilters')?.addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('estadoFilter').value = '';
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

// Event listener para resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        filterAndDisplayEntries(); // Recargar las entradas con el formato apropiado
    }, 250);
});

// Iniciar
checkAuth();