# Design QA — flechas de medidas del showroom

- Source visual truth: `C:\Users\User\AppData\Local\Temp\codex-clipboard-5aaf163c-0c6d-4e1f-8034-e0c063cefe71.png`, `C:\Users\User\AppData\Local\Temp\codex-clipboard-4c64f5e7-379a-4a10-bc65-cedecdf9863e.png` y `C:\Users\User\AppData\Local\Temp\codex-clipboard-b48508ed-d5cd-407b-8018-54621a2fdc52.png`
- Implementation screenshot: no disponible después del cambio; el navegador de automatización bloquea URLs `file://`.
- Viewport: recortes aportados por el usuario; viewport completo no disponible.
- Source pixels: 410 × 312, 360 × 360 y 363 × 356.
- Implementation pixels/CSS size/density: no capturados.
- State: showroom “Vasos”, pared simple, selecciones 4, 6 y 12 oz.

**Findings**

- [P1] En 4 oz no aparecía ningún indicador porque faltaba una entrada de dimensiones. Corregido habilitando diámetro y altura aproximados, claramente identificados como tales.
- [P1] En 6 y 12 oz aparecían las puntas y etiquetas, pero desaparecía la línea horizontal. Corregido reemplazando el borde subpíxel por una barra sólida de 3 px con contraste.
- [P2] La línea vertical dependía también de un borde escalado. Corregido con una barra sólida de 3 px para mantener consistencia entre tamaños.

**Required fidelity surfaces**

- Fonts and typography: sin cambios.
- Spacing and layout rhythm: se conservan posiciones; la etiqueta horizontal se separó 2 px adicionales de la línea.
- Colors and visual tokens: blanco con sombra oscura para contraste sobre cualquier color de vaso.
- Image quality and asset fidelity: los PNG existentes permanecen sin cambios.
- Copy and content: se agregó una aclaración traducida para las cotas aproximadas de 4 oz.

**Comparison history**

- Iteración 1: capturas mostraron ausencia total en 4 oz y líneas horizontales invisibles en 6 y 12 oz.
- Fixes: overlay habilitado en 4 oz; barras sólidas de 3 px para diámetro y altura; versión de caché incrementada.
- Post-fix visual evidence: bloqueada por la política del navegador para páginas `file://`.

**Implementation checklist**

- Recargar `index.html` con `Ctrl+F5`.
- Revisar 4, 6, 8 y 12 oz en el mismo viewport.
- Reemplazar la cota aproximada de 4 oz cuando se reciba la ficha específica del vaso.

final result: blocked
