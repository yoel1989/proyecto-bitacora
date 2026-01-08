-- Script para probar si los comentarios se guardan correctamente
-- Ejecuta esto en el Editor SQL para verificar

-- 1. Verificar si hay comentarios
SELECT 
    c.id,
    c.bitacora_id,
    c.user_id,
    c.comentario,
    c.created_at,
    p.email as usuario_email
FROM comentarios c
LEFT JOIN profiles p ON c.user_id = p.id
ORDER BY c.created_at DESC;

-- 2. Insertar un comentario de prueba manualmente
INSERT INTO comentarios (bitacora_id, user_id, comentario) 
VALUES (
    (SELECT id FROM bitacora LIMIT 1), -- Usar el primer ID de bitácora disponible
    (SELECT id FROM auth.users LIMIT 1), -- Usar el primer usuario disponible
    'Comentario de prueba - ' || NOW()
);

-- 3. Verificar si se insertó
SELECT * FROM comentarios ORDER BY created_at DESC LIMIT 1;