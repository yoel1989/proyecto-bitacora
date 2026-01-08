// Versión temporal de loadComments sin perfiles para probar
async function loadCommentsSimple(bitacoraId) {
    try {
        console.log('🔍 Cargando comentarios SIMPLE para bitácora:', bitacoraId);
        
        // Primero intentar sin el join de perfiles
        const { data, error } = await supabaseClient
            .from('comentarios')
            .select('*')
            .eq('bitacora_id', bitacoraId)
            .order('created_at', { ascending: true });
        
        console.log('🔍 Respuesta comentarios SIMPLE:', { data, error });
        
        if (error) {
            console.error('Error cargando comentarios simples:', error);
            showNotification('❌ Error al cargar los comentarios: ' + error.message, 'error');
            return;
        }
        
        // Mostrar sin información de perfiles
        displayCommentsSimple(data || []);
        
    } catch (error) {
        console.error('Error inesperado cargando comentarios simples:', error);
        showNotification('❌ Error al cargar los comentarios', 'error');
    }
}

// Versión temporal de displayComments sin perfiles
function displayCommentsSimple(comments) {
    const commentsList = document.getElementById('commentsList');
    
    console.log('🔍 Mostrando comentarios SIMPLES:', comments);
    
    if (!comments || comments.length === 0) {
        commentsList.innerHTML = '<p class="no-comments">Aún no hay comentarios. ¡Sé el primero en comentar!</p>';
        console.log('🔍 No hay comentarios para mostrar');
        return;
    }
    
    console.log('🔍 Procesando', comments.length, 'comentarios simples');
    
    let commentsHtml = '';
    comments.forEach(comment => {
        console.log('🔍 Procesando comentario SIMPLE:', comment);
        
        const userEmail = 'Usuario'; // Simplificado temporalmente
        const userRole = 'desconocido';
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
                        <strong>${userEmail} (ID: ${comment.user_id})</strong>
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
            </div>
        `;
    });
    
    console.log('🔍 HTML SIMPLE generado:', commentsHtml);
    commentsList.innerHTML = commentsHtml;
}