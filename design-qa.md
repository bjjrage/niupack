# Design QA — sistema unificado de cotas

- Source visual truth: `C:\Users\User\AppData\Local\Temp\codex-clipboard-39163007-59f1-4aba-81a6-4acabc4b6f69.png`
- Implementation screenshot: no disponible después del cambio; el navegador de automatización bloquea URLs `file://`.
- Viewport: recorte aportado por el usuario; viewport completo no disponible.
- Source pixels: 672 × 416.
- Implementation pixels/CSS size/density: no capturados.
- State: showroom “Potes y bowls”, selección 3 oz.

**Findings**

- [P1] Las cotas usaban porcentajes manuales distintos y una caja vertical para activos horizontales. Esto producía distancias y longitudes incoherentes.
- [P1] Los bowls 3:2 se medían con una caja aproximada 1,35:1, desplazando especialmente la regla vertical.
- [P2] La longitud de las reglas no seguía el contorno visible del producto sino márgenes genéricos.

**Fixes implemented**

- Se calculó el contorno alfa de los 11 activos medidos: vasos de 4, 6, 8, 12, 16, 21 y 24 oz; bowls de 3, 5, 8 y 20 oz.
- La caja de cotas ahora replica matemáticamente `object-fit: contain` para lienzos 2:3, 3:2 y 1079:1457.
- La regla de diámetro queda siempre 4,5% por encima del borde superior, con 1,5% de extensión lateral.
- La regla de altura queda siempre 4,5% a la derecha y cubre exactamente el alto visible del producto.
- El sistema se recalcula al cambiar el tamaño de la ventana.

**Required fidelity surfaces**

- Fonts and typography: sin cambios.
- Spacing and layout rhythm: normalizado mediante un único sistema de márgenes relativos.
- Colors and visual tokens: sin cambios.
- Image quality and asset fidelity: se utilizan los contornos alfa de los PNG originales, sin modificar los activos.
- Copy and content: sin cambios.

**Comparison history**

- Iteración 1: la captura mostró reglas con separaciones y longitudes inconsistentes alrededor del bowl de 3 oz.
- Fix: sustitución completa del posicionamiento manual por geometría basada en contorno y relación de aspecto.
- Post-fix visual evidence: bloqueada por la política del navegador para páginas `file://`.

**Implementation checklist**

- Recargar `index.html` con `Ctrl+F5`.
- Revisar secuencialmente los 7 vasos y los 4 bowls en el mismo viewport.
- Enviar una captura posterior si se requiere un ajuste global del margen único.

final result: blocked
