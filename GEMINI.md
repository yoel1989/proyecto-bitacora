# Bitácora de Obra - Guía de Desarrollo

## Convenciones de Interfaz Móvil

### Tarjetas de Entrada (Mobile Cards)
Las entradas en la versión móvil se generan mediante la función `createMobileEntryCard(entry)` en `app.js`.

- **Truncado de Descripción:** Las descripciones que superan los 100 caracteres se truncan y se les añade un enlace "Ver más" que abre el modal `openDescModal(text)`.
- **Identificación de Autor:** Se debe usar la clase CSS `mobile-author-email` en el elemento que muestra el correo del autor. Esto es crítico para que la función `updateExistingEntriesWithEmails` pueda actualizar el nombre/email del autor después de que se cargue en segundo plano.
- **Botones de Acción:** Los botones de acción (Responder, Editar, Eliminar) deben tener `flex: 1` para mantener un tamaño uniforme en el contenedor `.mobile-actions`.

## Estilos
- **Iconos de Comentarios:** El botón de "Responder" ya incluye el icono de la nube mediante CSS (`comments-buttons.css`). No añadir emojis manuales en el HTML/JS para evitar duplicados.
