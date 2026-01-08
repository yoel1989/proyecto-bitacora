# Script PowerShell para Exportar Presentación a PowerPoint
# Requiere: Microsoft Office PowerPoint instalado

# Importar módulo de PowerPoint COM
try {
    $pptApp = New-Object -ComObject PowerPoint.Application
    $pptApp.Visible = $true
} catch {
    Write-Host "Error: No se puede iniciar PowerPoint. Asegúrate de que PowerPoint esté instalado." -ForegroundColor Red
    exit 1
}

# Ruta de los archivos
$projectPath = "C:\Users\yoooe\OneDrive\Desktop\PROYECTO BITACORA"
$htmlFile = "$projectPath\presentacion_interactiva.html"
$markdownFile = "$projectPath\presentacion_bitacora.md"
$outputFile = "$projectPath\Bitacora_Obra_Presentacion.pptx"

Write-Host "Creando presentación PowerPoint desde archivos..." -ForegroundColor Green

# Crear nueva presentación
$presentation = $pptApp.Presentations.Add()

# Función para agregar diapositiva con texto
function Add-SlideWithContent($title, $content, $layout = "ppLayoutText") {
    $slide = $presentation.Slides.Add($presentation.Slides.Count + 1, [Microsoft.Office.Interop.PowerPoint.PpSlideLayout]::$layout)
    $slide.Shapes[1].TextFrame.TextRange.Text = $title
    if ($slide.Shapes[2]) {
        $slide.Shapes[2].TextFrame.TextRange.Text = $content
    }
    return $slide
}

# Agregar diapositivas principales del markdown
if (Test-Path $markdownFile) {
    $markdownContent = Get-Content $markdownFile -Raw
    
    # Dividir en secciones
    $sections = $markdownContent -split "---"
    
    foreach ($section in $sections) {
        if ($section.Trim() -ne "") {
            $lines = $section -split "`n"
            $title = ""
            $content = ""
            
            foreach ($line in $lines) {
                if ($line.StartsWith("# ")) {
                    $title = $line.Substring(2).Trim()
                } elseif ($line.Trim() -ne "" -and -not $line.StartsWith("#")) {
                    $content += $line + "`n"
                }
            }
            
            if ($title -ne "") {
                Add-SlideWithContent -title $title -content $content
            }
        }
    }
}

# Agregar diapositiva especial para pantallazos
$slideScreenshots = $presentation.Slides.Add($presentation.Slides.Count + 1, [Microsoft.Office.Interop.PowerPoint.PpSlideLayout]::ppLayoutTitleOnly)
$slideScreenshots.Shapes[1].TextFrame.TextRange.Text = "Pantallazos de la Aplicación"

# Agregar placeholder para capturas de pantalla
$placeholder = $slideScreenshots.Shapes.AddTextbox([Microsoft.Office.Core.MsoTextOrientation]::msoTextOrientationHorizontal, 100, 150, 600, 300)
$placeholder.TextFrame.TextRange.Text = "Aquí se pueden agregar pantallazos de:`n1. Login`n2. Dashboard`n3. Formulario`n4. Lista de entradas`n5. Comentarios`n6. Filtros"

# Agregar diapositiva de contacto
$contactSlide = Add-SlideWithContent -title "Contacto y Siguientes Pasos" -content "📧 Email: contacto@bitacoradigital.com`n🌐 Web: www.bitacoradigital.com`n📱 WhatsApp: +1 234 567 890`n`nPróximos Pasos:`n1. Agenda una demo personalizada`n2. Prueba gratuita 30 días`n3. Capacitación del equipo"

# Guardar presentación
$presentation.SaveAs($outputFile)
$presentation.Close()

Write-Host "✅ Presentación guardada exitosamente en: $outputFile" -ForegroundColor Green

# Preguntar si quiere abrir la presentación
$openPPT = Read-Host "¿Desea abrir la presentación ahora? (S/N)"
if ($openPPT -eq "S" -or $openPPT -eq "s") {
    Start-Process $outputFile
}

# Cerrar aplicación PowerPoint
$pptApp.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($pptApp) | Out-Null

Write-Host "📋 Proceso completado. La presentación está lista para usar." -ForegroundColor Cyan