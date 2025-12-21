// Configuración de Supabase
const { createClient } = supabase;
const supabaseClient = createClient(
    'https://mqxguprzpypcyyusvfrf.supabase.co',
    'sb_publishable_VoPfjSjRMUNNKLXjoI335g_ZR3zcUdm'
);

let currentUser = null;

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
    form.querySelector('button[type="submit"]').textContent = 'Guardar Entrada';
}

// Guardar entrada
async function handleBitacoraSubmit(e) {
    e.preventDefault();
    
    const fotoFiles = document.getElementById('fotos').files;
    let fotoUrls = [];
    
    // Subir fotos a Supabase Storage
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
    
    const form = document.getElementById('bitacoraForm');
    const editId = form.dataset.editId;
    
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
        alert(editId ? 'Entrada actualizada exitosamente' : 'Entrada guardada exitosamente');
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
        displayEntries(data);
    }
}

// Mostrar entradas
function displayEntries(entries) {
    const entriesList = document.getElementById('entriesList');
    entriesList.innerHTML = '';
    
    if (!entries || entries.length === 0) {
        entriesList.innerHTML = '<p>No hay entradas de bitácora aún.</p>';
        return;
    }
    
    // Crear tabla tipo Excel
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
            // Admin puede eliminar y editar todas las entradas
            actionButtons = `
                <button class="edit-btn" onclick="editEntry(${entry.id})">✏️</button>
                <button class="delete-btn" onclick="deleteEntry(${entry.id})">🗑️</button>
            `;
        } else if (entry.user_id === currentUser.id) {
            // Contratista solo puede editar sus propias entradas
            actionButtons = `<button class="edit-btn" onclick="editEntry(${entry.id})">✏️</button>`;
        } else {
            actionButtons = '<span class="no-delete">-</span>';
        }
        
        // Usar la nueva columna fecha_hora si existe, sino la fecha original
    const fechaUsar = entry.fecha_hora || entry.fecha;
    
    let fechaMostrar;
    let horaFormateada = '';
    
    if (fechaUsar.includes('T')) {
        // Es datetime-local: "2025-12-20T21:16"
        const [datePart, timePart] = fechaUsar.split('T');
        const [year, month, day] = datePart.split('-');
        const [hours, minutes] = timePart.split(':');
        
        // Crear fecha local
        fechaMostrar = new Date(year, month - 1, day, hours, minutes);
        horaFormateada = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    } else {
        // Es solo fecha: "2025-12-20"
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
    
    console.log(`Entry ID: ${entry.id}, Fecha_hora: ${entry.fecha_hora}, Fecha: ${entry.fecha}, Mostrando: ${fechaFormateada}`);
        row.dataset.fotos = JSON.stringify(entry.fotos || []);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    entriesList.appendChild(table);
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
    
    // Cambiar texto del botón
    form.querySelector('button[type="submit"]').textContent = 'Actualizar Entrada';
}

// Eliminar entrada
async function deleteEntry(entryId) {
    if (confirm('¿Estás seguro de que quieres eliminar esta entrada?')) {
        const { error } = await supabaseClient
            .from('bitacora')
            .delete()
            .eq('id', entryId);
        
        if (error) {
            alert('Error al eliminar la entrada');
        } else {
            await loadBitacoraEntries();
            alert('Entrada eliminada exitosamente');
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

// Iniciar
checkAuth();